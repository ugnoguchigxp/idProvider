// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "MobileSwiftSdk",
    products: [
        .library(name: "MobileSwiftSdk", targets: ["MobileSwiftSdk"]),
    ],
    targets: [
        .target(name: "MobileSwiftSdk"),
        .testTarget(name: "MobileSwiftSdkTests", dependencies: ["MobileSwiftSdk"]),
    ]
)
