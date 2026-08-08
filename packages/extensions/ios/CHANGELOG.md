# @conciv/extension-ios

## 0.0.19

### Patch Changes

- Updated dependencies []:
  - @conciv/extension@0.0.19
  - @conciv/grab@0.0.19

## 0.0.18

### Patch Changes

- [#169](https://github.com/conciv-dev/conciv/pull/169) [`830fc5d`](https://github.com/conciv-dev/conciv/commit/830fc5d17b3bf6ce146b413bb7ddb372ad2c821a) Thanks [@omridevk](https://github.com/omridevk)! - Ground the agent in the iOS session it is serving. `defineExtension` now accepts a `systemPrompt` factory `(config, {cwd}) => string`, and the iOS extension uses it to state the resolved project directory, bundle id, scheme, build mode, simulator, and working directory, and to rule out filesystem-wide scans such as `find /`.

- Updated dependencies [[`1e1b01b`](https://github.com/conciv-dev/conciv/commit/1e1b01b36c3b5c282d51a6689b8a18810a330fc2)]:
  - @conciv/extension@0.0.18
  - @conciv/grab@0.0.18

## 0.0.17

### Patch Changes

- [#155](https://github.com/conciv-dev/conciv/pull/155) [`d76c337`](https://github.com/conciv-dev/conciv/commit/d76c337ba404b1f5c23a6f548a92e008f09490dd) Thanks [@omridevk](https://github.com/omridevk)! - Fix native pick targeting and the --autoshow one-shot. Private UIKit chrome (list
  decoration views, separators, system background views) is no longer a pick candidate, so a
  tap in a SwiftUI List row stops attaching a blank full-section crop; the pick now snaps to
  the `.concivGrab` anchor on the tapped row even when the tap lands in the cell padding
  outside the anchor's own frame. Grab source labels never surface a mangled or
  underscore-prefixed class name, and view rects are reported as whole points instead of raw
  layout floats. `ios.run --autoshow` waits for the page to report its panel state before
  sending its single open, so the open no longer races the widget shell's listener or gets
  lost.
- Updated dependencies []:
  - @conciv/extension@0.0.17
  - @conciv/grab@0.0.17

## 0.0.16

### Patch Changes

- [#143](https://github.com/conciv-dev/conciv/pull/143) [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e) Thanks [@omridevk](https://github.com/omridevk)! - Add `@conciv/extension-ios`, the iOS built-in extension package, starting with its shared bridge layer: zod schemas and inferred types for the full WKWebView page-native message catalog (a single `type`-discriminated `BridgeMessage` union with `BRIDGE_MIN_VERSION`/`BRIDGE_MAX_VERSION`), the platform-neutral, transport-injected page-side bridge client state machine (ready re-posting, per-call acks, handshake retry and rebind, and the singleton grab pick engine with supersession, stale-result guarding, cancel, and a bounded timeout), and hand-maintained cross-platform conformance fixtures with a union-exhaustiveness and decode-equivalence test suite.

- [#143](https://github.com/conciv-dev/conciv/pull/143) [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e) Thanks [@omridevk](https://github.com/omridevk)! - Add the iOS extension server and client halves: `ios.build`/`ios.run`/`ios.screenshot`/`ios.logs` tools over a hermetic `SimctlRunner` seam (inert when unconfigured), the WebView bridge client that installs `window.__concivNative` and exports `makeNativeGrabProvider()`, a core-served native page built from `@conciv/embed`, and the plugin registration that wires it into `@conciv/it`.

- [#143](https://github.com/conciv-dev/conciv/pull/143) [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e) Thanks [@omridevk](https://github.com/omridevk)! - Harden the iOS transport and auth path (M5). `ios.run` now points the launched app at
  the core's own native page URL (carrying the `/t/<token>` prefix when the core is
  token-scoped) instead of a bare `CONCIV_URL` env, with an optional `concivUrl` config
  override. A dev core that serves the native page writes a `~/.conciv/dev-endpoint.json`
  pairing file (`0600`, never logged) on startup and removes it on shutdown, so the Swift
  SDK can discover the core deterministically on the simulator, validate it over
  `/health`, and fall back to probing a candidate port list. The SDK self-heals same-core
  port drift via a handshake rebind (pid-matched) and surfaces a re-pair prompt on a stale
  token (`401`/`404` on the token-scoped base).
- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e)]:
  - @conciv/extension@0.0.16
  - @conciv/grab@0.0.16
