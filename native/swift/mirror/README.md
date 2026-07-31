# ConcivWidget

The native iOS SDK for [conciv](https://conciv.dev). `ConcivWidget.attach` floats the conciv agent
panel over a running native app: a transparent WKWebView overlay plus a launcher button, a native pick
(grab) that hands a selected view back to the agent, and the origin-pinned page-native bridge that talks
to a conciv dev core.

> **Early alpha.** The iOS SDK is early alpha on the `0.0.x` line. The bridge protocol and the public
> API change without notice while `0.0.x` lasts, and the iOS simulator is the only supported target
> today.

> This repository is a **published mirror**. The source of truth lives in the conciv monorepo at
> `native/swift/ConcivWidget/`. Release CI regenerates this repository from that tree and tags it; nobody
> edits it by hand. Open issues and pull requests against the monorepo, not here.

## Installation

Add the package with Swift Package Manager (mirror URL only):

```swift
.package(url: "https://github.com/conciv-dev/conciv-swift.git", from: "0.0.1")
```

Then reference the product from your target:

```swift
.product(name: "ConcivWidget", package: "conciv-swift")
```

## Usage

The whole integration is one line, from a scene delegate or a SwiftUI `App` init:

```swift
import ConcivWidget

ConcivWidget.attach()
```

`attach()` finds the key window itself (immediately, or on the next window/scene activation, so it is
safe before `makeKeyAndVisible` or from `App.init`), reads the core api base from the `CONCIV_URL`
environment variable, and falls back to auto-discovery when it is unset. It compiles to a no-op in
Release builds, so nothing conciv reaches TestFlight or the App Store. For hosts that supply an
explicit endpoint or own their window lifecycle, `attach(apiBase:)` and `attach(to:apiBase:)` take the
base (and window) directly.

The launcher defaults to the animated mascot (`launcher: .mascot`). Pass `launcher: .native` for a dark
round `AI` button instead; every `attach` overload takes the argument.

```swift
ConcivWidget.attach(launcher: .native)
```

## Finding the core

With `CONCIV_URL` unset, `attach()` resolves the api base in this order:

1. The pairing file at `~/.conciv/dev-endpoint.json`, accepted only when its `apiBase` answers
   `GET /health` as a conciv core. A dev core that serves the native page writes the file on startup and
   removes it on shutdown. The simulator reads the host home directory, so this is the zero-config path.
2. A probe of `http://127.0.0.1` on ports 4599, 8787, and 3000, taking the first one whose `/health`
   answers as a conciv core. The probe runs whenever step 1 does not yield a live core: no file, an
   unreadable or malformed file, or a readable file whose endpoint fails the health check, which is how
   a stale file from a crashed core recovers.

The SDK always reads `~/.conciv/dev-endpoint.json`; the path is fixed. A host that runs its dev server
under a test environment (`CONCIV_E2E` or `VITEST`) writes the pairing file to a temporary directory
instead, so the SDK never sees that core's file. It then falls to the port probe, or pairs with a
different dev core if that one left a healthy file at the global path. Pass `CONCIV_URL` to pin the
core explicitly.

## App Transport Security

Talking to the dev core over `http://127.0.0.1` needs no `Info.plist` changes: App Transport Security
does not apply to the loopback address, and the local-network privacy prompt does not cover loopback
either. The two keys people reach for solve different problems, and neither is needed here:
`NSLocalNetworkUsageDescription` is the purpose string for reaching other devices on the local network,
whatever the protocol, and `NSAllowsLocalNetworking` is the ATS exception for plain HTTP to local hosts
(`.local` names, single-label hostnames, private IPv4 and IPv6 ranges). A LAN setup of your own needs
the usage string, plus the ATS exception while the URL stays `http://`. Keep whichever you add out of
Release builds ([RELEASE_HYGIENE.md](./RELEASE_HYGIENE.md)).

## Versioning: Swift SDK, bridge protocol, and npm

The Swift SDK ships in **lockstep with the npm packages**. Every `@conciv/*` package shares one version
(changesets bumps the whole set together on each release), and the Swift tag `N.N.N` is generated from
the exact same monorepo commit that published `@conciv/*@N.N.N` to npm. Match your SwiftPM version to
the `@conciv/*` npm version you run: if your app talks to a core built from `@conciv/*@N.N.N`, pin
ConcivWidget to `N.N.N`.

The lockstep tags begin with the next release. The only tag published so far is `0.0.1` (the initial
native-only cut); the first tag generated from a matching npm release will be the next `0.0.x`. Because
SwiftPM's `from:` resolves forward, `from: "0.0.1"` picks up those later tags automatically.

While the SDK is on the `0.0.x` line there is no stability guarantee: any release may change
`BRIDGE_MAX_VERSION`, the wire schema, or the public `attach` API and break compatibility without notice.
A given Swift release speaks one bridge protocol version and interoperates with any `@conciv/extension-ios`
whose advertised bridge range includes it.

| ConcivWidget (Swift) | Bridge protocol | Matching `@conciv/*` npm |
| -------------------- | --------------- | ------------------------ |
| `0.0.x`              | v1              | same `0.0.x`             |

When the page and native ends disagree on the protocol, the page sends `bridge.incompatible` and the
overlay surfaces a visible error rather than failing silently. Keep the Swift SDK and the installed
`@conciv/*` on the same version.

## Release-build hygiene

Before submitting an app that embeds ConcivWidget, follow [RELEASE_HYGIENE.md](./RELEASE_HYGIENE.md):
the inspectable WebView and the dev-core URL are already `#if DEBUG`, and any ATS or local-network
`Info.plist` key you added for your own dev setup must be Debug-only by build configuration, never
present in a Release or App Store build.

## License

MIT
