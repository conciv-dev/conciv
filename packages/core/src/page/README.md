# core/src/page

## Overview

The engine's side of the page plugin: in-process calls to the plugin's RPC methods, the delivery of finished page action queues to their session, and the grab attachment expander.

## Interface

- `makePageReader(host)` / `PageReader` (`page-rpc.ts`): the engine's in-process calls to the page plugin's RPC Definition (`experimental.page`, from `@conciv/plugin-page/rpc`) through the plugin host's `Rpc.Service.call` (a declared failure becomes an `Error` with its message), each answer parsed by that method's own output schema; the engine starters list that plugin last in the config's `plugins`; `tabs(sessionId)` is the plugin's own non-asking `tabs.list` method (`selectTabs`; a session with no tab answers no tabs, a failed read answers no tabs and is logged), read by `createTabs` (browser tab ids are the plugin's `tab_<uuid>`, focused first) and the outside refusal's tab title. Every `call` first awaits `Plugin.awaitActivation`, so a call that arrives while the plugins are still starting waits for them instead of answering 'unavailable'. The wait ends: `makeApp` builds the supervisor (which takes the registry hold) before it serves, an activation that fails is logged and still releases the hold, and disposing the engine closes the registry, which opens the latch (a call then answers 'unavailable'). Only a plugin activation that never settles keeps it waiting, as it keeps every `Plugin.awaitActivation` caller.
- `makePagePlugin(host, reader)` / `PagePlugin` (`page-plugin.ts`): the hub's queue calls, through the reader's `call`; `queueWait` answers the hub's `page.queue.wait` with the plugin's `queue.wait`, which marks the result delivered at the hand-over (the hub task answer is the delivery); `hubFinished(sessionId)` / `startedBy` / `hubCall` / `hubReplied` keep the hub side (a hub call id stays hub work while it is in flight, and after its reply while a queue it started is still playing or owed, read back from `queue.startedBy` and `queue.owed`); `deliverFinished()` listens on the host bus for the plugin's `queue.finished` and, for a queue the hub did not start, takes its result through `queue.undelivered` (marked delivered) and hands it to the session with `Session.synthetic` (`queueNotice` text, description `Queued page actions <status>`), as opencode's background jobs report: it waits in the inbox for a live run to end, or wakes the idle session; a deleted session answers `Session.NotFoundError`, which is dropped.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/core` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
