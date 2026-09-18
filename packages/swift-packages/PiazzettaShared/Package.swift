// swift-tools-version: 5.9
// PiazzettaShared — codice Swift condiviso tra app macOS e iOS/iPadOS Owner.
// Contiene APIClient, Models, GlassSupport, AIAssistant e le view comuni.
// Target separati (macOS, iOS) gestiscono le divergenze piattaforma-specifiche.

import PackageDescription

let package = Package(
  name: "PiazzettaShared",
  platforms: [
    .macOS(.v14),
    .iOS(.v17),
  ],
  products: [
    .library(name: "PiazzettaShared", targets: ["PiazzettaShared"]),
  ],
  targets: [
    .target(
      name: "PiazzettaShared",
      path: "Sources/PiazzettaShared"
    ),
  ]
)
