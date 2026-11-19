# src

The iOS plugin. Its engine half builds, runs, screenshots and reads the logs of a native iOS app on the
simulator by running `xcrun`, `swiftc`, `plutil` and `codesign` as child processes. Its browser half is the WKWebView bridge
that the widget's native page talks to the Swift SDK through.

- The entries are `index.ts` (the engine plugin), `rpc.ts` (the bridge message schemas, mirrored by the Swift SDK) and
  `client.tsx` (the browser half); every other root file sits flat beside them, told apart by name.
- `bridge-machine.ts` is the pure bridge machine (announce, handshake, pick, dispose); `bridge.ts` is its Effect
  driver over a transport stream and derives the engine api base from the native page location (`nativePageBase`).
- Every child process goes through the `Simctl` service, so an interrupted tool call stops its child.
- Options are untrusted input and are parsed with zod where they enter (`config.ts`); without options every tool
  answers `{ok: false, error: 'ios plugin not configured'}` and no rules reach the system prompt.
- The engine half holds no state between tool calls beyond the parsed options.
