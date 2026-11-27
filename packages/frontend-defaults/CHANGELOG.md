# conciv

## 0.0.23

### Patch Changes

- [#986](https://github.com/conciv-dev/conciv/pull/986) [`6ce2a3b`](https://github.com/conciv-dev/conciv/commit/6ce2a3b90edaebce61a9cafc93dfd6e530b16ddf) Thanks [@omridevk](https://github.com/omridevk)! - A draft that was never saved to the engine is gone when this browser is logged out of the engine or its access is revoked: the widget empties its local draft store (`conciv-drafts`) at that moment.

  Text typed and reloaded at once comes back even when its last save was still being written as the page went: leaving the page writes that save again, and every draft change is written to this browser at once, with no 100 ms batch.

- [#1016](https://github.com/conciv-dev/conciv/pull/1016) [`81007d1`](https://github.com/conciv-dev/conciv/commit/81007d1f6e3b584203e56f85db1ad38d1a6dc97c) Thanks [@omridevk](https://github.com/omridevk)! - A first send in a new pane no longer flips the conversation to "Loading conversation" while the pane's marker rows are still loading; the prompt and the reply stay on screen.

- [`b364a93`](https://github.com/conciv-dev/conciv/commit/b364a936be45e769c7d5c0ea465c2577c8f32cde) Thanks [@omridevk](https://github.com/omridevk)! - A plugin turned off and on again keeps its place in the tab order, which follows the plugin list.

- [#965](https://github.com/conciv-dev/conciv/pull/965) [`a80cf98`](https://github.com/conciv-dev/conciv/commit/a80cf986cfd6e4c48b2d78f5e328884046444df5) Thanks [@omridevk](https://github.com/omridevk)! - A page on a plugin's settings page or tab keeps its place while the browser is logged out or revoked. Opening that page again after a revoke and logging in shows the plugin's page, instead of sending it to General or to the chat and saving that move.

- [#997](https://github.com/conciv-dev/conciv/pull/997) [`db061b8`](https://github.com/conciv-dev/conciv/commit/db061b8fc2e27041b3b892ae0177133da05056b0) Thanks [@omridevk](https://github.com/omridevk)! - A built-in plugin's `ToolCall` can now draw a tool's whole card, while the call runs and after it finishes, with its duration and page capture, by giving a `card` instead of a body `render`.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - An error thrown while the panel renders shows its own message instead of "conciv couldn't reach the engine", and its Retry no longer resets the engine connection. Only a failure of the engine connection itself counts as an unreachable engine: `@conciv/protocol` marks those failures with `engineUnreachable` and tells them apart with `isEngineUnreachable`, and `isReachabilityError` checks only that mark, so a draft save is no longer retried for an error that is not a connection failure.

- [#907](https://github.com/conciv-dev/conciv/pull/907) [`64c2f50`](https://github.com/conciv-dev/conciv/commit/64c2f5051d0558d7d1a7cb43a9e68f3970709c6b) Thanks [@omridevk](https://github.com/omridevk)! - A new session that has not run anything yet no longer says DONE in the status bar or LAST TASK in the header. The bar shows no status until the first message runs, and the header reads just CONCIV. After the first turn they read as before, and a session that ran reads DONE as soon as it opens, before its conversation loads.

  Every session row (`sessions.get`, `sessions.list`, `sessions.search`) now carries `lastRunAt`: when its newest run started, or `null` before the first run. `sessions.create` now answers `{sessionId, session}`, the new session's row, so a new session draws at once.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - Under reduced motion a closed plugin dialog leaves the page at once instead of after its 100ms exit wait.

- [`08ec016`](https://github.com/conciv-dev/conciv/commit/08ec0167dc2c63a8f00eb3edc078bd331f2ed0f2) Thanks [@omridevk](https://github.com/omridevk)! - The app has one entry, `ConcivApp` over a `Platform`; the embed page host, the native host, the dev server and the app tests render it instead of rebuilding the boot.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - ConcivTimings takes picker: {searchWaitMs, previewWaitMs}, the session picker's search and preview debounces; the test kit sets both to 0.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - Reopening the quick terminal right after closing a pane no longer opens the session that pane is still deleting: the delete and the resume of the latest session run in one mutation scope, in order.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The app's UnoCSS scan covers only the app, the kits, tools and the core cards; it scans no plugin, and every plugin ships its own sheet. A browser test's generated sheet covers the shell's scan plus the source of the package under test, so a plugin's own suite keeps that plugin's classes.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The quick terminal's split drag listens on the window through the layer's owner, so its listeners go with the layer instead of staying until the next pointerup.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A plugin store key that is missing from localStorage reads as missing: clearing site data or removing the key in another tab no longer leaves the old value in the page.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - Disposing the app right after a navigation no longer warns that the navigation could not be saved: the app's own teardown aborted that save.

- [#1171](https://github.com/conciv-dev/conciv/pull/1171) [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d) Thanks [@omridevk](https://github.com/omridevk)! - A built-in plugin takes its options from its config entry, as any plugin does: `plugins: [['conciv.page', {pageReplyTimeoutMs: 1000}]]` reaches the page plugin's `ctx.options` in the engine, and the plugin list carries those options to the plugin's window part, as a package plugin's bundle does. The window part of the page plugin now has the id `conciv.page`, the same as its engine part. The engine's own `pageReplyTimeoutMs` and `queuedActionTimeoutMs` start options, the test engine's timeouts of the same names, the app's `timings.page` and the kit's `mount({timings})` are gone.

- [#1106](https://github.com/conciv-dev/conciv/pull/1106) [`4e7e593`](https://github.com/conciv-dev/conciv/commit/4e7e5931c68dbe82f82930e1f358ab252c484d23) Thanks [@omridevk](https://github.com/omridevk)! - A chat turn rides the browser rpc socket. `chat.send({sessionId, messages, runId})` starts the run once and streams it, and `chat.join({runId, lastEventId?})` streams a run from an event id; every event carries its offset in the run's log as its id, so a resubscribe after a drop never repeats one, and a resend of a known run id streams it instead of running it again. The `/chat-ws` socket, the `/chat-sse` stream, their path constants, the transport probe and the widget's `transport` setting are gone. `chatConnection` drops its transport options, and `@conciv/ai/client` exports `rpcStream` in place of `fetchServerSentEvents` and `webSocket`. A chat run that loses its stream retries on the rpc socket up to five times in a row with no event in between (250 ms doubling to 5 s), an event restarts that count, and once it is spent the turn fails with TanStack AI's `StreamReconnectLimitError`, as the old chat socket did; an error the engine answers is not retried.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - After a reload of the widget, the composer has its focus again, with the caret where your draft left it, so you can keep typing straight away. Before, the draft text came back but typing went nowhere until you clicked the composer.

- [#1171](https://github.com/conciv-dev/conciv/pull/1171) [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d) Thanks [@omridevk](https://github.com/omridevk)! - A built-in turned off in the engine config (`plugins: ['-conciv.page']`) is absent from the engine's plugin list, as in opencode. The app reads that absence for a window built-in it knows has an engine half (`BUILTINS_WITH_ENGINE_HALF`) and keeps its window part off too, whatever the Settings rows say, so one entry turns off both halves of the page plugin.

- [#940](https://github.com/conciv-dev/conciv/pull/940) [`15b1cae`](https://github.com/conciv-dev/conciv/commit/15b1caea3e7e068f96815f193a34a297648d59f5) Thanks [@omridevk](https://github.com/omridevk)! - A plugin's `ServerRef.connected` and `ConcivClient.connection` now go down when the engine's socket drops, even while other readers hold the event stream. The client opens the event stream without the transport's own retry, so a socket close ends the stream and the client's reconnect loop reads `'reconnecting'` and subscribes again every second, as opencode's does.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The reader that forgets sessions deleted on the engine is an Effect program: it waits for a bound engine, streams the engine's events, and stops by interruption when the app is disposed. Disposing it aborts its event subscription through a signal, so a subscription waiting for its next event ends at once, and a failure that arrives together with the interruption is still logged.

- [`00c0448`](https://github.com/conciv-dev/conciv/commit/00c0448b43aaac912094c595bd31f33807f340f7) Thanks [@omridevk](https://github.com/omridevk)! - The dev server keeps its engine across a reload: the root route retains `?core` on every navigation.

- [`cf45f50`](https://github.com/conciv-dev/conciv/commit/cf45f50450686a428a353d52c6814628e5134ed6) Thanks [@omridevk](https://github.com/omridevk)! - The dev server keeps `?settings=` across a reload, and after a rebind its address names the new engine in `?core=`, so a reload stays on it.

- [`161830a`](https://github.com/conciv-dev/conciv/commit/161830a41fcea1269136b174f8d71863ad51aa52) Thanks [@omridevk](https://github.com/omridevk)! - A draft save that starts after the app is torn down no longer runs against the closed engine connection, so unmounting the widget with a draft still to save logs no error; the device draft copy keeps the text for the next load.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `Platform.draftStore` is a factory, `(writable) => DraftStore | undefined`, which the app calls with its trust check. The browser store asks that check before each IndexedDB write transaction again, so a draft save that started while the engine trusted this browser and ran past a revoke no longer lands after the store is cleared.

- [#1101](https://github.com/conciv-dev/conciv/pull/1101) [`1335489`](https://github.com/conciv-dev/conciv/commit/1335489df5c6628934d916c806af21e526f666d7) Thanks [@omridevk](https://github.com/omridevk)! - A draft typed and reloaded at once is back in the composer in Chromium even while another tab holds the draft database: the page keeps a copy in sessionStorage when it is left. A tab that loads before it is trusted no longer empties the drafts every other tab keeps in this browser; only a revoked trust does.

- [#876](https://github.com/conciv-dev/conciv/pull/876) [`d8c2c1b`](https://github.com/conciv-dev/conciv/commit/d8c2c1b3850be01ab52fa35f998ef247c6bd5671) Thanks [@omridevk](https://github.com/omridevk)! - The text you typed in the chat is still there when you switch views quickly and come back.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - Each quick terminal pane is a region named by its session.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - The "Engine is running outdated code" notice now goes away with the panel, quick terminal or picture-in-picture window that raised it, so it no longer stays up after the engine was restarted with fresh code.

- [#848](https://github.com/conciv-dev/conciv/pull/848) [`8d57382`](https://github.com/conciv-dev/conciv/commit/8d57382a4365e2031bc484478b5b8950bd45cca9) Thanks [@omridevk](https://github.com/omridevk)! - Escape in the composer while a run is stopping now closes the chat panel instead of being swallowed by a second stop request, matching the Stop button, which is already disabled while the run stops.

- [`8a2be86`](https://github.com/conciv-dev/conciv/commit/8a2be866cd08e706a587b56345db6a0b666f787c) Thanks [@omridevk](https://github.com/omridevk)! - Every holder of an engine connection takes the engine timings, so a widget with engine timings set keeps one socket per api base, and the embed init forwards timings to the app.

- [#968](https://github.com/conciv-dev/conciv/pull/968) [`1780a56`](https://github.com/conciv-dev/conciv/commit/1780a5662afcdb273b2ac2d212ba49487f1b1216) Thanks [@omridevk](https://github.com/omridevk)! - A tool call with no card of its own now reads "Called <tool>" with its main input and up to three other arguments, and its trace row shows that input instead of the tool name.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - Buttons and text fields follow one size scale, the same height in every browser. `Button` sizes: `xs` 24px with 11px text, `sm` 28px with 12px text, `md` (the default) 32px and `lg` 36px with 13px text, so no button's text is larger than the panel's body text. Square icon buttons come in `icon-xs` 24px, `icon-sm` 28px, `icon` 32px and `icon-lg` 36px. `TextField` takes `size` `md` (32px) or `lg` (36px), as tall as a `Button` of the same size, so the two line up in a row. Medium buttons and inputs are 32px tall, they were 38px; small buttons are 28px, they were 22px, and the compact ones (session list retry rows, recorder actions) use `xs`. A plugin's `Ui.Button`, `Ui.IconButton` and `Ui.TextInput` map their small, normal and large sizes onto this scale. The rest of the kit's controls follow it too: `TooltipIconButton` defaults to the 32px `icon` size, the `Select` trigger, `ComboboxSelect`, `NumberInput`, `PasswordInput` (its show and copy buttons now 28px), `TagsInput`, the `ColorPicker` swatch and hex input, and the `Tabs` trigger are 32px, and the widget's settings back button, quick terminal header buttons, empty-state starters, conversation retry button and the whiteboard inbox toggle use the scale's sizes instead of 36 and 38px. The settings Views list's pin buttons are 32px too, they were 30px.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `mount` takes `plugins` by name, as the config does, and with no engine opens the app in servers mode on its connect panel, as the embed does. `createEngine(config, {port: 'connect', token})` starts the engine on the first free connect port (4732 to 4741) with that token. The app opens its event stream only once an engine is bound, so a servers-mode app no longer logs that the core is not connected.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - The "pop-out window could not be reopened" notice and the "lost connection to the engine" notice now go away when the panel, quick terminal or picture-in-picture view that raised them closes. Before, opening the quick terminal from the panel kept the panel's pop-out notice on screen, and its button acted for a panel that was already gone.

- [#827](https://github.com/conciv-dev/conciv/pull/827) [`f2d65ca`](https://github.com/conciv-dev/conciv/commit/f2d65ca836ddf7ff5cdd79bcd56a4f7aab86bb00) Thanks [@omridevk](https://github.com/omridevk)! - A long chat session no longer leaks memory through truncated text and icon button tooltips: the shared tooltip group kept one reactive slot for every row that ever mounted, so a tab driven by an outside agent grew by about 50 slots per page call. The chat panel's focus trap now lets go while focus sits on the host page, so Tab on the host page moves through the host page instead of jumping into the panel, and the trap no longer rescans the panel on every chat update while an agent drives the page.

- [#937](https://github.com/conciv-dev/conciv/pull/937) [`e67cfba`](https://github.com/conciv-dev/conciv/commit/e67cfba64e8f66b708b16d3e5c1fd031f4984511) Thanks [@omridevk](https://github.com/omridevk)! - Menus and popovers fit the space the screen has. On a short screen the composer pill menus, the Notes popover and the model menu no longer run off the top: their heading and first row stay in view and the list scrolls. The kit `Menu` and `Popover` turn on zag's `fitViewport` by default, the kit `Positioner` is a flex column, and the content shrinks inside it, so each menu's own `max-h` stays the upper bound. On a short screen the hovered session's preview fits and its newest entry stays in view. At normal sizes nothing moves.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A Minimize click gives the launcher its focus back: the panel's composer focus no longer re-runs on the click.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `mount({engine, history})`: `createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})` from `@conciv/plugin-testkit/browser` writes its current entry as the tab's last screen in sessionStorage and the app restores it as a reload does in production; any TanStack `RouterHistory` (`createMemoryHistory`) is used as the app router's history and stays a handle for the test. The app's `Platform.navigation` memory form is now `{history: RouterHistory}`, and the embed's servers mode builds its own memory history for the connect path.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The widget remembers its last screen per browser tab, as opencode does, and the engine no longer keeps the navigation.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A session you just started is in the session picker at once, so the picker highlights it.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - Notices can now carry a description under the message, an icon, their own display time, several actions and a loading state, and a notice can be dismissed from the code that raised it. A success notice shows a check mark. One notice list now serves the whole widget, so a notice raised before the chat view opens shows as soon as it does. Notices that use none of this look exactly as before.

- [#1083](https://github.com/conciv-dev/conciv/pull/1083) [`fd70449`](https://github.com/conciv-dev/conciv/commit/fd70449a40e5606bfefaa13d2475b7b8be896de9) Thanks [@omridevk](https://github.com/omridevk)! - The old try-it extension (`@conciv/extension-try-it`) is deleted; `@conciv/plugin-try-it` replaces it. The widget's connect gate is gone with it: `defineExtension` no longer takes `connectGate`, the extension `connect` slot and its host API are removed, and a widget mounted without an `apiBase` boots in servers mode when it is given plugin entries.

- [#1034](https://github.com/conciv-dev/conciv/pull/1034) [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563) Thanks [@omridevk](https://github.com/omridevk)! - The composer and the Terminal share one model selector from the chat kit. The Terminal's selector says Models… while it reads the model list, and after a failed read it offers Retry inside the selector, as the composer does. The selector keeps one width while it loads, fails or has no models, so the tabs beside it stay still. The composer's model prompt stays enabled when the session's harness lists no models, so it still opens and another harness can be picked; only the Terminal's pill turns disabled then.

- [#818](https://github.com/conciv-dev/conciv/pull/818) [`90f01d8`](https://github.com/conciv-dev/conciv/commit/90f01d88e6e00e60eff4caf5c430414965fdd219) Thanks [@omridevk](https://github.com/omridevk)! - The widget and every extension now share one TanStack Query copy, bundled inside `@conciv/client` and patched for TanStack/query#11230, so a background refetch no longer steals focus from the model search or the composer in host apps. The terminal's model picker reads the same cached model list as the composer.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - Opening a whiteboard comment thread from the inbox no longer loses it: the plugin overlay's focus trap is rebuilt only when an overlay opens or the last one closes, not on every overlay change, so a rebuild can no longer hand focus back to the inbox row and dismiss the thread.

- [#946](https://github.com/conciv-dev/conciv/pull/946) [`9d7ef70`](https://github.com/conciv-dev/conciv/commit/9d7ef700e1f0519e3f5cc5352086c013ed9b8760) Thanks [@omridevk](https://github.com/omridevk)! - Plugins can now use the page through two contracts from `@conciv/frontend-plugin-api/page`: `Page` (find the source line behind stack frames, show a toast on the page, and the settings a page capture needs) and `ReactTree` (read the React tree behind an element). conciv's built-in page plugin provides both in the widget. The new package `@conciv/plugin-page` is the page plugin's engine half: the engine runs it, and it answers its `symbolicate` method (`@conciv/plugin-page/rpc`), which maps stack frames to source lines. The engine now asks it over that method whenever it needs a frame's source, also to open a source in the editor; with the page plugin removed by config, opening a source opens the frame as the page gave it. `GrabFrame` now comes from `@conciv/frontend-plugin-api/grab`; `@conciv/grab` re-exports it.

  The plugin host now takes the engine's own plugins as built-ins: `InstancePlugins.bound(plugins, {pre, post})` runs them in the same places as its internal plugins, and the Settings plugin list hides them, so a user can no longer reload or switch off the page plugin's engine half.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The agent's page mask timeout is settable: the app's `timings.page.taskTimeoutMs` reaches the built-in page plugin, and the kit's `mount({timings})` sets it in a test.

- [`976168a`](https://github.com/conciv-dev/conciv/commit/976168a4c190249ef75e7fd9dd064e62252ff7bb) Thanks [@omridevk](https://github.com/omridevk)! - The panel resolves its routed session before it loads: a restored session the engine swept as empty is created again instead of failing with "session not found", and a deleted session opens the latest one.

- [#1095](https://github.com/conciv-dev/conciv/pull/1095) [`0040247`](https://github.com/conciv-dev/conciv/commit/00402478d56e462a750212086ddf5202f7e51316) Thanks [@omridevk](https://github.com/omridevk)! - The chat panel's width separator reports the real floor and ceiling, and a drag or key never stores a width wider than the screen can draw.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - The widget carries the state machines of the plugin browser host, copied from opencode; nothing runs them yet. The SDK's `@conciv/frontend-plugin-api/host` now exports `BridgePluginExperimental` and `BridgePluginExperimentals`, the list of plugin browser parts to run. `Storage.store` takes the `project` scope, the repo the engine runs in, as declared stores do. A settings key may now be up to 512 characters, so a plugin store named after a long package name fits. `editor.open` and the `open` tool take an optional `column` beside `line`, and the editor opens at that column; a column without a line is ignored.

- [`b6194ed`](https://github.com/conciv-dev/conciv/commit/b6194ed101067321b12435f052ef4590771e88a5) Thanks [@omridevk](https://github.com/omridevk)! - The widget's plugin bundle loading runs on Effect: a scoped driver over the host machine owns the engine watch, the listing and its timeout, and the watch retry, so teardown is one scope close.

- [#896](https://github.com/conciv-dev/conciv/pull/896) [`4b12a07`](https://github.com/conciv-dev/conciv/commit/4b12a07ebbe330348aca0b98d5a2be928d311a50) Thanks [@omridevk](https://github.com/omridevk)! - `experimental()` no longer inlines a plugin's dynamic `import()`: the build writes a CommonJS entry, one `.cjs` chunk per `import()` and Vite's manifest beside the entry (`plugin-experimental.cjs.manifest.json`).

  The app loads a plugin's entry with the chunks it requires at start (`plugin.experimental` now answers them as `chunks`) and each `import()`ed chunk on demand over the engine socket, through the new `plugin.experimentalChunk` procedure. The engine serves only the files the plugin's manifest lists, and refuses with `PLUGIN_CHUNK_NOT_FOUND` a file the manifest does not list or whose bytes changed since the plugin loaded.

  A lazy chunk may require the plugin's entry, as Vite writes when the lazy part imports a value the entry exports: `plugin.experimental` also answers the entry's file name as `file`, `BridgePluginExperimental` carries it, and `evaluatePluginBundle`'s `PluginBundle` carries the entry's `exports`, which the app gives a chunk that requires `./<file>`. Both fields are additive. The engine leaves the entry out of a chunk's closure instead of refusing the manifest.

- [#912](https://github.com/conciv-dev/conciv/pull/912) [`d8e27f2`](https://github.com/conciv-dev/conciv/commit/d8e27f2dde4d6bc4c7060862d0a799a0942a48b5) Thanks [@omridevk](https://github.com/omridevk)! - Plugin pills sit above the composer, beside the `session.status` slot, in ascending order. A pill whose `show` returns `undefined` renders nothing. A plain pill runs on click, a rows pill opens a menu of its rows, and a menu pill opens a popover around the plugin's content.

- [`cb3d0c4`](https://github.com/conciv-dev/conciv/commit/cb3d0c4b9ff264d5a24e732793dd0f05bbff7454) Thanks [@omridevk](https://github.com/omridevk)! - A plugin composition failure (two plugins with one id) throws before the app starts anything, so no engine connection, login or navigation restore is left running, and no callback reads a binding before its declaration.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A plugin experimentals listing that times out says the engine did not list them.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - The widget builds a browser plugin's host APIs: stores, toasts, the clipboard, downloads, external links, the editor, the one engine as a server, the app's route and theme, and panel views opened through the route. `System.save` and `System.openExternal` are implemented; `Layout.draft` opens a draft only on the engine, in its project root.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - The widget runs the plugin host: plugins load from the engine, draw their slots, panel tabs and overlays, open their dialogs, and read and write the routed session's composer.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A plugin's `ctx.layout.settings('<page>')` now opens that plugin's own settings page, or a host page (`general`, `views`, `shortcuts`, `plugins`, `advanced`); before, every page but `general` did nothing. A page the plugin does not have lands on General.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A link to a plugin's tab or to a plugin's settings page no longer sends you to the chat or to General when the conciv engine cannot be reached. The address stays the one you opened, the "conciv lost connection to the engine." notice offers Retry, and once the engine answers the page you asked for opens. A plugin that is really gone still sends you back, once the engine has answered.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - The installed plugins list in settings follows the engine: a plugin added or removed while settings are open shows up without reopening them.

- [#962](https://github.com/conciv-dev/conciv/pull/962) [`c6bdfb5`](https://github.com/conciv-dev/conciv/commit/c6bdfb5ca6fbabce26f5b5667b63a05f4356f82b) Thanks [@omridevk](https://github.com/omridevk)! - A re-login keeps the running plugins: the plugin loader mounts once, on the first trust, and reads one stable source, so an unchanged plugin is not torn down and started again.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - The widget's plugin host computes a session's plugin mobile views (`Panel.mobile`): tab views and menu or drawer views, each sorted by `order`.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - The widget builds the routed session and its composer as plugins see them: `Composer.text`, `insert`, `setText` (no longer declared only) and `focus` act on the chat pane's composer, and writes made before the session's draft loads wait and apply in call order.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - The unread plugin new-tab machine and its session pane list are removed.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - The widget's plugin host gains the panel region a session layout draws: it lists pinned tabs and the routed tab, redirects a tab id a panel normalizes to its normal form, and runs the panel's `close` on `Layout.close` and on a toggle off.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A plugin panel that throws no longer takes down the session view. A panel whose tab list throws shows no tabs, and a throw while it renames a stored tab, or while its tab is focused or closed, is skipped. The error shows under the plugin in Settings > Plugins until Reload starts it again, and the chat and every other plugin keep working.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The Settings plugin list says, under the list, that a switch turns off only a plugin's page UI and how to turn off its server part, as opencode.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A plugin tab opened by an old key that the plugin's panel renames (its `normalize`) now shows the renamed tab, also when the key is opened after the chat has loaded. Before, only a key already open when the plugin registered its panels was renamed, and a later `layout.open` of an old key left an empty tab.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A plugin's slots and code blocks are drawn in the session, and its link handlers open local links and tell which of them exist.

- [#985](https://github.com/conciv-dev/conciv/pull/985) [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580) Thanks [@omridevk](https://github.com/omridevk)! - A plugin can see and stop the routed session's run: `MountedSession.run.status()` reads `'running'` while a turn is going and `'idle'` once it ends, and `run.interrupt()` stops it as the composer's Stop button does, answering `interrupted: false` when nothing was running.

- [#1033](https://github.com/conciv-dev/conciv/pull/1033) [`3904487`](https://github.com/conciv-dev/conciv/commit/390448709c8d3ed47aa2a82772c76e7ede6e70c5) Thanks [@omridevk](https://github.com/omridevk)! - The composer's slash list shows plugin commands that carry a `slash` name, in plugin order and honouring `slash.after`, chained ones included. The first command in plugin order owns a name, over a later plugin and over a harness command of that name, and the list and typed text run that same command, which gets the typed text only when it declares `arguments`; picking one runs it, and a command that throws is logged under its plugin's id.

  The anchored list behind the composer's slash and mention lists opens above its anchor, flipping below only when there is no room, and scrolls inside the space left on screen so every entry and the highlighted one stay in view.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A plugin store takes an optional `encode` for a converting schema; a store or write that would not read back is refused.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A plugin store whose stored value fails its schema now keeps every valid field and resets only the failing ones to the store's initial value, instead of replacing the whole stored value.

- [#964](https://github.com/conciv-dev/conciv/pull/964) [`dc69f23`](https://github.com/conciv-dev/conciv/commit/dc69f2341dfdf218db07e9e81a3c9b1cb4469bfa) Thanks [@omridevk](https://github.com/omridevk)! - A plugin whose store load meets a lost engine connection waits for the engine and starts once it returns, instead of staying failed. An engine error on that load still fails the plugin.

  A browser rpc call whose caller passes its own `shouldRetry` still stops retrying once its connection is closed.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A plugin store no longer carries an unused settings follower that, if switched on, would echo the store's own writes back to it.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A plugin store whose record has an entry named like a built-in object member (`constructor`, `toString`) that fails its schema now drops only that entry. Before, the store read the built-in as that entry's initial value and reset the whole store.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - CSS a plugin contributes with `ctx.add(Style, css)` is applied in the widget's shadow root, in each PiP window and in each plugin overlay, after the app's own sheet, and removed when the plugin withdraws it or unloads.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A link straight to a plugin's panel tab, opened in a fresh widget, now shows that tab once the plugin has loaded instead of going back to the chat while the plugin's bundle is still being read. An old tab id that the plugin renames ends on the renamed tab, and a tab id no panel lists still goes back to the chat once the plugins are known.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A plugin that adds to the `ToolCall` registry draws the body of a finished call of the tools it claims, inside the chat pane's own card. While the call runs, and when the plugin's render returns nothing or throws, the default card shows.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A plugin's tool card view is now drawn inside the normal card for that call, so its header reads as the normal card's: the catalog title with the positional value (for example `report where an import specifier resolves solid-js`), the badge and the timing. When the tool catalog arrives after the card is on screen, the card becomes the catalog card and the plugin is not asked to draw again.

- [#1110](https://github.com/conciv-dev/conciv/pull/1110) [`414d5ea`](https://github.com/conciv-dev/conciv/commit/414d5eaeb08da91e21aa142f107c8949fcb475e4) Thanks [@omridevk](https://github.com/omridevk)! - Plugins render the kit's chip through `ctx.ui.Chip`: a short label in a pill, with a tone and an optional tooltip. A chip with a tooltip whose value is cut shows the full value above the tooltip text.

- [#1092](https://github.com/conciv-dev/conciv/pull/1092) [`5e18dc9`](https://github.com/conciv-dev/conciv/commit/5e18dc919a580ac83886299274caa30ca931048a) Thanks [@omridevk](https://github.com/omridevk)! - A plugin's `ctx.ui.Menu` takes `radio-group` entries, of which one row is picked, and `checkbox` entries, which are on or off. A plugin's window bundle can import `@conciv/ui-kit-tap`, which the app provides.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - A tab id that no plugin panel lists goes back to the chat also when the same plugin has a panel that renames old tab ids. Before, any id of such a plugin was let through and opened an empty tab.

- [#1100](https://github.com/conciv-dev/conciv/pull/1100) [`549f445`](https://github.com/conciv-dev/conciv/commit/549f445f364067d88cbd1f92f36d4569e2cd0145) Thanks [@omridevk](https://github.com/omridevk)! - A plugin view reads its engine methods through the app's one query cache. Each method of `ctx.client.rpc(Definition)` still answers a plain call and also gives `queryOptions({input})` for `useQuery`, `mutationOptions()` for `useMutation` and `key()` to invalidate. A plugin imports `useQuery`, `useMutation` and `useQueryClient` from `@conciv/client`, which the widget provides to its bundle like Solid, and gets the app's query client with `useQueryClient()`; no plugin imports a `@tanstack/*` Query package. A method's key starts with the engine it reads from, `['plugin', {server}, id, method, input]`, so two engines never share a cached read, and `Conciv.make(raw, {server})` takes that engine's name, such as its address. When a plugin reloads or stops, the app drops every query whose key starts with `['plugin', <plugin id>]`, so a reloaded plugin never runs a chunk its old revision cached.

- [#1042](https://github.com/conciv-dev/conciv/pull/1042) [`8e59425`](https://github.com/conciv-dev/conciv/commit/8e59425695725c2d28ca460bb755d7da5edcd7dd) Thanks [@omridevk](https://github.com/omridevk)! - A plugin that reads the `GrabApi` contract gets one: the app's built-in `grab` plugin provides it from the shown chat pane, so a plugin can stage a grabbed element into the composer, read the staged grabs back and clear them.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - Plugins are no longer loaded twice at login: the widget loads them once, and the console no longer shows 'the plugin manager was disposed' right after you log in.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A session the user just started previews in the picker while its first reply is still running, as opencode does.

- [#834](https://github.com/conciv-dev/conciv/pull/834) [`cba0682`](https://github.com/conciv-dev/conciv/commit/cba0682d62058e28428ebbfc64a3a1422ba6bf77) Thanks [@omridevk](https://github.com/omridevk)! - The widget no longer polls. `meta.hubAgents` is an event iterator the engine pushes whenever the conciv home db changes on disk, so an agent connected or disconnected from the CLI shows up at once. The engine staleness read refreshes on reconnect and refocus instead of a timer, and reachability comes only from the engine socket (`engineProbeRefetchInterval` and `voteEngineProbeSettled` are gone). The recorder panel follows a `replay` stream until the recording can be replayed and a pushed `events` stream for the live tail, replacing its 1 s polls.

- [#880](https://github.com/conciv-dev/conciv/pull/880) [`412aed2`](https://github.com/conciv-dev/conciv/commit/412aed2365d7d3729be24cd846cd6f0370bfd425) Thanks [@omridevk](https://github.com/omridevk)! - Losing the engine for a few seconds during a run no longer drops your queued message: it comes back to the composer, unsent, as Stop already does, or into that session's draft when you are looking at another session (text only: images in the queue are not kept there). The same holds when the run itself fails with an error while a message waits in the queue; before, the queued message was dropped there too.

  The message already being answered is no longer put back in the composer when the connection or the run fails, so pressing Enter no longer sends it a second time. Use Retry to run it again. A message that had no answer yet when the connection failed comes back to the composer ahead of any queued messages, so neither is lost. The same goes for anything you type while a message is sending: if that send fails before any reply, the failed message comes back first and what you typed stays after it, where before only what you typed was kept.

  Text an extension view inserts into the draft is also kept when the saved draft could not be loaded; before, it was dropped.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A quick terminal hotkey pressed while conciv is still checking the engine opens it once the check is done.

- [`6c5ba9c`](https://github.com/conciv-dev/conciv/commit/6c5ba9c509f41103c93eeeb8f9db1144c96d5c85) Thanks [@omridevk](https://github.com/omridevk)! - A query that a rebind cancels is no longer logged as a failure: the saved-draft read and the @ list skip TanStack Query's cancel.

- [`47ac866`](https://github.com/conciv-dev/conciv/commit/47ac866d2795a8e9c24af42d3be7a408b880db99) Thanks [@omridevk](https://github.com/omridevk)! - A rebind normalizes the engine base once where it enters the app, so `/health` and the other derived urls no longer get a doubled slash, and a trust check the engine answers with 401 locks the connection and asks to authorize instead of reading as unreachable.

- [#916](https://github.com/conciv-dev/conciv/pull/916) [`61ee0c4`](https://github.com/conciv-dev/conciv/commit/61ee0c47f5e3f0bf9c99518281e84f231cb0be9f) Thanks [@omridevk](https://github.com/omridevk)! - A send the engine refuses leaves no turn in the conversation: the text goes back to the composer only, so sending it again makes one turn, not two.

- [#916](https://github.com/conciv-dev/conciv/pull/916) [`61ee0c4`](https://github.com/conciv-dev/conciv/commit/61ee0c47f5e3f0bf9c99518281e84f231cb0be9f) Thanks [@omridevk](https://github.com/omridevk)! - A Steer the engine refuses puts the steered text back first in the composer instead of losing it, and is no longer resent silently. `onSteerError` in the composer handlers now receives the queued item as its second argument: `onSteerError?: (error: unknown, item: QueuedMessage) => void`.

- [#1108](https://github.com/conciv-dev/conciv/pull/1108) [`05cb735`](https://github.com/conciv-dev/conciv/commit/05cb735d37ef115c10497ae249d1207b8272db22) Thanks [@omridevk](https://github.com/omridevk)! - `@conciv/extension-whiteboard` is removed; the whiteboard is now the `@internal/plugin-whiteboard` plugin, which is
  not published yet. Drop `whiteboard()` from `extensions`. The widget bundle no longer carries the old whiteboard
  extension or its styles.

- [`83c6c31`](https://github.com/conciv-dev/conciv/commit/83c6c31813526758e86b21984b7d224738920fe7) Thanks [@omridevk](https://github.com/omridevk)! - The happy-dom test layer is gone: plugin-testkit no longer exports `./browser` or `./dom-environment`, and the app and ui-kit-system have no happy-dom test project.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The app restores the whole navigation the engine saved (every entry and the index), not only the current entry, so back and forward work after a reload. `createWebStorageHistory` gains `restore()`, which reads a storage that was filled after the history was created.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The root route reads the child routes through getRouteApi.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A failed run shows its error in one place, the inline row under the conversation. The styled thread no longer repeats the error inside the last reply, and the app no longer raises a toast for a failure that row already shows; a send refused before any run still gets its toast.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The run error row in the chat is named by its own message, so a screen reader announces the alert with what went wrong and it can be found by role and name.

- [#925](https://github.com/conciv-dev/conciv/pull/925) [`04f0bba`](https://github.com/conciv-dev/conciv/commit/04f0bbac10263804c3a2c2de2a4a15e3097fe9af) Thanks [@omridevk](https://github.com/omridevk)! - A plugin's `ServerRef.connected` now says whether the event connection to the engine is up, as opencode's does: it goes false while the stream reopens and true again once `server.connected` arrives, so a plugin keyed on it attaches again after a reconnect. It used to follow the login. For implementers: `ConcivClient.connection` (`@conciv/backend-plugin-api`) reads the client's event connection status, `status()` returning `'connecting' | 'connected' | 'reconnecting'` (type `ClientConnectionStatus`) and `on(listener)` returning its unsubscribe.

- [#1162](https://github.com/conciv-dev/conciv/pull/1162) [`1f2e0d0`](https://github.com/conciv-dev/conciv/commit/1f2e0d0c59f2d84b26d800bfe6b12e56c3a32db6) Thanks [@omridevk](https://github.com/omridevk)! - The session picker no longer opens empty after it is closed and reopened quickly.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - Settings list the installed plugins on a Plugins tab: each plugin with its status, errors, a Reload button and a switch that turns its widget part on or off.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - Settings always show a Plugins tab, after Shortcuts, whether or not anything is installed, as opencode does. With five tabs the settings use the left rail at every panel width, and opening settings no longer jumps from a top tab row to the rail when a plugin is installed.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - The selected pill of a segmented control on a settings page shows again when settings open for the first time: the settings layout reads the plugin list without suspending.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The open panel no longer pulls focus out of a plugin overlay (such as the whiteboard canvas) on the standalone conciv page, so canvas shortcuts work, while focus in overlay dialogs (the comment thread's reply, a new comment) stays where it lands.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The standalone conciv app renders again in a browser without IndexedDB: the draft store is opened through one shared `openBrowserDraftStore`, which logs "drafts stay engine-only" and runs without local drafts, as the embedded widget already did. `@internal/frontend-defaults` exports `openBrowserDraftStore` in place of `createBrowserDraftStore`.

- [#1034](https://github.com/conciv-dev/conciv/pull/1034) [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563) Thanks [@omridevk](https://github.com/omridevk)! - The status bar's items line up at any bar height: each tab's number sits on its label's baseline, the tab icons sit level with the text, and no empty bordered cell or double divider shows between the run timer and the tabs. The Chat tab shows a chat icon. On a narrow panel the tab labels and the diff count hide as before; the bar's narrow-panel rules now live with the bar itself.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - Focusing a status bar tab no longer leaves a computation behind. Before, each focus on a tab created a memo with no owner that stayed subscribed to the view lock for as long as the bar was open.

- [#891](https://github.com/conciv-dev/conciv/pull/891) [`1d72095`](https://github.com/conciv-dev/conciv/commit/1d7209503bd860554ab27ba92b75a28516f19f33) Thanks [@omridevk](https://github.com/omridevk)! - Stop now works from the moment you send. A Stop pressed before the engine has started on your message used to be lost: the reply streamed in, "Responding…" stayed, and the Stop button came back as if you never pressed it (over a plain HTTP connection the message could vanish from the conversation instead). Now the button shows "Stopping…" at once, the stop is held until the engine starts the run, and the run then ends with the Stopped line, which a reload still shows.

  If the message never reaches the engine after you pressed Stop (the connection drops first), it is taken back: it leaves the conversation and its text is back in the composer, with no error and no Retry, so nothing can be sent twice. A message that fails to send when you did not press Stop still shows its error as before.

- [#1034](https://github.com/conciv-dev/conciv/pull/1034) [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563) Thanks [@omridevk](https://github.com/omridevk)! - The Terminal's model picker and New terminal button sit in a toolbar at the top of the Terminal panel, so the status bar holds only the view tabs and they no longer move when the Terminal tab opens. The `session.panel.end` slot is removed.

- [`375aaf3`](https://github.com/conciv-dev/conciv/commit/375aaf38995da0101f206303b7a7e419b0586003) Thanks [@omridevk](https://github.com/omridevk)! - The app's UnoCSS filesystem globs resolve from the config file, so any project that loads it scans the same sources.

- [`7a0d8ab`](https://github.com/conciv-dev/conciv/commit/7a0d8abc8a8b619c90db51376b289b450381d8f6) Thanks [@omridevk](https://github.com/omridevk)! - The offline grace is an engine connection timing: `offlineGraceMs` in `EngineConnectionTimings`, default 1000, read by the app's reachability; the kit mount shortens it.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The page's announcements have names.

- [`b364a93`](https://github.com/conciv-dev/conciv/commit/b364a936be45e769c7d5c0ea465c2577c8f32cde) Thanks [@omridevk](https://github.com/omridevk)! - The standalone app registers the same fonts as the embedded widget.

- [`b364a93`](https://github.com/conciv-dev/conciv/commit/b364a936be45e769c7d5c0ea465c2577c8f32cde) Thanks [@omridevk](https://github.com/omridevk)! - The standalone dev server serves the widget's inline UnoCSS styles on a cold request instead of a 404.

- [#1034](https://github.com/conciv-dev/conciv/pull/1034) [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563) Thanks [@omridevk](https://github.com/omridevk)! - The status bar under the chat is a little taller, so the controls at its end (the terminal's model picker, Retry, the new terminal button) have even room above and below instead of nearly touching its top edge.

- [#1130](https://github.com/conciv-dev/conciv/pull/1130) [`e7eba79`](https://github.com/conciv-dev/conciv/commit/e7eba7997759d03d73543c6d8abc2f181d737234) Thanks [@omridevk](https://github.com/omridevk)! - The status bar takes its height from its cells' padding instead of a minimum height.

- [#1034](https://github.com/conciv-dev/conciv/pull/1034) [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563) Thanks [@omridevk](https://github.com/omridevk)! - The status bar under the chat is not selectable text: a selection dragged down from a reply over it no longer picks up the run status and the timer.

- [#1044](https://github.com/conciv-dev/conciv/pull/1044) [`08bc51a`](https://github.com/conciv-dev/conciv/commit/08bc51a65258ceb129c9322dfa736fd71be4ec61) Thanks [@omridevk](https://github.com/omridevk)! - The Terminal tab's toolbar has the element pick button again: it picks an element from the page and stages it, and a plain Enter in the terminal sends the staged elements to the CLI and clears them.

  Staged elements show above every extension view again, as the same grab chip the composer shows, with its preview and its Remove.

- [#991](https://github.com/conciv-dev/conciv/pull/991) [`42350f9`](https://github.com/conciv-dev/conciv/commit/42350f9b2c9a7de7e43ab562a2c5b67afa73186f) Thanks [@omridevk](https://github.com/omridevk)! - The widget's styles now cover the whiteboard plugin's browser part, so its notices draw in the chat's colours when the plugin is enabled.

- [`1c3a9b4`](https://github.com/conciv-dev/conciv/commit/1c3a9b4023e0ce22dd0845902e65c883db763f94) Thanks [@omridevk](https://github.com/omridevk)! - The widget platform takes optional timings: engine connection timings, chat run reconnect attempts and delays, and a query retry delay, all left at their defaults when unset.

- [#1171](https://github.com/conciv-dev/conciv/pull/1171) [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d) Thanks [@omridevk](https://github.com/omridevk)! - A plugin tool's look is only its own tool render: the registry catalog carries no `icon` or `label`, the generic tool card and the live status line show the tool name, and the generic card shows no mutating badge and no asks-approval hint, as opencode does, and `TOOL_ICON_KEYS`, `toolIconRender`, `cardTitle`, `pageToolMeta`, the page catalog special case and `@conciv/plugin-tanstack/client` are gone. The page and TanStack cards keep their words and icons inside their own renders. The app no longer depends on `@conciv/plugin-tanstack`.

- [`4b1eb0f`](https://github.com/conciv-dev/conciv/commit/4b1eb0f6024d12c0393436db33a18fc5fde4289e) Thanks [@omridevk](https://github.com/omridevk)! - The try-it connect pane draws through `ctx.ui`, and conciv's own first-party plugins get a copy button and a disclosure on it.

- [#1074](https://github.com/conciv-dev/conciv/pull/1074) [`147931d`](https://github.com/conciv-dev/conciv/commit/147931d44d6cad974adc48cc8e3dab23f825ec05) Thanks [@omridevk](https://github.com/omridevk)! - try-it is now its own plugin, `@conciv/plugin-try-it`, that a host composes into the widget: `mountConciv(extensions, [[entry, {token}]])` or `createConciv({plugins})` hands each plugin its options as `ctx.options`. Mounted without an `apiBase`, the widget runs in servers mode: plugins start before any core exists, a plugin's `Server` entry covers the panel with its `cover` while it is not ready (the panel stays mounted underneath, inert), and the widget binds to the entry's `http.url` once it turns ready. try-it's entry covers the panel with the connect steps until the visitor's local core answers. The connect-mode Disconnect button is gone.

- [#1121](https://github.com/conciv-dev/conciv/pull/1121) [`8f7fcbd`](https://github.com/conciv-dev/conciv/commit/8f7fcbd4b15811e5d5580e49a23be47be0e81b2b) Thanks [@omridevk](https://github.com/omridevk)! - The widget no longer mounts old SDK extensions. Their panel views, view lock, status, composer and empty slots, slash commands, tool cards, attachment cards and page-level `Surface` are gone, and so are the Views settings tab (with its hide, pin and order preferences and Reset views) and the generated extension settings pages (with Reset extension settings). Plugins add that UI through the plugin registries.

  `createConciv` no longer takes `extensions` (`ConcivInit.extensions` and the `ExtensionsInput` type are removed), and `mountConciv(plugins?)` takes plugin entries as its only argument. The React, Preact and Solid wrappers drop their `extensions` prop. The `virtual:conciv-extensions` module from `@conciv/extension-compiler` mounts the widget with no extensions, and the package drops its `./dedupe` export and the server-side extension loaders.

- Updated dependencies [[`81007d1`](https://github.com/conciv-dev/conciv/commit/81007d1f6e3b584203e56f85db1ad38d1a6dc97c), [`46e1e13`](https://github.com/conciv-dev/conciv/commit/46e1e138c743996af716154bc3d7d4b4e7856801), [`5724db1`](https://github.com/conciv-dev/conciv/commit/5724db197a3f71c050123dd34a82416031a1ecbb), [`7bfb99c`](https://github.com/conciv-dev/conciv/commit/7bfb99c468f737ffae382409e22986aa6db26079), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`c24fe17`](https://github.com/conciv-dev/conciv/commit/c24fe171ca1c26648c3f4336f8656c2c800fc7a8), [`21a5651`](https://github.com/conciv-dev/conciv/commit/21a56511c8515b565617f163cd5c336cb462ddff), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`bbdb3ca`](https://github.com/conciv-dev/conciv/commit/bbdb3cad53c14631669b7e29f367df71e95b1344), [`84ea7e3`](https://github.com/conciv-dev/conciv/commit/84ea7e3fe676a4c875535e2f20ca3bc6ffa84c93), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`bc6656b`](https://github.com/conciv-dev/conciv/commit/bc6656b7e91418c54f7eee94fa08bcf5ed434d5b), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`29ee008`](https://github.com/conciv-dev/conciv/commit/29ee0087b9048df5b6f75ae69715b0c9b56b0643), [`64c2f50`](https://github.com/conciv-dev/conciv/commit/64c2f5051d0558d7d1a7cb43a9e68f3970709c6b), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`9d9a594`](https://github.com/conciv-dev/conciv/commit/9d9a59474837ae21a337599aeebd7f9e8486a61b), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6ce2a3b`](https://github.com/conciv-dev/conciv/commit/6ce2a3b90edaebce61a9cafc93dfd6e530b16ddf), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`3c4c575`](https://github.com/conciv-dev/conciv/commit/3c4c575d23931e2c3714b38fa853d2b9942ddade), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`20b7c05`](https://github.com/conciv-dev/conciv/commit/20b7c05ecc0a1d1d4778fdf3ace6494f0433a5e4), [`04c64fe`](https://github.com/conciv-dev/conciv/commit/04c64fe96e59c8363a72b11ed58f4fa63e2f04cf), [`cde9c35`](https://github.com/conciv-dev/conciv/commit/cde9c350ae4966ae66258f25661a7ad3de485dcd), [`9682389`](https://github.com/conciv-dev/conciv/commit/9682389739ca98d316d202e3a5abd54828a79b43), [`e97f7c2`](https://github.com/conciv-dev/conciv/commit/e97f7c2440c6a3946ca3594c692e566305f4e953), [`eef6c59`](https://github.com/conciv-dev/conciv/commit/eef6c59029f654011fedfdc691021d0cc6502e20), [`4e7e593`](https://github.com/conciv-dev/conciv/commit/4e7e5931c68dbe82f82930e1f358ab252c484d23), [`0b7f78a`](https://github.com/conciv-dev/conciv/commit/0b7f78acc061692acdca35cc2e5462c75a02e2a3), [`956c20d`](https://github.com/conciv-dev/conciv/commit/956c20dfcbfed72523bb38f8c8632f06e2c6df59), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`1feae4a`](https://github.com/conciv-dev/conciv/commit/1feae4aefa390212f63d656a9ad718d4b23a1be9), [`d0009c9`](https://github.com/conciv-dev/conciv/commit/d0009c9748360343de7a47802a75b4bd0264b13e), [`35347d2`](https://github.com/conciv-dev/conciv/commit/35347d2abd0aeb696eaa04e8df49ca7bc1d44fa9), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`f2d65ca`](https://github.com/conciv-dev/conciv/commit/f2d65ca836ddf7ff5cdd79bcd56a4f7aab86bb00), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`48a2c25`](https://github.com/conciv-dev/conciv/commit/48a2c25d52a8e400f60411ae059c92187337954a), [`b27ba9d`](https://github.com/conciv-dev/conciv/commit/b27ba9d3e787c376d7a90ed7eb3eb8f7616f9ccd), [`fcba070`](https://github.com/conciv-dev/conciv/commit/fcba07081e1a4646cd907549728417e88523b7b5), [`26d4021`](https://github.com/conciv-dev/conciv/commit/26d402137561bad75c633c8d51993b1da4ba1a82), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`6ce2a3b`](https://github.com/conciv-dev/conciv/commit/6ce2a3b90edaebce61a9cafc93dfd6e530b16ddf), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`6ce2a3b`](https://github.com/conciv-dev/conciv/commit/6ce2a3b90edaebce61a9cafc93dfd6e530b16ddf), [`d8c2c1b`](https://github.com/conciv-dev/conciv/commit/d8c2c1b3850be01ab52fa35f998ef247c6bd5671), [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb), [`f5f2ac4`](https://github.com/conciv-dev/conciv/commit/f5f2ac4b2e9ca100f61137af484128824ad377ea), [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f), [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f), [`564dd14`](https://github.com/conciv-dev/conciv/commit/564dd148e0dd2f8b7b7b252211f00b5349bab101), [`69c4117`](https://github.com/conciv-dev/conciv/commit/69c4117dff5620c1f9588902f41204a51f03fffb), [`f653740`](https://github.com/conciv-dev/conciv/commit/f653740c66d2679792e6cea44e091013e3cea813), [`a0f5c5e`](https://github.com/conciv-dev/conciv/commit/a0f5c5e24e29d085ad972de89a6cc2eda894cf00), [`6d82c57`](https://github.com/conciv-dev/conciv/commit/6d82c5741fd8096c2b554286b7045511ac62a3db), [`fea0ff2`](https://github.com/conciv-dev/conciv/commit/fea0ff2139caf552838a0ed4f4b2f8bf6fd3563d), [`95a6136`](https://github.com/conciv-dev/conciv/commit/95a61369984b6c93529156d13ec8fdb73c2bc723), [`e503d38`](https://github.com/conciv-dev/conciv/commit/e503d381e9567fa739fed2b5ff84daadeeb646b3), [`8d57382`](https://github.com/conciv-dev/conciv/commit/8d57382a4365e2031bc484478b5b8950bd45cca9), [`8a2be86`](https://github.com/conciv-dev/conciv/commit/8a2be866cd08e706a587b56345db6a0b666f787c), [`a3312e3`](https://github.com/conciv-dev/conciv/commit/a3312e303cb721b782442cdb952b10b5c348ec50), [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`1780a56`](https://github.com/conciv-dev/conciv/commit/1780a5662afcdb273b2ac2d212ba49487f1b1216), [`8ba04d3`](https://github.com/conciv-dev/conciv/commit/8ba04d3c02c5c34680508f2ff6fdbf8227049e4f), [`671870f`](https://github.com/conciv-dev/conciv/commit/671870f6aa0332c4e2fde31cfe5f77c9ccfebefa), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae), [`bbea2a1`](https://github.com/conciv-dev/conciv/commit/bbea2a1d9e492a6b2cd72d8fa97a6ed67605318b), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`e7ddc30`](https://github.com/conciv-dev/conciv/commit/e7ddc30247704fa779205cbb8aef14505213b981), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`f2d65ca`](https://github.com/conciv-dev/conciv/commit/f2d65ca836ddf7ff5cdd79bcd56a4f7aab86bb00), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`0f6f1f4`](https://github.com/conciv-dev/conciv/commit/0f6f1f42530bb65adde3e01884885e65522cf839), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`e67cfba`](https://github.com/conciv-dev/conciv/commit/e67cfba64e8f66b708b16d3e5c1fd031f4984511), [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`8690874`](https://github.com/conciv-dev/conciv/commit/869087424d55eb15e5b623314569e7ecefbf6b5a), [`0bc80ef`](https://github.com/conciv-dev/conciv/commit/0bc80ef1b0ded255ab9e66a84baf6b5724f2d59f), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`25ec2d8`](https://github.com/conciv-dev/conciv/commit/25ec2d81d4559a6afdf531b8fbae38d561eb9656), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`90f01d8`](https://github.com/conciv-dev/conciv/commit/90f01d88e6e00e60eff4caf5c430414965fdd219), [`6d5d306`](https://github.com/conciv-dev/conciv/commit/6d5d306e1133aecf64d2ddb4351b7468e1f2d26b), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`5fd874f`](https://github.com/conciv-dev/conciv/commit/5fd874fb09d5bfda28ce4954506e0abcf7a6f796), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`1e9abca`](https://github.com/conciv-dev/conciv/commit/1e9abca9874b798e8ba59df5e1e02392b90a6865), [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d), [`e5d82a7`](https://github.com/conciv-dev/conciv/commit/e5d82a71473c2f99dd98428345607ad769c5cba1), [`bac0cc2`](https://github.com/conciv-dev/conciv/commit/bac0cc25711bd1a985813f860a40ff743ab94f51), [`93fa1ac`](https://github.com/conciv-dev/conciv/commit/93fa1acac79cf1e5610a4368d984dd81c52e0971), [`19ad474`](https://github.com/conciv-dev/conciv/commit/19ad474b8cd93a548e881ee2cebcf018bdc25d4f), [`304b057`](https://github.com/conciv-dev/conciv/commit/304b0571d91cf3a814df3b735798530626ef8607), [`6794c37`](https://github.com/conciv-dev/conciv/commit/6794c3729dd895e2eba89b52484628962ff9d738), [`edc5e42`](https://github.com/conciv-dev/conciv/commit/edc5e42998d5dbd33ebe4b1aba7e4e72c4905390), [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f), [`0040247`](https://github.com/conciv-dev/conciv/commit/00402478d56e462a750212086ddf5202f7e51316), [`911a685`](https://github.com/conciv-dev/conciv/commit/911a68571dc434e793541a707a9d81bad670c93e), [`215bcb7`](https://github.com/conciv-dev/conciv/commit/215bcb7ecefe54691fbadb1f8c547001a4266028), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`571d456`](https://github.com/conciv-dev/conciv/commit/571d456cd232387f11dd2e119d1971f409a825c6), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`4b12a07`](https://github.com/conciv-dev/conciv/commit/4b12a07ebbe330348aca0b98d5a2be928d311a50), [`71a6bb9`](https://github.com/conciv-dev/conciv/commit/71a6bb92305b9b93f3a191c078295c0d4412df80), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`144a4c5`](https://github.com/conciv-dev/conciv/commit/144a4c53163a9aa1cea68f700bf055b2fe5029b8), [`3904487`](https://github.com/conciv-dev/conciv/commit/390448709c8d3ed47aa2a82772c76e7ede6e70c5), [`dc69f23`](https://github.com/conciv-dev/conciv/commit/dc69f2341dfdf218db07e9e81a3c9b1cb4469bfa), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`9dad84c`](https://github.com/conciv-dev/conciv/commit/9dad84ca01ea9fe7dd5c4b549ad8eab45a6bd462), [`9341c70`](https://github.com/conciv-dev/conciv/commit/9341c70f3c7c0255281d24ec92ed12879fd9396d), [`35e9999`](https://github.com/conciv-dev/conciv/commit/35e9999ccf358fae142e6d521e0f795ad10862b4), [`414d5ea`](https://github.com/conciv-dev/conciv/commit/414d5eaeb08da91e21aa142f107c8949fcb475e4), [`4d05601`](https://github.com/conciv-dev/conciv/commit/4d05601bb1b5a30bcb5d96574da8e0aa3af449e9), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`cba0682`](https://github.com/conciv-dev/conciv/commit/cba0682d62058e28428ebbfc64a3a1422ba6bf77), [`7ef3472`](https://github.com/conciv-dev/conciv/commit/7ef3472787f26155c38128c2a1b8ffcec8ff5bf3), [`412aed2`](https://github.com/conciv-dev/conciv/commit/412aed2365d7d3729be24cd846cd6f0370bfd425), [`f51b933`](https://github.com/conciv-dev/conciv/commit/f51b9336acd9c9d4f45accc5c649d4e1eebc7835), [`6c5ba9c`](https://github.com/conciv-dev/conciv/commit/6c5ba9c509f41103c93eeeb8f9db1144c96d5c85), [`47ac866`](https://github.com/conciv-dev/conciv/commit/47ac866d2795a8e9c24af42d3be7a408b880db99), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`61ee0c4`](https://github.com/conciv-dev/conciv/commit/61ee0c47f5e3f0bf9c99518281e84f231cb0be9f), [`61ee0c4`](https://github.com/conciv-dev/conciv/commit/61ee0c47f5e3f0bf9c99518281e84f231cb0be9f), [`83c6c31`](https://github.com/conciv-dev/conciv/commit/83c6c31813526758e86b21984b7d224738920fe7), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`7596ab6`](https://github.com/conciv-dev/conciv/commit/7596ab6d8d314343585424f539198cd1d3ec5e5f), [`1f5b893`](https://github.com/conciv-dev/conciv/commit/1f5b8933dc4ba2970371fa4b0c88f1a1426c05c3), [`2c69bca`](https://github.com/conciv-dev/conciv/commit/2c69bca8cb40a8c71c13ee780abb9ca31900b328), [`92026f6`](https://github.com/conciv-dev/conciv/commit/92026f613d22741b24b08e55a4376d795f988994), [`7925199`](https://github.com/conciv-dev/conciv/commit/79251997f75892d7b445f3dbebb1dbb5109aac53), [`48a2c25`](https://github.com/conciv-dev/conciv/commit/48a2c25d52a8e400f60411ae059c92187337954a), [`b0cd4e4`](https://github.com/conciv-dev/conciv/commit/b0cd4e40d59112f024787685f1b0f0c1c74d9524), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`a14cb77`](https://github.com/conciv-dev/conciv/commit/a14cb7704a32edc31189fb344a9bd933949e664e), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`7a0d8ab`](https://github.com/conciv-dev/conciv/commit/7a0d8abc8a8b619c90db51376b289b450381d8f6), [`dde5705`](https://github.com/conciv-dev/conciv/commit/dde5705b3b869629ad135f58b438d5c9f5c0a070), [`bb8f33c`](https://github.com/conciv-dev/conciv/commit/bb8f33cb1ddb69d8453d6eb5f8366a04f37e1378), [`6819ea1`](https://github.com/conciv-dev/conciv/commit/6819ea19a385c85aca783f6318dde282b8e3c031), [`b5af8c2`](https://github.com/conciv-dev/conciv/commit/b5af8c249622a66cf1dd35b0d1b121f1881bd877), [`cd708e4`](https://github.com/conciv-dev/conciv/commit/cd708e453045126e0aea89bbfa24de045643292b), [`63da39e`](https://github.com/conciv-dev/conciv/commit/63da39e4cc44b03dae8923b3f6d2a50a736662be), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`adfc6d7`](https://github.com/conciv-dev/conciv/commit/adfc6d789db2a8f2f12c50eb850e030d112b6369), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`08cfb11`](https://github.com/conciv-dev/conciv/commit/08cfb11d6b7d3f47720e8fe0dd3cd10e0f096a85), [`e4edcfb`](https://github.com/conciv-dev/conciv/commit/e4edcfbf56dea09af0261d74e30b85d4ddbadce4), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811)]:
  - @conciv/ui-kit-chat@0.0.23
  - @conciv/client@0.0.23
  - @conciv/ui-kit-chat-tools@0.0.23
  - @conciv/ui-kit-tap@0.0.23
  - @conciv/protocol@0.0.23
  - @conciv/types@0.0.23
  - @conciv/ui-kit-system@0.0.23
  - @conciv/frontend-plugin-api@0.0.23
  - @conciv/mascot@0.0.23
  - @conciv/solid-streamdown@0.0.23
  - @conciv/grab@0.0.23
  - @conciv/storage-history@0.0.23
  - @internal/frontend-app-api@0.0.23

## 0.0.22

### Patch Changes

- [#759](https://github.com/conciv-dev/conciv/pull/759) [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127) Thanks [@omridevk](https://github.com/omridevk)! - A streamed chunk wakes only the turn and part it changed: turns and each turn's parts are keyed lists, result lookups wake only the row whose result arrives, pane-level readers (dividers, stopped line, harness label, narration, permission asks, older-messages, load failure) stop scanning every message, and tool durations live in one pane-level record that folds only the live turn per chunk, so a row reads its call's duration (`ToolViewCtx.durationFor(toolCallId)`) and wakes only when that entry changes.

- [#742](https://github.com/conciv-dev/conciv/pull/742) [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b) Thanks [@omridevk](https://github.com/omridevk)! - Long chats open with their newest 50 messages and load older pages as you scroll up, without moving the message in view. Harness labels, dividers and stopped markers are keyed by message id so they stay on their messages across pages.

  Chat transcripts are stored one row per message (`chat_messages`), so a page of history reads only that page from the database; existing chats are moved over by a migration.

- [#717](https://github.com/conciv-dev/conciv/pull/717) [`63ef72e`](https://github.com/conciv-dev/conciv/commit/63ef72e40f848f3904d431c6c4556d541c950770) Thanks [@omridevk](https://github.com/omridevk)! - Backspace with the caret at the start of the composer removes the last staged attachment.

- [#720](https://github.com/conciv-dev/conciv/pull/720) [`ce77ec7`](https://github.com/conciv-dev/conciv/commit/ce77ec7c930c38c256c3d34261a4d0d83be4e585) Thanks [@omridevk](https://github.com/omridevk)! - The chat composer renders at once instead of waiting for the saved draft; a draft that arrives later fills an untouched composer and merges its attachments into one the user already typed in. The session list no longer refetches on every window focus or whenever another view of it mounts.

- [#757](https://github.com/conciv-dev/conciv/pull/757) [`123466d`](https://github.com/conciv-dev/conciv/commit/123466d3313ba51a75b8828950c2c96045238abf) Thanks [@omridevk](https://github.com/omridevk)! - Clicking the panel header title, or pressing Enter or Space on it, opens the session menu: the session switcher, context usage and the refresh, pop-out and disconnect rows. Escape or an outside click closes it and returns focus to the title. A pencil next to the title renames the session in place (Enter or blur saves, Escape cancels). The separate options button and the rename control inside the session list are gone. `@conciv/ui-kit-system` gains an `Editable` wrapper over Ark UI Editable.

  Tooltips no longer replay their pop-in animation when the pointer leaves the trigger, so a closing tooltip fades away instead of flickering.

- [#726](https://github.com/conciv-dev/conciv/pull/726) [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd) Thanks [@omridevk](https://github.com/omridevk)! - The engine now refuses every request from a browser it does not trust. A browser becomes trusted by entering the 6-digit code the dev server prints (or opening the printed link); the widget shows a locked launcher until then. Inside the Vite DevTools dock the widget is trusted through DevTools' own login. `conciv auth revoke [id] [--all]` lists and removes trusted browsers.

  Revoking a browser takes effect on the running engine without a restart. The open `/health` route now answers only `{ok, harness, engine: {stale}}`; the full staleness reading stays on the gated `meta.engine` RPC. When any engine call answers 401 the widget checks its login again and shows the locked launcher if the engine no longer trusts it; Retry on the unreachable screen does the same check. A revoke also closes every socket the browser opened (close code 1008), which locks an open tab right away. A missing session header now answers 400 BAD_REQUEST, so 401 only means the login gate refused.

  The launcher now drags like the TanStack Devtools trigger: drop it anywhere, throw it, pin it into a corner, or drag it off an edge to tuck it into a tab (click the tab to bring it back). Arrows move the focused launcher and Shift with an arrow sends it to a corner. The chat panel opens toward the free side of wherever the launcher sits, and the spot is remembered per browser.

- [#772](https://github.com/conciv-dev/conciv/pull/772) [`329d617`](https://github.com/conciv-dev/conciv/commit/329d617adae69e905ce994cfb4d88893d3d62a8e) Thanks [@omridevk](https://github.com/omridevk)! - Older chat history now starts loading while the reader is still three screens from the top, so scrolling up no longer runs into an empty top and a loading row before the earlier messages appear.

- [#775](https://github.com/conciv-dev/conciv/pull/775) [`7dc089b`](https://github.com/conciv-dev/conciv/commit/7dc089b47dc616da95bba7d6c328db957c3500e4) Thanks [@omridevk](https://github.com/omridevk)! - The composer shows connected agents above the input with a disconnect button, and a pending chip while an agent connects or disconnects; outside agents can no longer connect or disconnect agents.

- [#792](https://github.com/conciv-dev/conciv/pull/792) [`ce9a173`](https://github.com/conciv-dev/conciv/commit/ce9a173a4850ad3fd2ea7fdc8f9249844d6689f0) Thanks [@omridevk](https://github.com/omridevk)! - When older messages load while the Latest button is still gliding down, the chat now lands at the newest message at once and keeps following the reply, instead of stretching the glide across the newly loaded page.

- [#772](https://github.com/conciv-dev/conciv/pull/772) [`329d617`](https://github.com/conciv-dev/conciv/commit/329d617adae69e905ce994cfb4d88893d3d62a8e) Thanks [@omridevk](https://github.com/omridevk)! - The chat's Latest button jumps to just above the newest messages and glides smoothly the rest of the way, and lands following the conversation as before. A wheel, touch or key scroll during the glide stops it where the reader scrolled. With reduced motion it still jumps instantly. Opening a chat and sending a message still land on the end at once.

- [#717](https://github.com/conciv-dev/conciv/pull/717) [`63ef72e`](https://github.com/conciv-dev/conciv/commit/63ef72e40f848f3904d431c6c4556d541c950770) Thanks [@omridevk](https://github.com/omridevk)! - The panel title and status bar render without skeletons while the session list loads. The title falls back to "New session", and the run guard uses the chat's own run state until the session row arrives.

- [#790](https://github.com/conciv-dev/conciv/pull/790) [`b96e75c`](https://github.com/conciv-dev/conciv/commit/b96e75cb63d8fab22327016f70976629ef549763) Thanks [@omridevk](https://github.com/omridevk)! - Session picker search rows are as tall as their excerpt, so a short excerpt leaves no empty gap under it.

- [#755](https://github.com/conciv-dev/conciv/pull/755) [`3983ead`](https://github.com/conciv-dev/conciv/commit/3983eada7d68d51872d11dc84290480dfd33006a) Thanks [@omridevk](https://github.com/omridevk)! - The message queue now sits directly above the composer instead of under the pane header, and each queued row shows its Steer and Remove buttons at all times, with a visible keyboard focus ring. Stop no longer sends the queued messages as a new turn: it stops the run and puts them back in the composer, in order, unsent. `ChatSession.interruptAndFlush` is removed. While a stop is in flight the composer blocks every send (Enter, the Send button), so the returned draft cannot be re-queued and lost.

- [#747](https://github.com/conciv-dev/conciv/pull/747) [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8) Thanks [@omridevk](https://github.com/omridevk)! - Packages now report their real release version, for future migrations; a version difference never breaks anything. `conciv` carries it as its `meta.version`, the Claude Code connect plugin is stamped with it instead of `0.0.0`, and every engine response carries an `x-conciv-version` header. Node rpc clients send their own version in the same header; browser requests send no new header, so a newer widget still reaches an older engine. When the engine is older than the widget (or predates versions), the panel shows a notice asking to update the @conciv packages. `conciv init` now also runs `claude plugin update`, so an install recorded at an earlier release moves onto the current one.

- [#754](https://github.com/conciv-dev/conciv/pull/754) [`a3b5b50`](https://github.com/conciv-dev/conciv/commit/a3b5b5077ae156a96f2abe675d3ac7e3a2eb0a00) Thanks [@omridevk](https://github.com/omridevk)! - The binary emitter takes an `avoid` rectangle (`<Mascot.Binary avoid>` / `configureBinaryEffect({avoid})`), in viewport pixels. With it set, the digits rise to the nearest edge in their way, that rectangle or the top of the viewport, then go around the rectangle's nearer free side and climb along it, or run along the edge when there is no room beside it. A new value retargets the digits already in flight at most once per animation frame. The widget launcher passes the open chat panel's frame, derived from the launcher's position and the panel's measured size, so the robot's digits travel around the panel instead of over its status bar and composer, and follow it while the launcher is dragged or the panel is resized.

- [#782](https://github.com/conciv-dev/conciv/pull/782) [`059da2b`](https://github.com/conciv-dev/conciv/commit/059da2b4f46cccc818223903bbab21f3bd9c99b3) Thanks [@omridevk](https://github.com/omridevk)! - Search matches in the session picker and preview use the shared `chat-accent-20` tint with `chat-text` ink, so matched words read at WCAG AA on every row; the one-off `--chat-highlight` token is gone.

- [#746](https://github.com/conciv-dev/conciv/pull/746) [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2) Thanks [@omridevk](https://github.com/omridevk)! - The session list is paged with a cursor and searchable on the server.

  - `sessions.list` takes `{cursor, limit}` and returns `{sessions, next}`. Each harness reads only the transcripts on the requested page instead of its newest 50. `sessions.get` returns one session.
  - `sessions.search` searches session titles and message text across every harness that has transcript history. The index is an in-memory Orama index held in a worker thread, built in the background after the first list. Nothing is written to disk. `sessions.changes` streams the index version: the current one on subscribe, then each new one; the picker keys its list and search queries on it, so they refetch when indexing lands.
  - Claude sessions are listed through the Claude Agent SDK and follow `CLAUDE_CONFIG_DIR`. Empty and continued sessions are hidden, as in `/resume`. Codex, OpenCode and Pi answer `meta` for a single session. Transcripts are read as streams.
  - Sessions show their transcript size instead of a message count.
  - The session picker is a virtual list that loads more as you scroll and searches as you type. The search input takes pointer clicks and keeps focus while results arrive, and Today and Yesterday split at local midnight.
  - A session whose native transcript is gone no longer appears in the list.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - The session picker previews the highlighted session beside the list: a read-only thread of its transcript, newest messages first with earlier pages loading on scroll, the search words marked, `Alt+ArrowRight` to read it and `Alt+ArrowLeft` back to the search, Escape closing the preview before the picker. Core serves it through the read-only `sessions.preview` procedure. Search marks now come from Ark `Highlight` and zag `highlightWord`, and keyboard hints share one ui-kit-system `Kbd`. `Thread.Messages` takes `readOnly`, which leaves the assistant action bar with Copy only; the preview sets it. With All projects on, another project's hit previews too: `sessions.preview` takes that hit's `cwd`, and the preview header copies its resume command through the same `createResumeCopy` as the row, so both show Copied together. `ClipboardCopyButton` can reflect a shared `ClipboardCopy` instead of its own. Previewing a session from a folder the search index does not cover yet adds that folder to the index in the background. The preview opens after 600 ms, closes when its session leaves the results, and its header copy button keeps its own Copied state with a 44px hit area. Typing in the search closes the preview. `TooltipIconButton` takes `keepOpenOnClick`, and `ClipboardCopyButton` uses it so its Copied tooltip stays visible after the click.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - Session search can cover every project. The picker's search area gains an "All projects" switch; a hit from another project shows that project's folder, and selecting it copies the command that resumes it there instead of opening it here. The search term and the switch live in the URL, so closing the picker or reloading keeps them. `sessions.search` takes `everywhere`, and each hit carries `cwd` and `resume`.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - A session search hit now shows a short excerpt from the line that matched, with the matched words highlighted in the excerpt and the title, so you can tell why a session was found before opening it.

- [#733](https://github.com/conciv-dev/conciv/pull/733) [`45cbd56`](https://github.com/conciv-dev/conciv/commit/45cbd569058d87d2fc3dc15808917afffa1a1f8c) Thanks [@omridevk](https://github.com/omridevk)! - The composer and the model search no longer lose focus when a query refreshes in the background. A temporary patch to `@tanstack/solid-query` resolves cached query data synchronously so a background refetch no longer re-suspends the surrounding view; it goes away once a solid-query release includes TanStack/query#11230.

- [#759](https://github.com/conciv-dev/conciv/pull/759) [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127) Thanks [@omridevk](https://github.com/omridevk)! - Streamed tool runs do less work per chunk: a chunk re-runs only the trace row whose part changed (rows keyed by tool-call id, shared group tree, result pairing that only changes when a result arrives), turns are grouped once per chat, trace clamps measure from their resize observer instead of forcing a layout, tooltips mount their content only while open, and every truncated label in the thread shares one tooltip.
- Updated dependencies [[`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679), [`c422d30`](https://github.com/conciv-dev/conciv/commit/c422d3005048cc46f2d47668f66b4cfe599abf1e), [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e), [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e), [`d255573`](https://github.com/conciv-dev/conciv/commit/d255573f14ff345fc58e68a9e1ffdcae48765b68), [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b), [`98cdf4c`](https://github.com/conciv-dev/conciv/commit/98cdf4c22884c1a3f3847eec655edb5deffae1ae), [`6d3deff`](https://github.com/conciv-dev/conciv/commit/6d3deff540f850ba33eb4b91f7ae7b5abb53758a), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`63ef72e`](https://github.com/conciv-dev/conciv/commit/63ef72e40f848f3904d431c6c4556d541c950770), [`ce77ec7`](https://github.com/conciv-dev/conciv/commit/ce77ec7c930c38c256c3d34261a4d0d83be4e585), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`b6456c7`](https://github.com/conciv-dev/conciv/commit/b6456c7145b81cb0b6f73f15da4215db74f605ea), [`f0daa1a`](https://github.com/conciv-dev/conciv/commit/f0daa1a089aa580314962870470eda2a01c396e4), [`123466d`](https://github.com/conciv-dev/conciv/commit/123466d3313ba51a75b8828950c2c96045238abf), [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c), [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd), [`9f0fdb3`](https://github.com/conciv-dev/conciv/commit/9f0fdb3d6d547c05e151798953e01ddc1cf49c04), [`da45a1a`](https://github.com/conciv-dev/conciv/commit/da45a1a1f2e660be14090c8c8234cfc3a0479a3e), [`6a9fd5b`](https://github.com/conciv-dev/conciv/commit/6a9fd5b1aeff3a7c628be188c570175dabcd71f9), [`a3cc212`](https://github.com/conciv-dev/conciv/commit/a3cc212ed205384193bdc7717c8b545a0b453ca7), [`9ea8792`](https://github.com/conciv-dev/conciv/commit/9ea8792e73c9f569e0c7e48b802fe32e597aa877), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde), [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f), [`329d617`](https://github.com/conciv-dev/conciv/commit/329d617adae69e905ce994cfb4d88893d3d62a8e), [`329d617`](https://github.com/conciv-dev/conciv/commit/329d617adae69e905ce994cfb4d88893d3d62a8e), [`da45a1a`](https://github.com/conciv-dev/conciv/commit/da45a1a1f2e660be14090c8c8234cfc3a0479a3e), [`ce9a173`](https://github.com/conciv-dev/conciv/commit/ce9a173a4850ad3fd2ea7fdc8f9249844d6689f0), [`329d617`](https://github.com/conciv-dev/conciv/commit/329d617adae69e905ce994cfb4d88893d3d62a8e), [`b591c13`](https://github.com/conciv-dev/conciv/commit/b591c138b32b293a14f1d3f2dc92d5c58889402c), [`c4824ef`](https://github.com/conciv-dev/conciv/commit/c4824efb18105452885954ce766e2bea93a266e9), [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f), [`9003236`](https://github.com/conciv-dev/conciv/commit/90032366211b3ab568a5c92335adce4be6e097a7), [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c), [`8316848`](https://github.com/conciv-dev/conciv/commit/831684812362cd61d0c32ad5a1dd7523740e3a4e), [`b96e75c`](https://github.com/conciv-dev/conciv/commit/b96e75cb63d8fab22327016f70976629ef549763), [`6d53b93`](https://github.com/conciv-dev/conciv/commit/6d53b9329faa79d6a9f7f9fec93d0241f07e9c50), [`57aa7f3`](https://github.com/conciv-dev/conciv/commit/57aa7f37cbb18fe3be0a2b6dc341fd612bdbd62c), [`3983ead`](https://github.com/conciv-dev/conciv/commit/3983eada7d68d51872d11dc84290480dfd33006a), [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8), [`a3b5b50`](https://github.com/conciv-dev/conciv/commit/a3b5b5077ae156a96f2abe675d3ac7e3a2eb0a00), [`bd41ba7`](https://github.com/conciv-dev/conciv/commit/bd41ba79644530696274de010e230b6adcdf30b1), [`059da2b`](https://github.com/conciv-dev/conciv/commit/059da2b4f46cccc818223903bbab21f3bd9c99b3), [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2), [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`8a67d39`](https://github.com/conciv-dev/conciv/commit/8a67d39d925d61aaf881a878bdd3c4dfea0193c4), [`b2dfd2b`](https://github.com/conciv-dev/conciv/commit/b2dfd2b279d7ad6bab81c3c99d3c24874de5c257), [`d1ac2b9`](https://github.com/conciv-dev/conciv/commit/d1ac2b9749d82f70effb017557605a301bc59986), [`7ddd1e8`](https://github.com/conciv-dev/conciv/commit/7ddd1e895e55f56aea0091650f1bc6565b754e14), [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c), [`ae7b802`](https://github.com/conciv-dev/conciv/commit/ae7b802125ff5546f93cce4a0117ff34b442f501), [`f6844cc`](https://github.com/conciv-dev/conciv/commit/f6844cc3f908926362969d9efa3ad32690d56e6c), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`ec21e43`](https://github.com/conciv-dev/conciv/commit/ec21e435d972e60b317b56f8831ebf5286932a37), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09), [`26576dc`](https://github.com/conciv-dev/conciv/commit/26576dc0dd99d34892ba238a6d0c550c40ab312f)]:
  - @conciv/ai@0.0.22
  - @conciv/protocol@0.0.22
  - @conciv/ui-kit-chat@0.0.22
  - @conciv/core@0.0.22
  - @conciv/ui-kit-system@0.0.22
  - @conciv/client@0.0.22
  - @conciv/contract@0.0.22
  - @conciv/ui-kit-tap@0.0.22
  - @conciv/extension@0.0.22
  - @conciv/page@0.0.22
  - @conciv/mascot@0.0.22
  - @conciv/solid-streamdown@0.0.22
  - @conciv/ui-kit-chat-tools@0.0.22
  - @conciv/tools@0.0.22
  - @conciv/grab@0.0.22
  - @conciv/solid-diffs@0.0.22

## 0.0.21

### Patch Changes

- Updated dependencies [[`187cbda`](https://github.com/conciv-dev/conciv/commit/187cbda9d7f171046795c0e1c4b5354c0d9571dd), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`ad66158`](https://github.com/conciv-dev/conciv/commit/ad66158ab8919dd5a482f30cca45367df5a9566b), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`0d9fe32`](https://github.com/conciv-dev/conciv/commit/0d9fe3275ada18af5e0e65c37c79b8f3662c8d3a), [`f0ffc0b`](https://github.com/conciv-dev/conciv/commit/f0ffc0b076d88de8ebd93655d980629e29889937), [`377d894`](https://github.com/conciv-dev/conciv/commit/377d894a25c2a83fa009b3240b64dc512e0eef95), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`c06f93f`](https://github.com/conciv-dev/conciv/commit/c06f93f3978414d74829f203c898d258ccde1a1f), [`621c280`](https://github.com/conciv-dev/conciv/commit/621c2802782a5f7420bc0c9b2030a948b793a156), [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8), [`96acad4`](https://github.com/conciv-dev/conciv/commit/96acad42d70fcb83a2ab535999a1c97ecb34a21f), [`5b93081`](https://github.com/conciv-dev/conciv/commit/5b930812c5e4ff718da8799d3fddd1429dc6c7a3), [`6bf7fd7`](https://github.com/conciv-dev/conciv/commit/6bf7fd764de4d02b9af80ad10760e733b333c478), [`3cff847`](https://github.com/conciv-dev/conciv/commit/3cff847f9737309ef22fcac06fb84ff974d1340a), [`23c7842`](https://github.com/conciv-dev/conciv/commit/23c78425c6f53b434d4bf3b4e97666b0cbb95103), [`14fec2c`](https://github.com/conciv-dev/conciv/commit/14fec2caf05dc77879f79055c04ee12f84ea9379), [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee), [`19bd8e7`](https://github.com/conciv-dev/conciv/commit/19bd8e7423d375af888579a5bffff335a3e4c7a3), [`f31c74a`](https://github.com/conciv-dev/conciv/commit/f31c74ad91e9ed4ee2def6b062a6f616dbef6ec1)]:
  - @conciv/ai@0.0.21
  - @conciv/client@0.0.21
  - @conciv/core@0.0.21
  - @conciv/protocol@0.0.21
  - @conciv/ui-kit-system@0.0.21
  - @conciv/solid-streamdown@0.0.21
  - @conciv/ui-kit-chat@0.0.21
  - @conciv/contract@0.0.21
  - @conciv/extension@0.0.21
  - @conciv/tools@0.0.21
  - @conciv/mascot@0.0.21
  - @conciv/page@0.0.21
  - @conciv/ui-kit-chat-tools@0.0.21
  - @conciv/ui-kit-tap@0.0.21
  - @conciv/grab@0.0.21
  - @conciv/solid-diffs@0.0.21

## 0.0.20

### Patch Changes

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Upgrade the @tanstack/ai family 0.43.1 → 0.48.0 in lockstep (ai-client 0.26.0, ai-solid 0.18.3,
  ai-code-mode 0.4.3, ai-isolate-node 0.1.51, ai-isolate-quickjs 0.3.1, ai-mcp 0.3.4, ai-sandbox 0.5.0,
  ai-sandbox-local-process 0.2.4, ai-claude-code/ai-codex 0.4.4, ai-opencode/ai-acp 0.3.4). Upstream
  moved every sibling package's peer range from an exact pin to a caret range, so the pnpm catalog
  comment explaining the old exact-pin poison is rewritten. Code Mode's dynamic binding hook was
  renamed `getSkillBindings` → `getSnippetBindings` upstream; a per-turn `RUN_FINISHED` token-usage
  chunk can now arrive as either the legacy `TokenUsage` shape or the new AG-UI spec `usage[]` array,
  so the run-log fold rebuilds it with `fromSpecTokenUsage` before turning it into a usage snapshot.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - The launcher glows again for a run it did not start. With chat on its own transport a foreign run reaches the pane as a run lifecycle rather than a local stream, so the mascot read a signal that only its own turns could raise. The pane now registers the session's activity - its own stream or a live run on the session - so the launcher follows the targeted session from the start of a run to its settle.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - The chat pane no longer re-suspends the router match when you switch sessions: the harness meta query is created once at app scope and the pane reads a plain derived accessor, so the pane root is never detached and re-inserted (which reset the transcript's scroll position and flashed the loading pane).

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - "Refresh the conversation" is now a real operation instead of a silent stream abort. `chatConnection.refresh()` returns a promise that settles only once the reopened subscription has delivered its first chunk, so callers can await a reconnect rather than fire and forget. A pane-level refresh coordinator (`makeRefreshCoordinator`) awaits that reconnect alongside explicit refetches of the session-scoped queries — the session list that feeds usage and cost, the session markers, and the tool captures — and exposes an `isRefreshing` accessor derived from a single phase signal.

  Both entry points go through the coordinator. The panel's session menu row is now a `Popover.CloseTrigger`, so the menu dismisses on click, and the menu trigger swaps its ellipsis for a spinning refresh glyph (reduced-motion honored through the existing `anim-tool-spin` shortcut) with its accessible name changing to "Refreshing the conversation". The pop-out and quick-terminal toolbar buttons spin and disable the same way. The transcript stays on screen throughout — the refresh never re-arms the loading skeleton — and start, success, and failure are announced in the live region.

- Updated dependencies [[`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`005ce1c`](https://github.com/conciv-dev/conciv/commit/005ce1c0cb34b5b0ce662d9497272144e8a6d10c), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`9549d4a`](https://github.com/conciv-dev/conciv/commit/9549d4a6b484da8e40135eb8abd676ade23ba1b2), [`fd6d4ce`](https://github.com/conciv-dev/conciv/commit/fd6d4ce64ab6a3350406c02e462f5b0bc14dd5f1), [`958dde7`](https://github.com/conciv-dev/conciv/commit/958dde7a862c8cfd735c2232ca13cef659b301f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`4e1e430`](https://github.com/conciv-dev/conciv/commit/4e1e430dd7e67e8f817d0bcfc0c3132782537767), [`efef98a`](https://github.com/conciv-dev/conciv/commit/efef98ab991cd2ce4aca49d7696a135ec0894bec), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`bf64cd8`](https://github.com/conciv-dev/conciv/commit/bf64cd840bb9be69201d7a78b33a7fe3338ac79a), [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`84905d3`](https://github.com/conciv-dev/conciv/commit/84905d36e10b9cbc0dd54736e3f8c6e84b38e3b6), [`236f954`](https://github.com/conciv-dev/conciv/commit/236f95472c51dbd04bc9436a8444e417c8a7ff72), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`e74ef75`](https://github.com/conciv-dev/conciv/commit/e74ef75b8635457db259b32bbad61e08f57f582e), [`1ff8988`](https://github.com/conciv-dev/conciv/commit/1ff89883697627cf4d9c108a602607a0af921bc6), [`d796d1e`](https://github.com/conciv-dev/conciv/commit/d796d1e8a08f86ed9593cadff9748b5d57772cf2), [`4538432`](https://github.com/conciv-dev/conciv/commit/45384329144c3d7f66a41bc8296702ff6cd548f5), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`a3e61ec`](https://github.com/conciv-dev/conciv/commit/a3e61ec0c47879314362b8b9656bc708b675d313), [`436aff0`](https://github.com/conciv-dev/conciv/commit/436aff0ae80ab2d33d06b50128b48e5404dc7b23), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`5bf76b9`](https://github.com/conciv-dev/conciv/commit/5bf76b9869374877e54ffcde85556d4bfbe2615f), [`0537a17`](https://github.com/conciv-dev/conciv/commit/0537a17c89c2f052220b71baa95e2552f5a17eff), [`09f620a`](https://github.com/conciv-dev/conciv/commit/09f620a62d8d65e5721dd16eeaf7f2651225975e), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`f178ec8`](https://github.com/conciv-dev/conciv/commit/f178ec87227ebdb60c10b21426e972083f9a1d05), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`2991888`](https://github.com/conciv-dev/conciv/commit/2991888b1c4baf1d290d39330faf23084959632e), [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51), [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51), [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`478c83b`](https://github.com/conciv-dev/conciv/commit/478c83bdee4d5d7c5e7a27c3586d030907ccf80c), [`5b79c2a`](https://github.com/conciv-dev/conciv/commit/5b79c2ac9dc82e91f7ff67bc927f36c575086688), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`ac969c5`](https://github.com/conciv-dev/conciv/commit/ac969c50f746645d5a5b3bbf51547ed49317c7c3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`1cb8a51`](https://github.com/conciv-dev/conciv/commit/1cb8a51610a59d764ce064216a50b5209d28bde0)]:
  - @conciv/ui-kit-chat@0.0.20
  - @conciv/client@0.0.20
  - @conciv/core@0.0.20
  - @conciv/protocol@0.0.20
  - @conciv/tools@0.0.20
  - @conciv/extension@0.0.20
  - @conciv/contract@0.0.20
  - @conciv/ui-kit-chat-tools@0.0.20
  - @conciv/ui-kit-system@0.0.20
  - @conciv/solid-streamdown@0.0.20
  - @conciv/solid-diffs@0.0.20
  - @conciv/page@0.0.20
  - @conciv/mascot@0.0.20
  - @conciv/ui-kit-tap@0.0.20
  - @conciv/grab@0.0.20

## 0.0.19

### Patch Changes

- [#469](https://github.com/conciv-dev/conciv/pull/469) [`8a1ddc9`](https://github.com/conciv-dev/conciv/commit/8a1ddc94555aec8d7070b42073ecdf9e7af29c94) Thanks [@omridevk](https://github.com/omridevk)! - Extension instance disposal is now owned by `createConcivRouter` itself: a `Wrap` component registers `onCleanup` for every extension instance's `dispose()`, riding whatever unmounts the tree that rendered `RouterProvider`. The three `apps/conciv` browser suites that used to pair `disposeConcivRouter` with a manual unmount no longer need to — they were forgettable by construction, and every consumer that forgot leaked extension state.

  `disposeConcivRouter` stays exported as an explicit, idempotent escape hatch for the one case `Wrap` can't cover: a router created but never rendered (e.g. a boot that fails before `render()` runs) still needs an owner for its eagerly-created extension instances. It shares one guarded disposer with `Wrap`'s `onCleanup` — first call disposes, every later call (whether from a normal unmount or a repeat call) is a no-op — so `packages/embed/src/mount-impl.tsx` can keep calling it unconditionally in its disposer list without double-disposing.

- Updated dependencies [[`e628f93`](https://github.com/conciv-dev/conciv/commit/e628f93ed9d4067c6ad164a2af0369e543abd62f), [`c6aa92c`](https://github.com/conciv-dev/conciv/commit/c6aa92c53847d9f811eafebf414492335864955b), [`6ce79cf`](https://github.com/conciv-dev/conciv/commit/6ce79cf66cb0629ba965af4d4d06b242c673b017), [`78977f0`](https://github.com/conciv-dev/conciv/commit/78977f03328d09224602b6162b9178c48b4e04a9), [`39c6072`](https://github.com/conciv-dev/conciv/commit/39c6072687cdedeabc42dabe798d88fa10dc716b), [`23f62c9`](https://github.com/conciv-dev/conciv/commit/23f62c9ad8a810cdf177a53701a1516b191436fe), [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323), [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323), [`b329b47`](https://github.com/conciv-dev/conciv/commit/b329b47b889201093c5de042f389eac297caa249), [`af72648`](https://github.com/conciv-dev/conciv/commit/af72648838bd828477102f87f78d457d17ebec41)]:
  - @conciv/ui-kit-chat@0.0.19
  - @conciv/core@0.0.19
  - @conciv/ui-kit-system@0.0.19
  - @conciv/contract@0.0.19
  - @conciv/extension@0.0.19
  - @conciv/tools@0.0.19
  - @conciv/ui-kit-chat-tools@0.0.19
  - @conciv/client@0.0.19
  - @conciv/ui-kit-tap@0.0.19
  - @conciv/page@0.0.19
  - @conciv/grab@0.0.19
  - @conciv/mascot@0.0.19
  - @conciv/protocol@0.0.19
  - @conciv/solid-diffs@0.0.19
  - @conciv/solid-streamdown@0.0.19

## 0.0.18

### Patch Changes

- Updated dependencies [[`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`1e1b01b`](https://github.com/conciv-dev/conciv/commit/1e1b01b36c3b5c282d51a6689b8a18810a330fc2), [`3f9bf5d`](https://github.com/conciv-dev/conciv/commit/3f9bf5dc25bcf911e788ef53547436f46cab11b6), [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`3077460`](https://github.com/conciv-dev/conciv/commit/307746013f8dbdc03e1cd98673aaa4e574b81342)]:
  - @conciv/ui-kit-chat@0.0.18
  - @conciv/protocol@0.0.18
  - @conciv/extension@0.0.18
  - @conciv/page@0.0.18
  - @conciv/ui-kit-chat-tools@0.0.18
  - @conciv/client@0.0.18
  - @conciv/contract@0.0.18
  - @conciv/grab@0.0.18
  - @conciv/mascot@0.0.18
  - @conciv/solid-diffs@0.0.18
  - @conciv/solid-streamdown@0.0.18
  - @conciv/ui-kit-system@0.0.18

## 0.0.17

### Patch Changes

- Updated dependencies [[`2aa2b01`](https://github.com/conciv-dev/conciv/commit/2aa2b01db001973dd3432253fabc915462b3ec85), [`cf6fc75`](https://github.com/conciv-dev/conciv/commit/cf6fc75ddc841c4fd01b331b93568af7283b320a)]:
  - @conciv/ui-kit-chat@0.0.17
  - @conciv/ui-kit-chat-tools@0.0.17
  - @conciv/client@0.0.17
  - @conciv/contract@0.0.17
  - @conciv/extension@0.0.17
  - @conciv/grab@0.0.17
  - @conciv/mascot@0.0.17
  - @conciv/page@0.0.17
  - @conciv/protocol@0.0.17
  - @conciv/solid-diffs@0.0.17
  - @conciv/solid-streamdown@0.0.17
  - @conciv/ui-kit-system@0.0.17

## 0.0.16

### Patch Changes

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e), [`aa06a88`](https://github.com/conciv-dev/conciv/commit/aa06a88067430bd97934f4abb0b096bfdf1812f4), [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/extension@0.0.16
  - @conciv/protocol@0.0.16
  - @conciv/grab@0.0.16
  - @conciv/ui-kit-chat@0.0.16
  - @conciv/ui-kit-chat-tools@0.0.16
  - @conciv/page@0.0.16
  - @conciv/client@0.0.16
  - @conciv/contract@0.0.16
  - @conciv/mascot@0.0.16
  - @conciv/solid-diffs@0.0.16
  - @conciv/solid-streamdown@0.0.16
  - @conciv/ui-kit-system@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/client@0.0.15
  - @conciv/contract@0.0.15
  - @conciv/extension@0.0.15
  - @conciv/grab@0.0.15
  - @conciv/mascot@0.0.15
  - @conciv/page@0.0.15
  - @conciv/protocol@0.0.15
  - @conciv/solid-streamdown@0.0.15
  - @conciv/ui-kit-chat@0.0.15
  - @conciv/ui-kit-chat-tools@0.0.15
  - @conciv/ui-kit-system@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies [[`8370fd9`](https://github.com/conciv-dev/conciv/commit/8370fd9ef1156296236d4a9e22f5453ca817d9f3), [`757071f`](https://github.com/conciv-dev/conciv/commit/757071f4bf394cb591b4f45c5bee9fc63c9afb41)]:
  - @conciv/extension@0.0.14
  - @conciv/client@0.0.14
  - @conciv/ui-kit-chat@0.0.14
  - @conciv/ui-kit-chat-tools@0.0.14
  - @conciv/contract@0.0.14
  - @conciv/grab@0.0.14
  - @conciv/mascot@0.0.14
  - @conciv/page@0.0.14
  - @conciv/protocol@0.0.14
  - @conciv/solid-streamdown@0.0.14
  - @conciv/ui-kit-system@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13
  - @conciv/client@0.0.13
  - @conciv/contract@0.0.13
  - @conciv/extension@0.0.13
  - @conciv/page@0.0.13
  - @conciv/ui-kit-chat@0.0.13
  - @conciv/ui-kit-chat-tools@0.0.13
  - @conciv/grab@0.0.13
  - @conciv/mascot@0.0.13
  - @conciv/solid-streamdown@0.0.13
  - @conciv/ui-kit-system@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/client@0.0.12
  - @conciv/contract@0.0.12
  - @conciv/extension@0.0.12
  - @conciv/grab@0.0.12
  - @conciv/mascot@0.0.12
  - @conciv/page@0.0.12
  - @conciv/protocol@0.0.12
  - @conciv/solid-streamdown@0.0.12
  - @conciv/ui-kit-chat@0.0.12
  - @conciv/ui-kit-chat-tools@0.0.12
  - @conciv/ui-kit-system@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies [[`5f76cc2`](https://github.com/conciv-dev/conciv/commit/5f76cc2d14ae93265f8c72b3eb6d5254abe3bb59)]:
  - @conciv/solid-streamdown@0.0.11
  - @conciv/ui-kit-chat@0.0.11
  - @conciv/ui-kit-chat-tools@0.0.11
  - @conciv/client@0.0.11
  - @conciv/contract@0.0.11
  - @conciv/extension@0.0.11
  - @conciv/grab@0.0.11
  - @conciv/mascot@0.0.11
  - @conciv/page@0.0.11
  - @conciv/protocol@0.0.11
  - @conciv/ui-kit-system@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/client@0.0.10
  - @conciv/contract@0.0.10
  - @conciv/extension@0.0.10
  - @conciv/grab@0.0.10
  - @conciv/mascot@0.0.10
  - @conciv/page@0.0.10
  - @conciv/protocol@0.0.10
  - @conciv/solid-streamdown@0.0.10
  - @conciv/ui-kit-chat@0.0.10
  - @conciv/ui-kit-chat-tools@0.0.10
  - @conciv/ui-kit-system@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @conciv/client@0.0.9
  - @conciv/contract@0.0.9
  - @conciv/extension@0.0.9
  - @conciv/grab@0.0.9
  - @conciv/mascot@0.0.9
  - @conciv/page@0.0.9
  - @conciv/protocol@0.0.9
  - @conciv/solid-streamdown@0.0.9
  - @conciv/ui-kit-chat@0.0.9
  - @conciv/ui-kit-chat-tools@0.0.9
  - @conciv/ui-kit-system@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies [[`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf)]:
  - @conciv/contract@0.0.8
  - @conciv/client@0.0.8
  - @conciv/extension@0.0.8
  - @conciv/page@0.0.8
  - @conciv/ui-kit-chat-tools@0.0.8
  - @conciv/grab@0.0.8
  - @conciv/mascot@0.0.8
  - @conciv/protocol@0.0.8
  - @conciv/solid-streamdown@0.0.8
  - @conciv/ui-kit-chat@0.0.8
  - @conciv/ui-kit-system@0.0.8
