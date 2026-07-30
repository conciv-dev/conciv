# Release-build hygiene checklist

`#if DEBUG` guards the SDK **code** paths (the dev-core URL, `isInspectable`), but it does **not** strip
**Info.plist keys** from a Release build. Those keys are App Store review surface and must be Debug-only by
build configuration, not by hope. Work through this list before shipping an app that embeds ConcivWidget.

## Info.plist keys are Debug-only by configuration

- Put the App Transport Security exception (`NSAppTransportSecurity` with `NSAllowsLocalNetworking`) and
  `NSLocalNetworkUsageDescription` in a **Debug-only** `xcconfig` or per-build-configuration `Info.plist`.
  Use build-configuration-conditional `Info.plist` keys, or a Debug-only `.xcconfig` that injects them, so a
  Release or App Store build carries neither.
- `NSAllowsLocalNetworking` alone is enough for loopback to the dev core. Never ship
  `NSAllowsArbitraryLoads`.

## Inspectable WebView is Debug-only

- `isInspectable` is compiled under `#if DEBUG` in the SDK. A **Debug-configured** TestFlight build would
  still carry the dev-core URL and an inspectable WebView, so internal TestFlight builds of a
  conciv-integrated app must use a Release configuration, or a dedicated non-conciv configuration.

## Verify before submission

- Audit that no SDK code path, `isInspectable`, or Debug ATS / `NSLocalNetworkUsageDescription` plist key
  compiles into the Release build: a `#if DEBUG` code audit plus a per-configuration plist audit.
- Confirm the Release build does not resolve or contact a dev-core URL.
