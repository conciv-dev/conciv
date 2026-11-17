# plugin-page/src

## Overview

The engine part of conciv's built-in page plugin: the plugin `conciv.page` (`.`), which registers the RPC
`experimental.page` (`./rpc`) and answers its one method, `symbolicate`, under the plugin's directory. Core passes it
to the plugin host as a post built-in and asks it over that RPC whenever it needs a frame's source.

## Interface

- default export (`index.ts`): the engine plugin `conciv.page`
- `symbolicateFrame` / `symbolicateFrames` (`symbolicate.ts`, internal): map frames (`RawFrame`) to original source
  (`SourceLoc`, both from `@conciv/protocol/page-introspect-types`) with @jridgewell/trace-mapping; the `symbolicate`
  method answers with `symbolicateFrames`
- `Definition` (`rpc.ts`, `./rpc`): the RPC `experimental.page` with `symbolicate` alone
- option `pageReplyTimeoutMs` (`connection.ts`, milliseconds, default 5 000): how long a tab has to answer an action that declares no timeout of its own, and to accept a queue
- option `queuedActionTimeoutMs` (`connection.ts`, milliseconds, default 7 000): how long each queued action has to confirm once the tab reaches it
- option `permissionSyncTimeoutMs` (`connection.ts`, milliseconds, default 10 000): how long granting or revoking a tab's page permissions on its session may take before the attach is refused (the tab retries on its back-off)

## Invariants

- `readFileInRoot` (`symbolicate.ts`): throws on a realpath outside the project root
- `fetchLoopback` (`symbolicate.ts`): refuses hosts other than localhost, 127.0.0.1, ::1 or [::1]
- `symbolicateFrames` (`symbolicate.ts`): skips node_modules results; `symbolicateFrame` returns null on any error

## Side Effects

- `symbolicate.ts`: reads files and fetches source maps over loopback HTTP
