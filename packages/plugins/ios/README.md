# @conciv/plugin-ios

The conciv iOS plugin. Its engine part builds, runs, screenshots and reads the logs of a native iOS app on the
simulator through `xcodebuild`, `swiftc` and `simctl`. Its browser part is the WKWebView bridge that
`@conciv/app`'s native page (`packages/app/src/native-entry.ts`) speaks to the app.

```ts
plugins: [['@conciv/plugin-ios', {projectRoot: 'ios/PayApp', bundleId: 'dev.conciv.pay', buildMode: 'swiftc'}]]
```

- Tools in the `ios` namespace: `ios_screenshot` and `ios_logs` in code mode, `ios_build` and `ios_run` as direct
  tools that ask permission before each call.
- Options: `projectRoot`, `bundleId`, `scheme?`, `simulator?` (default `iPhone 17 Pro`), `developerDir?`,
  `buildMode?` (`xcodebuild` or `swiftc`), `extraSourceDirs?`, `concivUrl?`.
- Invariant: without options every tool answers `{ok: false, error: 'ios plugin not configured'}`.
- Invariant: with options, a session `context` hook adds the iOS rules (the native overlay, the served app, the
  build loop, no filesystem-wide searches) to the system prompt of every model request; without options it adds
  nothing.
- Invariant: `concivUrl` is the engine api base with no path; a
  trailing `/widget` is stripped because the Swift SDK appends `/widget` itself. Without it the app gets the url of
  the engine's own server.
- Side effect: `ios_build` and `ios_run` start child processes and write the `build/<module>.app` bundle in swiftc
  mode; `ios_run` boots the simulator and installs and launches the app.

## Browser part

- `./rpc`: the zod schemas of the versioned page and native messages (`PageToNativeSchema`, `NativeToPageSchema`,
  `BridgeMessageSchema`) and their types, the single source the Swift `BridgeMessages.swift` mirrors.
- `./builtins`: `builtins`, a scoped Effect that, on a page whose `window.webkit.messageHandlers.concivBridge`
  exists, starts the bridge and returns the built-ins `@conciv/app`'s native page composes in (an empty list on any
  other page): the `ios` plugin, a `page.overlay` `Slot` that alerts when the app speaks bridge versions this widget
  does not support. Its `grabProvider` picks native views through the bridge (`undefined` off the bridge), and
  `apiBase` is the engine api base derived from the native page's location.
- Side effect: the service's scope owns `window.__concivNative`, the `conciv:panel-toggled` listener, the panel
  event-bus client and the fibers that follow the bridge; it posts to the app through the handler and dispatches
  `conciv:rebind` when the app hands over a new api base. Closing the scope removes all of them.
- `pnpm --filter @conciv/plugin-ios gen:fixtures` writes the bridge fixtures from `test/fixtures/bridge/bridge.fixtures.ts`
  to `test/fixtures/bridge/` and to the Swift test copy in `native/swift/ConcivWidget/Tests/ConcivWidgetTests/Fixtures/bridge`.

Early alpha: the iOS SDK is on the `0.0.x` line. The bridge protocol and the public
API change without notice while `0.0.x` lasts, and the iOS simulator is the only
supported target today.

## SDK entry point

The whole consumer integration is one line, from a scene delegate or a SwiftUI `App`
init:

```swift
import ConcivWidget

ConcivWidget.attach()
```

`attach()` resolves the key window itself (immediately, or on the next window/scene
activation, so it is safe before `makeKeyAndVisible` or from `App.init`), reads the engine
api base from `CONCIV_URL`, and falls back to pairing-file auto-discovery when that is
unset or malformed. It is a no-op in Release builds. Advanced overloads
(`attach(apiBase:)`, `attach(to:apiBase:)`) exist for hosts that supply an explicit
endpoint or own their window lifecycle.

## Versioning and the Swift SDK

This package is the bridge-protocol peer of the native Swift SDK (`ConcivWidget`,
published as the [conciv-dev/conciv-swift](https://github.com/conciv-dev/conciv-swift)
SwiftPM mirror). The two ship in lockstep: this package's `version` is the source of
truth for the mirror tag, so the Swift tag `N.N.N` is generated from the same monorepo
commit that published `@conciv/*@N.N.N` to npm. Match the SwiftPM version to the
`@conciv/*` npm version you run. Release CI regenerates and tags the mirror whenever
this package's version changes (changesets bumps every `@conciv/*` package together on
each release); the `native/swift/ConcivWidget/` source carries no hand-edited version
file.

## Transport tiers

The engine binds `127.0.0.1` only. How the in-app WebView reaches it depends on the
target. Only the iOS simulator tier ships today; the rest are documented for the
follow-on milestones.

| Target                  | How the WebView reaches the engine                                 | Status                          |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------- |
| iOS simulator           | `http://127.0.0.1:<port>` directly (shared host loopback)          | Shipped                         |
| Android emulator        | `http://10.0.2.2:<port>` (emulator alias for the host loopback)    | Documented, sibling plugin      |
| Android physical device | `adb reverse tcp:<port> tcp:<port>` then `http://127.0.0.1:<port>` | Documented, sibling plugin      |
| iOS physical device     | LAN bind + token, or QR pairing, or Bonjour (all token-gated)      | Deferred (no code in this tier) |

## Dev loop and port

Pinning a stable engine port is optional: discovery reads the pairing file, so an engine
on any port is found. `ConcivConfig` accepts a `port`, and the ios dev loop documents
`4599`. With a pinned port an explicit `CONCIV_URL` stays valid across restarts.

`ios_run` injects the engine API base into the launched app as
`SIMCTL_CHILD_CONCIV_URL` (the app reads it as `CONCIV_URL`, which `ConcivWidget.attach()`
picks up). The value is the engine's own apiBase with no `/widget` suffix: the SDK appends
the `/widget` route itself, so passing a URL that already ends in `/widget` would load
`/widget/widget`. It carries no token. Set `concivUrl` in this plugin's options to override it, again as the API base
without `/widget`.

## Pairing file and discovery

On startup a dev engine that serves the native page writes
`~/.conciv/dev-endpoint.json` (`{apiBase, token, pid}`, mode `0600`, never logged)
and removes it on shutdown. The simulator shares the host filesystem, so the Swift
SDK reads that file to discover the engine deterministically, validates it with
`GET <apiBase>/health`, and falls back to probing a short candidate port list on
`127.0.0.1` (the pinned `4599` first). `apiBase` is the bare engine origin and `token`
the engine token. The engine serves `/widget` without a token and reads the token only
as the `?conciv_auth_token=<token>` query on each URL, so the WebView loads
`<apiBase>/widget?conciv_auth_token=<token>` and the native page hands that token to its
engine connection, as the web widget hands its token to `createConciv`. The origin pin
stays `scheme://host:port`.

The port probe runs whenever the pairing file does not yield a live engine: the file is
missing or unreadable, its JSON is malformed, or its `apiBase` fails the health check.
That last case is how a stale file from a crashed engine recovers. It is the recovery
path, not the primary one: an engine on any port is found through the file.

The SDK reads the fixed path `SIMULATOR_HOST_HOME/.conciv/dev-endpoint.json`. A host
whose plugin config sets `devEndpointDir` writes the file to that folder instead, so
the app never sees that engine's file: it drops to the
port probe, and it pairs with a different dev engine if that one left a healthy file at
the global path. Set `CONCIV_URL` to pin the engine explicitly.

## Auth and re-pair

Every engine url but `/health`, the `auth.*` procedures and the `/widget` page needs the
engine token as the `?conciv_auth_token=` query (no header, no path prefix). A page with
no token (a probed base, or `CONCIV_URL`, which carries none) opens untrusted and asks the
user to log in. A `401`/`404` on the page load means the base no longer serves this
engine's page; the SDK surfaces a visible re-pair prompt, and tapping it re-reads the
pairing file and re-attaches. There is no silent token refresh, and the token never appears
in any log line.

Same-engine port drift self-heals without relaunch: when the current base stops
responding, the SDK re-discovers and, if the pairing-file `pid` is unchanged (the same
engine process), re-sends the handshake so the page rebinds in place. A different `pid`
is a fresh mount at the new origin.

## Manual verification protocol

There is no macOS simulator lane in CI (slow, flaky, expensive), so this written
protocol is the v1 acceptance gate for the native path. Run it on a Mac with Xcode,
capturing a screenshot at each step as the evidence bundle (the spike stored
`last-pick.jpg`/`.json`; keep that debug-evidence habit behind an env flag, never in
shipped source).

1. `pnpm turbo run build --filter=@conciv/app` (fresh bundle).
2. Start the dev engine on the pinned port for a native project, or `pnpm exec turbo run dev --filter=ios-example`
   for the in-repo ConcivDemo app (`native/swift`, port 4599, `swiftc` mode).
3. From the agent panel, run `ios_build` then `ios_run`; confirm no bash approval
   prompts, the app boots in the sim, and the transparent overlay plus FAB appear over
   the native screen.
4. Tap a native control with the panel closed; it responds (hitTest passthrough).
5. Tap the FAB; the panel opens (single open, no flicker or retry). Tap grab, pick a
   native view, and confirm the staged image preview, text, and class appear in the
   composer.
6. Ask the agent about the grabbed view; it uses the subtree folded into `grab.text`
   plus `source` and grep to locate the Swift and can act. Run `ios_screenshot` (answers
   the screen as a PNG file part) to verify a change after `ios_build`/`ios_run`. There is no
   `ios_view_hierarchy` tool in v1.
7. Restart the **same** engine on a new port; confirm re-handshake re-binds without
   relaunching the app, with nav and session preserved (same-engine drift). Point the SDK
   at a **different** engine; confirm it fresh-mounts (no stale nav or session). Kill the
   WebView content process; confirm reload then fresh handshake with no blank overlay.
8. In the simulator (physical-device transport is deferred past v1): raise the software
   keyboard with Cmd+K, type in the composer, and confirm the keyboard does not cover it
   and the safe-area insets are correct.
