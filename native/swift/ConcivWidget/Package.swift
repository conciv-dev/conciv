// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "ConcivWidget",
  platforms: [.iOS(.v17)],
  products: [
    .library(name: "ConcivWidget", targets: ["ConcivWidget"]),
  ],
  targets: [
    .target(name: "ConcivWidget"),
    .testTarget(
      name: "ConcivWidgetTests",
      dependencies: ["ConcivWidget"],
      exclude: ["transcript-xcode-version.txt"],
      resources: [.copy("Fixtures/bridge")]
    ),
  ]
)
