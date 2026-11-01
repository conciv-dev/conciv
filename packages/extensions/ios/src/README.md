# ios/src

## Overview

`server.ts` defines the `ios` extension with `IosConfigSchema`, the tools `ios_build`, `ios_run`, `ios_screenshot` and `ios_logs`, and `iosSystemPrompt`. It also builds the tool context (config, exec runner, cwd, nativeUrl). `client.tsx` creates a bridge client on top of the `window.webkit.messageHandlers.concivBridge` transport and exposes `window.__concivNative` for calls coming from native. It sends panel open and close commands through the event bus, provides a native grab provider, and renders an alert when the bridge versions are incompatible.

## Interface

- default export (`server.ts`): `defineExtension({name: IOS_NAME, configSchema: IosConfigSchema, tools, systemPrompt: iosSystemPrompt})` with a server context of `{config, runner: makeExecRunner(), cwd, nativeUrl}`
- tool `ios_build` (`server.ts`): input `{clean?: boolean}`, output `BuildOutputSchema`, approval `ask`, mutating
- tool `ios_run` (`server.ts`): input `{autoshow?: boolean}`, output `RunOutputSchema`, approval `ask`, mutating
- tool `ios_screenshot` (`server.ts`): empty input, output `ScreenshotOutputSchema`, read-only
- tool `ios_logs` (`server.ts`): input `{sinceSeconds?, predicate?, limit?}`, output `LogsOutputSchema`, read-only
- `ios` / default export (`client.tsx`): client extension named `IOS_NAME` with `Surface: IosBridgeSurface`; its client setup calls `ensureBridge()`
- `makeNativeGrabProvider` (`client.tsx`): returns a `GrabProvider` whose `pick`, `comment`, `cancel`, `isActive` and `grabbable` go through the native bridge
- `nativePageBase` (`client.tsx`): re-exported from `./shared/page-base.js`
- global `window.__concivNative` (`client.tsx`): object with `handshake`, `bridgeIncompatible`, `open`, `close`, `grabResult` and `grabCapability`, each forwarding to the bridge with the message `type` set
- window event `conciv:panel-toggled` (`client.tsx`): listened to and forwarded as `bridge.panelToggled`
- Subdirectories:
  - [server](./server/README.md): Server-side code for the iOS tools: it runs xcrun, xcodebuild, swiftc, simctl, plutil and codesign through `execFile`, parses compiler diagnostics, and builds the iOS system prompt.
  - [shared](./shared/README.md): Code shared by server and client: the zod schemas for the page/native bridge protocol, the page-side bridge client state machine, the iOS config schema, the extension name, and the native page-base helper.

## Invariants

- `LogsInput` (`server.ts`): `sinceSeconds` is a positive int up to 3600, `predicate` is at most 2000 chars, `limit` is a positive int up to 5000
- `ensureBridge` (`client.tsx`): creates at most one bridge, and only when `window.webkit.messageHandlers.concivBridge` exists; otherwise it returns null
- `makeNativeGrabProvider` `doPick` (`client.tsx`): closes the panel before a pick and reopens it only if the request token is still the active one
- `onPanelToggled` (`client.tsx`): ignores the event when there is no bridge or no `detail`, and converts `open`/`connected` to booleans with `=== true`
- `panelCommands` (`client.tsx`): event-bus client with `reconnectEveryMs: 500` and `maxRetries: 60`

## Side Effects

- `makeWebkitTransport` (`client.tsx`): assigns the global `window.__concivNative` and posts messages through `window.webkit.messageHandlers.concivBridge.postMessage`
- `ensureBridge` (`client.tsx`): adds a `conciv:panel-toggled` listener on window, starts interval and timeout timers, and dispatches a `conciv:rebind` CustomEvent on rebind
- `panelCommands.emit('open'|'close')` (`client.tsx`): sends panel commands over the `PANEL_PLUGIN_ID` event bus
- `onLog` (`client.tsx`): writes bridge logs to `console`
- default export server context (`server.ts`): tools run child processes through `makeExecRunner()`

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-ios` from the repo root (turbo builds the package and its dependencies first)
