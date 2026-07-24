# ConcivWidget

The native iOS SDK for [conciv](https://conciv.dev). `ConcivWidget.attach` floats the conciv agent
panel over a running native app: a transparent WKWebView overlay plus a launcher button, a native pick
(grab) that hands a selected view back to the agent, and the origin-pinned page-native bridge that talks
to a conciv dev core.

> This repository is a **published mirror**. The source of truth lives in the conciv monorepo at
> `native/swift/ConcivWidget/`. Release CI regenerates this repository from that tree and tags it; nobody
> edits it by hand. Open issues and pull requests against the monorepo, not here.

## Installation

Add the package with Swift Package Manager (mirror URL only):

```swift
.package(url: "https://github.com/conciv-dev/conciv-swift.git", from: "1.0.0")
```

Then reference the product from your target:

```swift
.product(name: "ConcivWidget", package: "conciv-swift")
```

## Versioning: Swift SDK to bridge protocol to npm

The Swift tag tracks **bridge protocol** compatibility, not the npm package version. Bump the Swift major
or minor when `BRIDGE_MAX_VERSION`, the wire schema, or the public `attach` API changes; the two cadences
are independent. A given Swift release speaks one bridge protocol version and interoperates with any
`@conciv/extension-ios` whose advertised bridge range includes it.

| ConcivWidget (Swift) | Bridge protocol | Minimum `@conciv/extension-ios` |
| -------------------- | --------------- | ------------------------------- |
| `1.x`                | v1              | `>= 0.0.15`                     |

When the page and native ends disagree on the protocol, the page sends `bridge.incompatible` and the
overlay surfaces a visible error rather than failing silently. Keep the Swift SDK and the installed
`@conciv/extension-ios` within a compatible row of this table.

## Release-build hygiene

Before submitting an app that embeds ConcivWidget, follow [RELEASE_HYGIENE.md](./RELEASE_HYGIENE.md): the
dev-core connection surface (ATS local-networking exception, local-network usage description, inspectable
WebView) must be Debug-only by build configuration, never present in a Release or App Store build.

## License

MIT
