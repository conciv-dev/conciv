# App

## Overview

UIKit demo app (a payments screen with UIKit cells and SwiftUI rows) that attaches ConcivWidget in debug builds.

## Interface

- `main.swift`: app entry point
- `AppDelegate` (`AppDelegate.swift`)
- `SceneDelegate.scene(_:willConnectTo:options:)` (`SceneDelegate.swift`): builds the window with `PaymentsViewController` and calls `ConcivWidget.attach(to:apiBase:)` when `CONCIV_URL` is set, else `ConcivWidget.attach(to:)`
- `PaymentsViewController` (`PaymentsViewController.swift`): balance header, payment cards, SwiftUI subscription rows with `.concivGrab(id:label:)` anchors (`sub-icloud`, `sub-spotify`)
- `PaymentCardCell` (`PaymentCardCell.swift`): UIKit card view picked by hit-testing

## Invariants

- `SceneDelegate.swift`: the widget is attached only under `#if DEBUG`
- `PaymentsViewController.swift`: SwiftUI content without `.concivGrab` is not pickable

## Side Effects

- `SceneDelegate.swift`: reads `CONCIV_URL` from the process environment

## Verification

- Run: `cd native/swift/ConcivDemo && ./build.sh` (build only; `./run.sh` also installs and launches on the simulator)
