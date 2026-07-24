---
'@conciv/extension-ios': patch
---

Add `@conciv/extension-ios`, the iOS built-in extension package, starting with its shared bridge layer: zod schemas and inferred types for the full WKWebView page-native message catalog (a single `type`-discriminated `BridgeMessage` union with `BRIDGE_MIN_VERSION`/`BRIDGE_MAX_VERSION`), the platform-neutral, transport-injected page-side bridge client state machine (ready re-posting, per-call acks, handshake retry and rebind, and the singleton grab pick engine with supersession, stale-result guarding, cancel, and a bounded timeout), and hand-maintained cross-platform conformance fixtures with a union-exhaustiveness and decode-equivalence test suite.
