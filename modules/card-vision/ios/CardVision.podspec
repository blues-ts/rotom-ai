Pod::Spec.new do |s|
  s.name           = 'CardVision'
  s.version        = '0.1.0'
  s.summary        = 'On-device Pokémon card recognition via a trained Core ML embedding model.'
  s.description    = 'Embeds a card image with a bundled Core ML model (CardEmbedder.mlmodelc) and matches it against an in-memory reference index.'
  s.author         = ''
  s.homepage       = 'https://example.com'
  s.platforms      = { :ios => '13.4' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"

  # Optional bundled baseline index (hybrid). If assets/index.f16 +
  # assets/index.manifest.json are present at build time they ship inside the app
  # for an instant, offline first run; the module still refreshes from the server
  # when a newer index is available. Missing files → falls back to download-only.
  s.resource_bundles = {
    'CardVisionAssets' => ['assets/*']
  }
end
