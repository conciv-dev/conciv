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
environment variable, and falls back to pairing-file auto-discovery when it is unset. It compiles to a
no-op in Release builds, so nothing conciv reaches TestFlight or the App Store. For hosts that supply
an explicit endpoint or own their window lifecycle, `attach(apiBase:)` and `attach(to:apiBase:)` take
the base (and window) directly.

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

Before submitting an app that embeds ConcivWidget, follow [RELEASE_HYGIENE.md](./RELEASE_HYGIENE.md): the
dev-core connection surface (ATS local-networking exception, local-network usage description, inspectable
WebView) must be Debug-only by build configuration, never present in a Release or App Store build.

## License

MIT
