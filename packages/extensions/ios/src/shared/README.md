# ios/src/shared

## Overview

`bridge.ts` defines versioned zod schemas for the page-to-native and native-to-page messages, plus the neutral grab payload and a bounded view subtree. `bridge-client.ts` implements the page-side protocol. It repeats bridge.ready and handshake.hello on a timer, acks every valid native call by seq, negotiates the version, rebinds the API base, and correlates grab picks with timeouts. `meta.ts` defines `IosConfigSchema` and validates `concivUrl`. `page-base.ts` derives the API base from the page location by removing `/native` and everything after it.

## Interface

- `BRIDGE_MIN_VERSION` / `BRIDGE_MAX_VERSION` (`bridge.ts`): both 1
- `SUBTREE_MAX_DEPTH` / `SUBTREE_MAX_NODES` (`bridge.ts`): 3 and 40
- `PageToNativeSchema` (`bridge.ts`): discriminated union of bridge.ready, handshake.hello, grab.pick, grab.cancel, bridge.ack, host.panelToggled and host.log
- `NativeToPageSchema` (`bridge.ts`): discriminated union of handshake, bridge.incompatible, open, close, grabResult and grabCapability
- `BridgeMessageSchema` (`bridge.ts`): union of all 13 message schemas
- `NeutralGrabSchema` / `ViewNodeSchema` / `BoundedViewNodeSchema` / `RectSchema` / `SourceSchema` / `GrabImagePreviewSchema` / `GrabModeSchema` / `GrabResultReasonSchema` (`bridge.ts`): payload schemas, with modes `activate`/`comment` and reasons `cancelled`/`failed`
- per-message schemas and types such as `HandshakeSchema` and `GrabResult` (`bridge.ts`): one exported schema and inferred type for each message
- `createBridgeClient` (`bridge-client.ts`): returns a `BridgeClient` with `start`, `pick`, `cancel`, `cancelActive`, `panelToggled`, `grabbable` and `dispose`
- `BridgeTransport` / `BridgeScheduler` / `BridgeClientConfig` / `BridgeClient` / `BridgeLogLevel` (`bridge-client.ts`): exported types
- `IosConfigSchema` / `IosConfig` / `DEFAULT_DEVELOPER_DIR` / `IOS_NAME` (`meta.ts`): config schema with fields projectRoot, scheme, bundleId, simulator, developerDir, buildMode, extraSourceDirs and concivUrl; re-exports `IOS_NAME`
- `IOS_NAME` (`name.ts`): the string `'ios'`
- `nativePageBase` (`page-base.ts`): returns `origin` plus the pathname before the last `/native`

## Invariants

- `BoundedViewNodeSchema` (`bridge.ts`): rejects a subtree deeper than 3 levels or with more than 40 nodes, with a custom zod issue
- `GrabImagePreviewSchema` (`bridge.ts`): `kind` must be the literal `'image'`
- `nullish` helper (`bridge.ts`): converts null or undefined optional fields to `null`
- every message schema (`bridge.ts`): requires an integer `v`, and native-to-page messages also require an integer `seq`
- `handleHandshake` (`bridge-client.ts`): calls `onIncompatible` and does not complete the handshake when `v` is outside the range `BRIDGE_MIN_VERSION`..`BRIDGE_MAX_VERSION`
- `handleHandshake` (`bridge-client.ts`): calls `onRebind` only when the trimmed `apiBase` differs from the bound base
- `handleNativeCall` (`bridge-client.ts`): drops calls that fail `NativeToPageSchema`, and rejects the pending pick if the dropped call looks like its grabResult
- `handleNativeCall` (`bridge-client.ts`): every parsed call is acked with `bridge.ack {seq}` before it is dispatched
- `stopReadyLoopIfSettled` (`bridge-client.ts`): the ready and hello loop stops only after the first call has been acked and the handshake is done
- `handleGrabResult` (`bridge-client.ts`): drops a grabResult whose requestId does not match the pending pick; a null grab resolves to null when cancelled and rejects otherwise
- `pick` (`bridge-client.ts`): only one pick can be pending; a new pick resolves the previous one with null, and a pick times out after 10000ms by default, sending `grab.cancel` and rejecting
- `formatViewNode` (`bridge-client.ts`): folding the subtree into text stops at depth 3 and 40 nodes
- `start`/`dispose` (`bridge-client.ts`): both are idempotent, and calls are ignored after dispose
- `ConcivUrlSchema` (`meta.ts`): must be a URL; a trailing `/native` is removed, and the path must be empty or `/t/<token>`, otherwise `CONCIV_URL_RULE` is raised
- `FullIosConfigSchema` (`meta.ts`): `projectRoot` and `bundleId` must be non-empty; `simulator` defaults to 'iPhone 17 Pro' and `buildMode` to 'xcodebuild'
- `IosConfigSchema` (`meta.ts`): an empty object is treated as undefined, so the extension stays unconfigured

## Side Effects

- `createBridgeClient` `start` (`bridge-client.ts`): registers a native call handler on the transport and starts a repeating interval, 300ms by default
- `post` (`bridge-client.ts`): sends messages through `transport.postToNative`
- `pick` (`bridge-client.ts`): sets a timeout through the scheduler

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-ios` from the repo root (turbo builds the package and its dependencies first)
