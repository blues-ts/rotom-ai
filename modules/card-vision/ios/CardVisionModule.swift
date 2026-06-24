import ExpoModulesCore
import Vision
import CoreImage
import ImageIO
import Accelerate

// On-device card recognition. Mirrors scripts/build-card-index (the Mac CLI that
// builds the reference index) so accuracy transfers 1:1 — same crop+scale option,
// same L2-normalised vectors, same cosine (dot product) matching.
//
// Reference vectors are kept in one flat Float buffer (count * dim) so the whole
// catalog (~45k cards) stays compact and matching is a tight vDSP loop. Only
// {id, score} crosses the bridge.

// Must match the CLI's `cropAndScaleOption`, or distances are meaningless.
private let cropAndScaleOption: VNImageCropAndScaleOption = .scaleFill

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

  public func definition() -> ModuleDefinition {
    Name("CardVision")

    Function("visionRevision") { () -> Int in
      VNGenerateImageFeaturePrintRequest.currentRevision
    }

    Function("isLoaded") { () -> Bool in
      self.count > 0
    }

    Function("loadedCount") { () -> Int in
      self.count
    }

    // Load a binary index already on disk: `<...>.manifest.json` + a Float16
    // `.f16` matrix. Returns the number of cards loaded.
    AsyncFunction("loadIndexFromFile") { (manifestUri: String, f16Uri: String) -> Int in
      try self.loadFromDisk(manifestPath: self.stripScheme(manifestUri),
                            f16Path: self.stripScheme(f16Uri))
    }

    // HYBRID step 1 — instant, offline. Load the best index already on the
    // device: whichever of the bundled baseline or the previously-downloaded
    // cache has more cards (so an app update with a newer baseline beats a stale
    // cache). Returns count 0 + source "none" when nothing is present yet.
    AsyncFunction("loadBestLocal") { () -> [String: Any] in
      let bundled = self.bundledIndexPaths()
      let cached = self.cachedIndexPaths()
      let bv = bundled.flatMap { self.versionAt(manifestPath: $0.manifest) }
      let cv = cached.flatMap { self.versionAt(manifestPath: $0.manifest) }

      // Prefer the larger catalog (more cards = newer set coverage).
      let useCached: Bool
      if let c = cv, let b = bv { useCached = c.count >= b.count }
      else { useCached = cv != nil }

      if useCached, let c = cached {
        let n = try self.loadFromDisk(manifestPath: c.manifest, f16Path: c.f16)
        return ["count": n, "rev": self.loadedRev, "source": "cached"]
      }
      if let b = bundled {
        let n = try self.loadFromDisk(manifestPath: b.manifest, f16Path: b.f16)
        return ["count": n, "rev": self.loadedRev, "source": "bundled"]
      }
      return ["count": 0, "rev": -1, "source": "none"]
    }

    // HYBRID step 2 — background. Ask the server for the current {rev,count};
    // if it differs from what's loaded, download + cache + load it. No-op (and
    // no network writes) when already current. Safe to call after loadBestLocal.
    AsyncFunction("refreshFromServer") {
      (versionURL: String, manifestURL: String, f16URL: String) -> [String: Any] in
      guard let vurl = URL(string: versionURL), let vdata = try? Data(contentsOf: vurl) else {
        throw VisionError(description: "Cannot reach \(versionURL)")
      }
      let remote = (try? JSONSerialization.jsonObject(with: vdata)) as? [String: Any] ?? [:]
      let rev = (remote["rev"] as? Int) ?? -1
      let count = (remote["count"] as? Int) ?? -1

      if rev == self.loadedRev && count == self.count {
        return ["count": self.count, "rev": self.loadedRev, "updated": false]
      }

      let paths = self.cacheIndexFilePaths()
      guard let murl = URL(string: manifestURL), let md = try? Data(contentsOf: murl) else {
        throw VisionError(description: "Failed to download manifest")
      }
      try md.write(to: URL(fileURLWithPath: paths.manifest))
      guard let furl = URL(string: f16URL), let fd = try? Data(contentsOf: furl) else {
        throw VisionError(description: "Failed to download vectors")
      }
      try fd.write(to: URL(fileURLWithPath: paths.f16))
      try vdata.write(to: URL(fileURLWithPath: paths.version))

      let n = try self.loadFromDisk(manifestPath: paths.manifest, f16Path: paths.f16)
      return ["count": n, "rev": self.loadedRev, "updated": true]
    }

    // Load from in-memory arrays (small/dev path). `flat` is ids.count * dim.
    AsyncFunction("loadIndex") { (ids: [String], flat: [Double], dim: Int) in
      guard dim > 0, ids.count * dim == flat.count else {
        throw VisionError(description: "Index shape mismatch: \(ids.count) × \(dim) ≠ \(flat.count)")
      }
      self.ids = ids
      self.dim = dim
      self.count = ids.count
      self.matrix = flat.map { Float($0) }
    }

    // Embed a captured photo and return the top-N matches. `crop` runs card
    // rectangle detection + perspective correction first (recommended for live
    // photos, which include background around the card).
    AsyncFunction("identify") { (uri: String, topN: Int, crop: Bool) -> [[String: Any]] in
      guard self.count > 0 else { throw VisionError(description: "Index not loaded") }
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
      guard self.count > 0 else { throw VisionError(description: "Index not loaded") }
      guard let cg = self.loadUpright(self.stripScheme(uri)) else {
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
      guard self.count > 0 else { throw VisionError(description: "Index not loaded") }
      guard let cg = self.loadUpright(self.stripScheme(uri)) else {
        throw VisionError(description: "Failed to load image")
      }
      let region = self.cropToPreviewRegion(
        cg, nx: x, ny: y, nw: w, nh: h, previewAspect: previewAspect) ?? cg
      guard let v = self.embedCGImage(region, crop: true) else {
        throw VisionError(description: "Failed to embed image")
      }

      // Scene-change guard: if this frame barely resembles the running average,
      // the card/scene changed — start the buffer over so we don't blend cards.
      if let last = self.recent.last {
        var s: Float = 0
        let n = min(last.count, v.count)
        for i in 0..<n { s += last[i] * v[i] }
        if s < 0.55 { self.recent.removeAll() }
      }
      self.recent.append(v)
      let cap = max(1, window)
      if self.recent.count > cap { self.recent.removeFirst(self.recent.count - cap) }

      let avg = self.normalised(self.averageVectors(self.recent))
      return self.topMatches(query: avg, k: topN).map {
        ["id": $0.id, "score": Double($0.score)]
      }
    }

    // Clear the smoothing buffer (call when starting a fresh scan session).
    Function("resetSmoothing") {
      self.recent.removeAll()
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
      guard let cg = self.loadUpright(self.stripScheme(uri)) else {
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
    return CIContext().createCGImage(out, from: out.extent)
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

  // MARK: - Index locations

  /// Cache file paths in the app's Caches dir (created on demand).
  private func cacheIndexFilePaths() -> (manifest: String, f16: String, version: String) {
    let base = NSSearchPathForDirectoriesInDomains(.cachesDirectory, .userDomainMask, true).first
      ?? NSTemporaryDirectory()
    let dir = base + "/scanindex"
    try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    return (dir + "/index.manifest.json", dir + "/index.f16", dir + "/version.json")
  }

  /// Cached (downloaded) index, only if both files exist.
  private func cachedIndexPaths() -> (manifest: String, f16: String)? {
    let p = cacheIndexFilePaths()
    let fm = FileManager.default
    return fm.fileExists(atPath: p.manifest) && fm.fileExists(atPath: p.f16)
      ? (p.manifest, p.f16) : nil
  }

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
    self.ids = manifest.ids
    self.matrix = floats
    self.dim = manifest.dim
    self.count = manifest.count
    self.loadedRev = manifest.rev
    return manifest.count
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
    return CIContext().createCGImage(ci, from: ci.extent) ?? cg
  }

  private func detectAndCrop(_ cg: CGImage) -> CGImage? {
    let req = VNDetectRectanglesRequest()
    req.minimumAspectRatio = 0.55   // card ≈ 0.717 (2.5" / 3.5")
    req.maximumAspectRatio = 0.95
    req.minimumSize = 0.20
    req.maximumObservations = 1
    req.quadratureTolerance = 30
    let handler = VNImageRequestHandler(cgImage: cg, orientation: .up, options: [:])
    try? handler.perform([req])
    guard let r = req.results?.first else { return nil }

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
    return CIContext().createCGImage(out, from: out.extent)
  }

  // MARK: - Embedding

  private func rawVector(_ obs: VNFeaturePrintObservation) -> [Float] {
    let n = obs.elementCount
    let data = obs.data
    switch data.count / max(n, 1) {
    case 4: return data.withUnsafeBytes { Array($0.bindMemory(to: Float.self).prefix(n)) }
    case 8: return data.withUnsafeBytes { $0.bindMemory(to: Double.self).prefix(n).map { Float($0) } }
    case 2: return data.withUnsafeBytes { $0.bindMemory(to: Float16.self).prefix(n).map { Float($0) } }
    default: return []
    }
  }

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
    let req = VNGenerateImageFeaturePrintRequest()
    req.imageCropAndScaleOption = cropAndScaleOption
    let handler = VNImageRequestHandler(cgImage: cg, orientation: .up, options: [:])
    do { try handler.perform([req]) } catch { return nil }
    guard let obs = req.results?.first as? VNFeaturePrintObservation else { return nil }
    let v = rawVector(obs)
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
    guard dim > 0, count > 0, query.count >= dim else { return [] }
    var scores = [Float](repeating: 0, count: count)
    matrix.withUnsafeBufferPointer { mb in
      query.withUnsafeBufferPointer { qb in
        guard let m = mb.baseAddress, let q = qb.baseAddress else { return }
        for i in 0..<count {
          var s: Float = 0
          vDSP_dotpr(m + i * dim, 1, q, 1, &s, vDSP_Length(dim))
          scores[i] = s
        }
      }
    }
    let top = Array(0..<count).sorted { scores[$0] > scores[$1] }.prefix(max(k, 1))
    return top.map { (id: ids[$0], score: scores[$0]) }
  }
}
