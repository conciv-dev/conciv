# ConcivDemo

## Overview

iOS simulator demo app built with plain `swiftc` (no Xcode project), compiled together with the real ConcivWidget sources. The TanStack Start example's iOS extension points at this folder.

## Interface

- `build.sh`: compiles `Sources/App` plus `../ConcivWidget/Sources/ConcivWidget` for `<arch>-apple-ios17.0-simulator` into `build/ConcivDemo.app`, signs it ad hoc
- `run.sh`: builds, boots the simulator (`SIM_NAME`, default `iPhone 17 Pro`, or `UDID`), installs and launches `dev.conciv.ConcivDemo`
- `Info.plist`: bundle id `dev.conciv.ConcivDemo`
- Subdirectories: [Sources](./Sources/README.md)

## Invariants

- `build.sh`: compiles with `-D DEBUG` because the SDK's attach API is `#if DEBUG`
- `build.sh`: always compiles the live SDK sources; never vendor a copy into this app
- `run.sh`: exits with an error when no simulator named `SIM_NAME` is available

## Side Effects

- `build.sh`: deletes and rewrites `build/ConcivDemo.app`, runs `codesign --sign -`
- `run.sh`: `xcrun simctl boot`, `install`, `terminate`, `launch`, and opens Simulator.app
- `build.sh`, `run.sh`: default `DEVELOPER_DIR` to `/Applications/Xcode.app/Contents/Developer`

## Verification

- Run: `cd native/swift/ConcivDemo && ./build.sh` (build only; `./run.sh` also installs and launches on the simulator)
