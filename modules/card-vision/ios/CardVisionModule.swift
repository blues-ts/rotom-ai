import ExpoModulesCore
import Vision
import CoreML
import CoreImage
import ImageIO
import Accelerate

// On-device card recognition: a trained Core ML embedding model
// (assets/CardEmbedder.mlmodelc, built by playground/rotom-ai-model) turns a
// card crop into an L2-normalised vector, matched by cosine against a
// precomputed index of the whole catalog (~45k cards) kept in one flat Float
// buffer — a tight vDSP loop. Only {id, score} crosses the bridge.
//
// The index MUST be built by the same model (rev below): vectors from
// different embedders are not comparable, so mismatched indexes are refused
// at load rather than silently producing garbage matches.

// Query resize must match the training pipeline's squash-resize (and the
// index builder's), or distances are meaningless.
private let cropAndScaleOption: VNImageCropAndScaleOption = .scaleFill

// Manifest `rev` semantics: >= 1000 is a trained embedding model revision
// (bumped on retrain; index + .mlmodelc always ship as a matched pair). Revs
// < 1000 were Apple Vision FeaturePrint (removed) — those indexes are refused.
private let customModelRevFloor = 1000

private struct VisionError: Error, CustomStringConvertible {
  let description: String
}

private struct Manifest: Codable {
  let rev: Int
  let dim: Int
  let count: Int
  let ids: [String]
}

public class CardVisionModule: Module {
  private var ids: [String] = []
  private var matrix: [Float] = []   // flat, row-major (count * dim), L2-normalised
  private var dim: Int = 0
  private var count: Int = 0
  private var loadedRev: Int = -1
  // Rolling buffer of recent query embeddings for holo-glare smoothing.
  private var recent: [[Float]] = []
  // Guards the index state (ids/matrix/dim/count/loadedRev) and the smoothing
  // buffer. Async functions (loads, identify) run on the module's default
  // serial queue, but the sync getters (isLoaded/loadedRev/loadedCount) and
  // resetSmoothing arrive on the JS thread. Snapshots under the lock are
  // cheap: loads REPLACE the arrays (never mutate in place), so a read is a
  // COW retain, not a copy.
  private let stateLock = NSLock()
  // One shared context — creation is expensive and CIContext is thread-safe.
  // The binder grid renders up to 9 crops per shutter; per-call contexts waste
  // hundreds of ms.
  private let ciContext = CIContext()
  // Trained embedder, loaded once on demand (rev >= customModelRevFloor
  // indexes). MLModel prediction is thread-safe, so binder-mode's
  // concurrentPerform shares this instance; the lock only guards creation.
  private var coreMLModel: VNCoreMLModel?
  private let coreMLLock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("CardVision")

    Function("isLoaded") { () -> Bool in
      self.hasIndex()
    }

    // Model revision of the loaded index (-1 when none).
    Function("loadedRev") { () -> Int in
      self.loadedState().rev
    }

    Function("loadedCount") { () -> Int in
      self.loadedState().count
    }

    // Load a binary index already on disk: `<...>.manifest.json` + a Float16
    // `.f16` matrix. Returns the number of cards loaded.
    AsyncFunction("loadIndexFromFile") { (manifestUri: String, f16Uri: String) -> Int in
      try self.loadFromDisk(manifestPath: self.stripScheme(manifestUri),
                            f16Path: self.stripScheme(f16Uri))
    }

    // Load the bundled index shipped with the app — the only index source.
    // Catalog updates ship as app updates with a newer bundled index; there is
    // no server download path. Returns count 0 + source "none" when the build
    // has no usable bundled index (or it's a legacy FeaturePrint one).
    AsyncFunction("loadBestLocal") { () -> [String: Any] in
      guard let b = self.bundledIndexPaths(),
            let v = self.versionAt(manifestPath: b.manifest),
            v.rev >= customModelRevFloor else {
        return ["count": 0, "rev": -1, "source": "none"]
      }
      let n = try self.loadFromDisk(manifestPath: b.manifest, f16Path: b.f16)
      return ["count": n, "rev": self.loadedState().rev, "source": "bundled"]
    }

    // Load from in-memory arrays (small/dev path). `flat` is ids.count * dim.
    AsyncFunction("loadIndex") { (ids: [String], flat: [Double], dim: Int) in
      guard dim > 0, ids.count * dim == flat.count else {
        throw VisionError(description: "Index shape mismatch: \(ids.count) × \(dim) ≠ \(flat.count)")
      }
      let floats = flat.map { Float($0) }
      self.stateLock.lock()
      self.ids = ids
      self.dim = dim
      self.count = ids.count
      self.matrix = floats
      self.stateLock.unlock()
    }

    // Embed a captured photo and return the top-N matches. `crop` runs card
    // rectangle detection + perspective correction first (recommended for live
    // photos, which include background around the card).
    AsyncFunction("identify") { (uri: String, topN: Int, crop: Bool) -> [[String: Any]] in
      guard self.hasIndex() else { throw VisionError(description: "Index not loaded") }
      guard let query = self.embed(path: self.stripScheme(uri), crop: crop) else {
        throw VisionError(description: "Failed to embed image")
      }
      return self.topMatches(query: query, k: topN).map {
        ["id": $0.id, "score": Double($0.score)]
      }
    }

    // Identify within an on-screen region of interest (the scan guide box). x/y/w/h
    // are fractions of the camera PREVIEW (0..1, origin top-left). `previewAspect`
    // is the preview's width/height — needed to undo the preview's center-crop so
    // the box maps to the right pixels of the full captured photo. Crops to the
    // box, then refines with rectangle detection before embedding.
    AsyncFunction("identifyInRegion") {
      (uri: String, x: Double, y: Double, w: Double, h: Double,
       previewAspect: Double, topN: Int) -> [[String: Any]] in
      guard self.hasIndex() else { throw VisionError(description: "Index not loaded") }
      guard let cg = self.loadUprightForPreview(self.stripScheme(uri),
                                                previewAspect: previewAspect) else {
        throw VisionError(description: "Failed to load image")
      }
      let region = self.cropToPreviewRegion(
        cg, nx: x, ny: y, nw: w, nh: h, previewAspect: previewAspect) ?? cg
      guard let query = self.embedCGImage(region, crop: true) else {
        throw VisionError(description: "Failed to embed image")
      }
      return self.topMatches(query: query, k: topN).map {
        ["id": $0.id, "score": Double($0.score)]
      }
    }

    // Like identifyInRegion, but matches the AVERAGE of the last `window` frame
    // embeddings. Holo glare moves frame-to-frame, so averaging cancels much of
    // the specular noise and pulls the result toward the matte art — far more
    // reliable on foils. The buffer auto-resets when the scene changes a lot
    // (new card / camera moved away).
    AsyncFunction("identifyInRegionSmoothed") {
      (uri: String, x: Double, y: Double, w: Double, h: Double,
       previewAspect: Double, topN: Int, window: Int) -> [[String: Any]] in
      guard self.hasIndex() else { throw VisionError(description: "Index not loaded") }
      guard let cg = self.loadUprightForPreview(self.stripScheme(uri),
                                                previewAspect: previewAspect) else {
        throw VisionError(description: "Failed to load image")
      }
      let region = self.cropToPreviewRegion(
        cg, nx: x, ny: y, nw: w, nh: h, previewAspect: previewAspect) ?? cg
      guard let v = self.embedCGImage(region, crop: true) else {
        throw VisionError(description: "Failed to embed image")
      }

      // Scene-change guard: if this frame barely resembles the running average,
      // the card/scene changed — start the buffer over so we don't blend cards.
      // Locked: resetSmoothing mutates the buffer from the JS thread.
      self.stateLock.lock()
      if let last = self.recent.last {
        var s: Float = 0
        let n = min(last.count, v.count)
        for i in 0..<n { s += last[i] * v[i] }
        if s < 0.55 { self.recent.removeAll() }
      }
      self.recent.append(v)
      let cap = max(1, window)
      if self.recent.count > cap { self.recent.removeFirst(self.recent.count - cap) }
      let frames = self.recent
      self.stateLock.unlock()

      let avg = self.normalised(self.averageVectors(frames))
      return self.topMatches(query: avg, k: topN).map {
        ["id": $0.id, "score": Double($0.score)]
      }
    }

    // Clear the smoothing buffer (call when starting a fresh scan session).
    Function("resetSmoothing") {
      self.stateLock.lock()
      self.recent.removeAll()
      self.stateLock.unlock()
    }

    // Read text off a card via on-device OCR (VNRecognizeTextRequest). Crops to
    // the same preview region as identify, refines to the card rectangle, then
    // recognises the BOTTOM strip (where the collector number lives) and the TOP
    // strip (card name / set — used later for EN-vs-JA disambiguation). Returns
    // the raw recognised lines per strip; ALL parsing/normalisation is done in JS
    // so the matching can be tuned without a native rebuild.
    AsyncFunction("readCardText") {
      (uri: String, x: Double, y: Double, w: Double, h: Double,
       previewAspect: Double) -> [String: Any] in
      guard let cg = self.loadUprightForPreview(self.stripScheme(uri),
                                                previewAspect: previewAspect) else {
        throw VisionError(description: "Failed to load image")
      }
      let region = self.cropToPreviewRegion(
        cg, nx: x, ny: y, nw: w, nh: h, previewAspect: previewAspect) ?? cg
      // Refine to the card so the strips line up with the print layout. Fall back
      // to the region itself if rectangle detection fails on this frame.
      let card = self.detectAndCrop(region) ?? region
      // Bottom = collector number: Latin/digits only, so JA recognition can't
      // mangle "123/198". Top = name: include Japanese so EN-vs-JA prints are
      // separable by the script the OCR actually returns.
      return [
        "bottom": self.ocrStrip(card, yFrac: 0.80, hFrac: 0.20, languages: ["en-US"]),
        "top": self.ocrStrip(card, yFrac: 0.0, hFrac: 0.18, languages: ["ja", "en-US"]),
      ]
    }

    // Detect every card-shaped rectangle in the frame and identify each — no
    // grid assumption, so cards can sit anywhere (binder pockets, a table
    // spread, a fanned hand). Region args are preview fractions like
    // identifyInRegion. Returns one entry per detected card in row-major
    // reading order: {rect: {x,y,w,h} normalized to the analyzed frame with
    // origin TOP-left (so JS can place review tiles over the photo), matches:
    // [{id, score}]}. Spurious quads embed background and score near zero —
    // thresholding/filtering is JS's job so tuning needs no native rebuild.
    AsyncFunction("identifyCardsInFrame") {
      (uri: String, x: Double, y: Double, w: Double, h: Double,
       previewAspect: Double, maxCards: Int, topN: Int) -> [String: Any] in
      guard self.hasIndex() else { throw VisionError(description: "Index not loaded") }
      guard let cg = self.loadUprightForPreview(self.stripScheme(uri),
                                                previewAspect: previewAspect) else {
        throw VisionError(description: "Failed to load image")
      }
      let frame = self.cropToPreviewRegion(
        cg, nx: x, ny: y, nw: w, nh: h, previewAspect: previewAspect) ?? cg

      // One detection candidate: the observation, the image it was detected in
      // (for the perspective crop), and its bounds normalized to the FRAME
      // (Vision bottom-left coords) for dedupe/ordering/reporting.
      struct Cand {
        let source: CGImage
        let obs: VNRectangleObservation
        let rect: CGRect
      }

      // MULTI-PASS detection. VNDetectRectanglesRequest is tuned to find THE
      // document in a scene — regardless of maximumObservations its internal
      // suppression returns only the few most prominent rectangles, so a full
      // 9-card page loses most of its cards (~4 was the practical ceiling).
      // Detecting on the whole frame PLUS overlapping sub-tiles (four corners
      // + center, each ~58% of the frame) keeps every pass in the ~4-cards
      // regime where the detector performs; overlaps are deduped below.
      var cands: [Cand] = []
      for obs in self.detectQuads(frame, minSize: 0.15, maxObs: max(1, maxCards)) {
        cands.append(Cand(source: frame, obs: obs, rect: obs.boundingBox))
      }
      let fw = Double(frame.width), fh = Double(frame.height)
      let t = 0.58 // tile side as a fraction of the frame
      let tileOrigins: [(Double, Double)] = [
        (0, 0), (1 - t, 0), (0, 1 - t), (1 - t, 1 - t),
        ((1 - t) / 2, (1 - t) / 2),
      ]
      for (ox, oy) in tileOrigins {
        // ox/oy are top-left normalized; CGImage cropping is top-left too.
        let px = CGRect(x: ox * fw, y: oy * fh, width: t * fw, height: t * fh)
          .integral
          .intersection(CGRect(x: 0, y: 0, width: fw, height: fh))
        guard !px.isNull, let tile = frame.cropping(to: px) else { continue }
        let tw = Double(px.width), th = Double(px.height)
        // A card fills a large share of a tile — a higher floor cuts junk.
        for obs in self.detectQuads(tile, minSize: 0.25, maxObs: 6) {
          let bb = obs.boundingBox
          // Tile-normalized (bottom-left) → frame-normalized (bottom-left).
          // The tile's bottom edge in bottom-left frame coords:
          let tileBottom = (fh - (Double(px.minY) + th)) / fh
          let rect = CGRect(
            x: (Double(px.minX) + bb.minX * tw) / fw,
            y: tileBottom + bb.minY * (th / fh),
            width: bb.width * (tw / fw),
            height: bb.height * (th / fh)
          )
          cands.append(Cand(source: tile, obs: obs, rect: rect))
        }
      }

      // The same card found by several passes (and a sleeve edge around the
      // card edge inside it) produce heavily-overlapping quads — keep only the
      // highest-confidence one of any overlapping cluster.
      cands.sort { $0.obs.confidence > $1.obs.confidence }
      var kept: [Cand] = []
      for c in cands {
        let dup = kept.contains { k in
          let i = k.rect.intersection(c.rect)
          guard !i.isNull else { return false }
          let inter = i.width * i.height
          let union = k.rect.width * k.rect.height
            + c.rect.width * c.rect.height - inter
          return union > 0 && inter / union > 0.45
        }
        if !dup { kept.append(c) }
      }
      if kept.count > maxCards { kept = Array(kept.prefix(maxCards)) }

      // Row-major reading order. Vision's origin is bottom-left; flip to
      // top-left. Two cards share a row when their centers are within half the
      // tallest card's height.
      let rowTol = (kept.map { $0.rect.height }.max() ?? 0.2) * 0.5
      kept.sort {
        let ay = 1 - $0.rect.midY, by = 1 - $1.rect.midY
        if abs(ay - by) > rowTol { return ay < by }
        return $0.rect.midX < $1.rect.midX
      }

      // Detections are independent: perspective-correct + embed + match each
      // in parallel (bounded by core count). Sources/`matrix`/`ids` are
      // read-only here and Vision handlers are per-call; the lock covers the
      // only shared write.
      var results = [[String: Any]](repeating: [:], count: kept.count)
      let lock = NSLock()
      DispatchQueue.concurrentPerform(iterations: kept.count) { i in
        let c = kept[i]
        var matches: [[String: Any]] = []
        // The quad IS the card — no second detection pass inside the crop.
        // Corners are normalized to `source`, so cropping from `source` is
        // exact even for tile detections.
        if let card = self.perspectiveCrop(c.source, quad: c.obs),
           let v = self.embedCGImage(card, crop: false) {
          matches = self.topMatches(query: v, k: topN).map {
            ["id": $0.id, "score": Double($0.score)]
          }
        }
        let bb = c.rect
        lock.lock()
        results[i] = [
          "rect": [
            "x": Double(bb.minX), "y": Double(1 - bb.maxY),
            "w": Double(bb.width), "h": Double(bb.height),
          ],
          "matches": matches,
        ]
        lock.unlock()
      }
      // Hand back the exact frame that was analyzed so the review overlay can
      // display it — the raw capture's orientation metadata never enters the
      // UI path.
      let photoUri = self.writeTempJPEG(frame).map { "file://" + $0 } ?? ""
      return ["photoUri": photoUri, "cards": results]
    }
  }

  /// Recognise text in a horizontal strip of an upright card image. `yFrac`/`hFrac`
  /// are fractions of the card height (origin top-left). `languages` is the
  /// recognition-language priority. Returns the best line per observation. Language
  /// correction is OFF — we want raw alphanumerics like "123/198" or "TG02", not
  /// dictionary-"corrected" words.
  private func ocrStrip(
    _ cg: CGImage, yFrac: CGFloat, hFrac: CGFloat, languages: [String]
  ) -> [String] {
    let iw = CGFloat(cg.width), ih = CGFloat(cg.height)
    guard iw > 1, ih > 1 else { return [] }
    let rect = CGRect(x: 0, y: ih * yFrac, width: iw, height: ih * hFrac)
      .integral
      .intersection(CGRect(x: 0, y: 0, width: iw, height: ih))
    guard !rect.isNull, rect.width > 1, rect.height > 1,
          let cropped = cg.cropping(to: rect) else { return [] }
    // The collector number is tiny relative to the strip. Upscale short strips so
    // its digits clear the recogniser's minimum text height, and recognise small
    // text explicitly. Big help on foil/full-art cards where the number is faint.
    let strip = self.upscaled(cropped, minHeight: 720) ?? cropped
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = false
    req.recognitionLanguages = languages
    req.minimumTextHeight = 0.015
    let handler = VNImageRequestHandler(cgImage: strip, orientation: .up, options: [:])
    do { try handler.perform([req]) } catch { return [] }
    return (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }
  }

  /// Upscale (never downscale) a CGImage so its height is at least `minHeight`,
  /// using Lanczos for clean edges — gives Vision more pixels on small print.
  private func upscaled(_ cg: CGImage, minHeight: CGFloat) -> CGImage? {
    let h = CGFloat(cg.height)
    guard h > 1, h < minHeight else { return cg }
    let scale = minHeight / h
    let ci = CIImage(cgImage: cg)
    guard let f = CIFilter(name: "CILanczosScaleTransform") else { return cg }
    f.setValue(ci, forKey: kCIInputImageKey)
    f.setValue(scale, forKey: kCIInputScaleKey)
    f.setValue(1.0, forKey: kCIInputAspectRatioKey)
    guard let out = f.outputImage else { return cg }
    return ciContext.createCGImage(out, from: out.extent)
  }

  private func averageVectors(_ vs: [[Float]]) -> [Float] {
    guard let first = vs.first else { return [] }
    if vs.count == 1 { return first }
    var sum = [Float](repeating: 0, count: first.count)
    for v in vs {
      let n = min(v.count, sum.count)
      for i in 0..<n { sum[i] += v[i] }
    }
    let inv = 1 / Float(vs.count)
    for i in 0..<sum.count { sum[i] *= inv }
    return sum
  }

  private func stripScheme(_ uri: String) -> String {
    uri.hasPrefix("file://") ? String(uri.dropFirst("file://".count)) : uri
  }

  // MARK: - Index location

  /// Bundled baseline index shipped in the app, if present (assets/ via the
  /// podspec resource_bundle, with a fallback to the main bundle).
  private func bundledIndexPaths() -> (manifest: String, f16: String)? {
    var bundles: [Bundle] = [Bundle(for: type(of: self)), Bundle.main]
    if let url = Bundle(for: type(of: self)).url(forResource: "CardVisionAssets", withExtension: "bundle"),
       let rb = Bundle(url: url) {
      bundles.insert(rb, at: 0)
    }
    for b in bundles {
      if let f = b.url(forResource: "index", withExtension: "f16"),
         let m = b.url(forResource: "index.manifest", withExtension: "json") {
        return (m.path, f.path)
      }
    }
    return nil
  }

  /// Read {rev, count} from a manifest without loading the whole index.
  private func versionAt(manifestPath: String) -> (rev: Int, count: Int)? {
    guard let data = FileManager.default.contents(atPath: manifestPath),
          let m = try? JSONDecoder().decode(Manifest.self, from: data) else { return nil }
    return (m.rev, m.count)
  }

  /// Decode a manifest + Float16 matrix from disk into the in-memory index.
  @discardableResult
  private func loadFromDisk(manifestPath: String, f16Path: String) throws -> Int {
    guard let mdata = FileManager.default.contents(atPath: manifestPath) else {
      throw VisionError(description: "Manifest not found at \(manifestPath)")
    }
    let manifest = try JSONDecoder().decode(Manifest.self, from: mdata)
    guard manifest.rev >= customModelRevFloor else {
      throw VisionError(description:
        "Index rev \(manifest.rev) is a legacy FeaturePrint index — this build requires a trained-model index (rev >= \(customModelRevFloor))")
    }
    // An index is useless without its embedder — fail the load rather than
    // silently producing garbage matches.
    _ = try self.loadCoreMLModel()
    guard let vdata = FileManager.default.contents(atPath: f16Path) else {
      throw VisionError(description: "Vectors not found at \(f16Path)")
    }
    let expected = manifest.count * manifest.dim
    let floats = vdata.withUnsafeBytes {
      $0.bindMemory(to: Float16.self).prefix(expected).map { Float($0) }
    }
    guard floats.count == expected else {
      throw VisionError(description: "Vector buffer is \(floats.count), expected \(expected)")
    }
    stateLock.lock()
    self.ids = manifest.ids
    self.matrix = floats
    self.dim = manifest.dim
    self.count = manifest.count
    self.loadedRev = manifest.rev
    stateLock.unlock()
    return manifest.count
  }

  /// Coherent snapshot of the loaded index. O(1): arrays are COW-retained,
  /// and loads replace them wholesale rather than mutating in place.
  private func loadedState() -> (ids: [String], matrix: [Float], dim: Int, count: Int, rev: Int) {
    stateLock.lock()
    defer { stateLock.unlock() }
    return (ids, matrix, dim, count, loadedRev)
  }

  private func hasIndex() -> Bool {
    stateLock.lock()
    defer { stateLock.unlock() }
    return count > 0
  }

  // MARK: - Image loading

  private func loadUpright(_ path: String) -> CGImage? {
    let url = URL(fileURLWithPath: path)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else { return nil }
    let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any]
    let raw = (props?[kCGImagePropertyOrientation] as? UInt32) ?? 1
    let orientation = CGImagePropertyOrientation(rawValue: raw) ?? .up
    if orientation == .up { return cg }
    let ci = CIImage(cgImage: cg).oriented(orientation)
    return ciContext.createCGImage(ci, from: ci.extent) ?? cg
  }

  /// Load upright for a preview-region call. Camera sensors capture landscape
  /// pixels plus a rotation flag; when that flag is missing/unapplied the
  /// pixels arrive sideways, every preview-coordinate mapping is wrong, and
  /// the rectangle detector rejects the (now-landscape) cards. If the caller's
  /// preview is portrait but the image is landscape, rotate 90° CW (the iPhone
  /// back-camera sensor default). No-op when EXIF already made it upright.
  private func loadUprightForPreview(_ path: String, previewAspect: Double) -> CGImage? {
    guard let cg = loadUpright(path) else { return nil }
    if previewAspect < 1, cg.width > cg.height {
      let ci = CIImage(cgImage: cg).oriented(.right)
      return ciContext.createCGImage(ci, from: ci.extent) ?? cg
    }
    return cg
  }

  /// Write a CGImage to a temp JPEG for the JS side to display — guarantees
  /// the review overlay shows exactly the (upright, cropped) frame that was
  /// analyzed, independent of the raw capture's orientation metadata.
  private func writeTempJPEG(_ cg: CGImage) -> String? {
    let path = NSTemporaryDirectory()
      + "cardframe-\(UInt64(Date().timeIntervalSince1970 * 1000)).jpg"
    let url = URL(fileURLWithPath: path)
    guard let dest = CGImageDestinationCreateWithURL(
      url as CFURL, "public.jpeg" as CFString, 1, nil) else { return nil }
    CGImageDestinationAddImage(
      dest, cg, [kCGImageDestinationLossyCompressionQuality: 0.85] as CFDictionary)
    return CGImageDestinationFinalize(dest) ? path : nil
  }

  /// Card-shaped rectangle detection (portrait 2.5" × 3.5" aspect band).
  private func detectQuads(
    _ cg: CGImage, minSize: Float, maxObs: Int
  ) -> [VNRectangleObservation] {
    let req = VNDetectRectanglesRequest()
    req.minimumAspectRatio = 0.55   // card ≈ 0.717 (2.5" / 3.5")
    req.maximumAspectRatio = 0.95
    req.minimumSize = minSize
    req.maximumObservations = maxObs
    req.quadratureTolerance = 30
    let handler = VNImageRequestHandler(cgImage: cg, orientation: .up, options: [:])
    try? handler.perform([req])
    return req.results ?? []
  }

  private func detectAndCrop(_ cg: CGImage) -> CGImage? {
    guard let r = detectQuads(cg, minSize: 0.20, maxObs: 1).first else { return nil }
    return perspectiveCrop(cg, quad: r)
  }

  /// Perspective-correct a detected card quad out of the image.
  private func perspectiveCrop(_ cg: CGImage, quad r: VNRectangleObservation) -> CGImage? {
    let ci = CIImage(cgImage: cg)
    let w = ci.extent.width, h = ci.extent.height
    func denorm(_ p: CGPoint) -> CIVector { CIVector(x: p.x * w, y: p.y * h) }
    guard let f = CIFilter(name: "CIPerspectiveCorrection") else { return nil }
    f.setValue(ci, forKey: kCIInputImageKey)
    f.setValue(denorm(r.topLeft), forKey: "inputTopLeft")
    f.setValue(denorm(r.topRight), forKey: "inputTopRight")
    f.setValue(denorm(r.bottomLeft), forKey: "inputBottomLeft")
    f.setValue(denorm(r.bottomRight), forKey: "inputBottomRight")
    guard let out = f.outputImage else { return nil }
    return ciContext.createCGImage(out, from: out.extent)
  }

  // MARK: - Embedding

  private func normalised(_ v: [Float]) -> [Float] {
    var sum: Float = 0
    for x in v { sum += x * x }
    let norm = sqrt(sum)
    return norm > 0 ? v.map { $0 / norm } : v
  }

  private func embed(path: String, crop: Bool) -> [Float]? {
    guard let cg = loadUpright(path) else { return nil }
    return embedCGImage(cg, crop: crop)
  }

  private func embedCGImage(_ cgIn: CGImage, crop: Bool) -> [Float]? {
    var cg = cgIn
    if crop, let cropped = detectAndCrop(cg) { cg = cropped }
    return embedCoreML(cg)
  }

  /// Locate + load the bundled trained embedder (compiled .mlmodelc shipped in
  /// assets/ via the CardVisionAssets resource bundle, same lookup as the
  /// bundled index). Cached after the first call.
  private func loadCoreMLModel() throws -> VNCoreMLModel {
    coreMLLock.lock()
    defer { coreMLLock.unlock() }
    if let m = coreMLModel { return m }
    var bundles: [Bundle] = [Bundle(for: type(of: self)), Bundle.main]
    if let url = Bundle(for: type(of: self)).url(forResource: "CardVisionAssets", withExtension: "bundle"),
       let rb = Bundle(url: url) {
      bundles.insert(rb, at: 0)
    }
    for b in bundles {
      if let url = b.url(forResource: "CardEmbedder", withExtension: "mlmodelc") {
        let m = try VNCoreMLModel(for: MLModel(contentsOf: url))
        coreMLModel = m
        return m
      }
    }
    throw VisionError(description: "CardEmbedder.mlmodelc missing from app bundle")
  }

  /// Embed with the trained model. The model takes a 224×224 RGB image and
  /// returns an L2-normalised embedding; VNCoreMLRequest handles the resize
  /// with the SAME scaleFill squash the training pipeline used, so query
  /// preprocessing matches the index exactly. Re-normalising is belt-and-
  /// braces against FP16 rounding.
  private func embedCoreML(_ cg: CGImage) -> [Float]? {
    guard let model = try? loadCoreMLModel() else { return nil }
    let req = VNCoreMLRequest(model: model)
    req.imageCropAndScaleOption = cropAndScaleOption
    let handler = VNImageRequestHandler(cgImage: cg, orientation: .up, options: [:])
    do { try handler.perform([req]) } catch { return nil }
    guard let obs = req.results?.first as? VNCoreMLFeatureValueObservation,
          let arr = obs.featureValue.multiArrayValue else { return nil }
    var v = [Float](repeating: 0, count: arr.count)
    for i in 0..<arr.count { v[i] = arr[i].floatValue }
    return v.isEmpty ? nil : normalised(v)
  }

  /// Crop a full captured photo to an on-screen preview region. The preview fills
  /// the screen with a center-crop ("cover"), so only part of the photo is
  /// visible; this maps the preview-normalised box back to photo pixels.
  private func cropToPreviewRegion(
    _ cg: CGImage, nx: Double, ny: Double, nw: Double, nh: Double, previewAspect: Double
  ) -> CGImage? {
    let iw = Double(cg.width), ih = Double(cg.height)
    guard iw > 0, ih > 0, previewAspect > 0 else { return nil }
    let imageAspect = iw / ih
    // Fraction of the photo actually visible in the (center-cropped) preview.
    let visW = imageAspect > previewAspect ? previewAspect / imageAspect : 1
    let visH = imageAspect > previewAspect ? 1 : imageAspect / previewAspect
    let visX0 = (1 - visW) / 2
    let visY0 = (1 - visH) / 2
    // Box (preview-normalised) → photo pixels.
    let bx = (visX0 + nx * visW) * iw
    let by = (visY0 + ny * visH) * ih
    let bw = nw * visW * iw
    let bh = nh * visH * ih
    let rect = CGRect(x: bx, y: by, width: bw, height: bh)
      .integral
      .intersection(CGRect(x: 0, y: 0, width: iw, height: ih))
    guard !rect.isNull, rect.width > 1, rect.height > 1 else { return nil }
    return cg.cropping(to: rect)
  }

  // MARK: - Matching (cosine == dot product on normalised vectors, via vDSP)

  private func topMatches(query: [Float], k: Int) -> [(id: String, score: Float)] {
    // Locked snapshot keeps ids/matrix/dim coherent as one set.
    let snap = loadedState()
    guard snap.dim > 0, snap.count > 0, query.count >= snap.dim else { return [] }
    var scores = [Float](repeating: 0, count: snap.count)
    snap.matrix.withUnsafeBufferPointer { mb in
      query.withUnsafeBufferPointer { qb in
        guard let m = mb.baseAddress, let q = qb.baseAddress else { return }
        for i in 0..<snap.count {
          var s: Float = 0
          vDSP_dotpr(m + i * snap.dim, 1, q, 1, &s, vDSP_Length(snap.dim))
          scores[i] = s
        }
      }
    }
    let top = Array(0..<snap.count).sorted { scores[$0] > scores[$1] }.prefix(max(k, 1))
    return top.map { (id: snap.ids[$0], score: scores[$0]) }
  }
}
