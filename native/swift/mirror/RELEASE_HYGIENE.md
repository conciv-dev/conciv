# Release-build hygiene checklist

`#if DEBUG` guards the SDK **code** paths (the dev-core URL, `isInspectable`), but it does **not** strip
**Info.plist keys** from a Release build. The SDK itself requires no plist keys; any you add for your own
dev setup are App Store review surface and must be Debug-only by build configuration, not by hope. Work
through this list before shipping an app that embeds ConcivWidget.

## No ATS keys are needed for the dev core

- The SDK reaches the dev core over `http://127.0.0.1`. App Transport Security does not apply to the
  loopback address, so plain HTTP to the core works with **no** `NSAppTransportSecurity` keys, in the
  simulator and on device alike. The local-network privacy prompt (iOS 14+) also exempts loopback, so
  `NSLocalNetworkUsageDescription` is not needed either. The cleanest release story is to add neither key.
- `NSAllowsLocalNetworking` and `NSLocalNetworkUsageDescription` are for plain HTTP to **other** machines
  on the network: private IPv4 and IPv6 ranges, `.local` names, and single-label hostnames. Only a setup
  that points the app at a Mac by LAN address needs them, and conciv does not ship that transport today.

## Any ATS key you do add is Debug-only by configuration

- If your own dev setup needs `NSAppTransportSecurity` or `NSLocalNetworkUsageDescription`, put them in a
  **Debug-only** `xcconfig` or per-build-configuration `Info.plist`, so a Release or App Store build carries
  neither. `#if DEBUG` guards SDK code, never plist keys.
- Never ship `NSAllowsArbitraryLoads`.

## Inspectable WebView is Debug-only

- `isInspectable` is compiled under `#if DEBUG` in the SDK. A **Debug-configured** TestFlight build would
  still carry the dev-core URL and an inspectable WebView, so internal TestFlight builds of a
  conciv-integrated app must use a Release configuration, or a dedicated non-conciv configuration.

## Verify before submission

- Audit that no SDK code path or `isInspectable` compiles into the Release build, and that the Release
  `Info.plist` carries no ATS or `NSLocalNetworkUsageDescription` key: a `#if DEBUG` code audit plus a
  per-configuration plist audit.
- Confirm the Release build does not resolve or contact a dev-core URL.
