---
'@conciv/embed': patch
'@conciv/protocol': patch
---

`mount(el)` now resolves only once the widget can actually honor `open()`/`conciv:open-panel` — previously the returned promise settled as soon as the app's boot sequence finished computing, which raced ahead of the root route's `onMount` (where the open-panel listener registers). Any embedder that opens the panel immediately after `mount()` resolves — including a landing page's "Try it live" button that dispatches an early click before the widget bundle finishes loading — no longer has that open silently dropped.

`mountConciv(extensions)` now returns the underlying `mount()` promise instead of `void`, so a caller can `await` it (or observe a rejection) instead of the widget's readiness being unobservable outside `createConciv`. Existing fire-and-forget call sites keep working unchanged; they just ignore the returned promise.

New `@conciv/protocol/event-bus` export: `createEventBusClient`/`createEventBusHost`, a queue-until-connected event handshake (ported from TanStack Devtools' event-bus-client protocol) that eliminates the whole "sender fires before receiver is listening" class of races, not just the one above. `createConciv().open()`/`close()`/`toggle()` now emit through a bus client on the `conciv:panel-commands` channel instead of a bare `window.dispatchEvent`; the widget's root route answers as the bus host once its command listeners are registered. The wire event names (`conciv:open-panel`, `conciv:close-panel`, `conciv:toggle-panel`, `conciv:connection-changed`, `conciv:panel-toggled`) are unchanged, so existing raw dispatchers (the iOS bridge, tests) keep working exactly as before — the bus is additive reliability for callers that opt into it, not a breaking wire-protocol change.
