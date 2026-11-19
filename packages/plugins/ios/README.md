# @conciv/plugin-ios

The conciv iOS plugin, engine part. It builds, runs, screenshots and reads the logs of a native iOS app on the
simulator through `xcodebuild`, `swiftc` and `simctl`.

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
- Invariant: `concivUrl` is the engine api base with no page path (an optional `/t/<token>` prefix is allowed); a
  trailing `/native` is stripped because the Swift SDK appends `/native` itself. Without it the app gets the url of
  the engine's own server.
- Side effect: `ios_build` and `ios_run` start child processes and write the `build/<module>.app` bundle in swiftc
  mode; `ios_run` boots the simulator and installs and launches the app.
