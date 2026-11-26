# App

## Overview

UIKit demo app (a payments screen with UIKit cells and SwiftUI rows) that attaches ConcivWidget in debug builds.

## Invariants

- `SceneDelegate.swift`: the widget is attached only under `#if DEBUG`
- `PaymentsViewController.swift`: SwiftUI content without `.concivGrab` is not pickable

## Side Effects

- `SceneDelegate.swift`: reads `CONCIV_URL` from the process environment

## Verification

- Run: `cd native/swift/ConcivDemo && ./build.sh` (build only; `./run.sh` also installs and launches on the simulator)
