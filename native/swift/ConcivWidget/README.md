# ConcivWidget

## Overview

Swift package `ConcivWidget` (tools 5.9, iOS 17): the iOS SDK library and its XCTest target.

## Interface

- product `.library(name: "ConcivWidget")` (`Package.swift`)
- target `ConcivWidget` and test target `ConcivWidgetTests` with resource `.copy("Fixtures/bridge")` (`Package.swift`)
- Subdirectories: [Sources](./Sources/README.md), [Tests](./Tests/README.md)

## Invariants

- `Package.swift`: platform is `.iOS(.v17)`
- `Package.swift`: `transcript-xcode-version.txt` is excluded from the test target

## Side Effects

- None

## Verification

- Run: `cd native/swift/ConcivWidget && swift test` (macOS host; runs the Foundation-only suites)
- Run: `cd native/swift/ConcivWidget && xcodebuild test -scheme ConcivWidget -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` (UIKit suites behind `canImport(UIKit)`)
