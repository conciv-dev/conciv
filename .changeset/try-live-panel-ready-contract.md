---
'@conciv/embed': patch
'@conciv/extension-ios': patch
'@conciv/protocol': patch
---

`mount(el)` now resolves only once the widget can actually honor `open()` — previously the returned promise settled as soon as the app's boot sequence finished computing, which raced ahead of the root route's `onMount` (where the open-panel listener registers). Any embedder that opens the panel immediately after `mount()` resolves — including a landing page's "Try it live" button that dispatches an early click before the widget bundle finishes loading — no longer has that open silently dropped.

`mountConciv(extensions)` now returns the underlying `mount()` promise instead of `void`, so a caller can `await` it (or observe a rejection) instead of the widget's readiness being unobservable outside `createConciv`. Existing fire-and-forget call sites keep working unchanged; they just ignore the returned promise.

New `@conciv/protocol/event-bus` export: `createEventBus`/`createEventBusClient`, a faithful port of the TanStack Devtools in-page event-bus protocol. It eliminates the whole "sender fires before receiver is listening" class of races, not just the one above. Every emit is wrapped as an envelope (`{type: '<pluginId>:<suffix>', payload, pluginId}`) and dispatched on one fixed bus event (`conciv-dispatch-event`); the running bus re-dispatches it as both a specific `<pluginId>:<suffix>` event and a global `conciv-global` event, and answers the fixed `conciv-connect` handshake with `conciv-connect-success`. Clients queue emits until connected, retry on a bounded loop, and flush in order on ack.

Panel commands moved onto that protocol under the `panel` plugin id, so the wire events are now `panel:open`, `panel:close` and `panel:toggle` instead of `conciv:open-panel`, `conciv:close-panel` and `conciv:toggle-panel`, and they are spoken through a bus client rather than a bare `window.dispatchEvent`. `createConciv().open()`/`close()`/`toggle()`, the landing page's "Try it live" button, and the iOS bridge's panel open/close all emit through a client; the widget's root route subscribes with `client.on()` and starts the bus once its listeners are registered. Status events (`conciv:connection-changed`, `conciv:panel-toggled`) are unchanged raw window events.
