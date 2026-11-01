# @conciv/embed

## 0.0.21

### Patch Changes

- [#625](https://github.com/conciv-dev/conciv/pull/625) [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c) Thanks [@omridevk](https://github.com/omridevk)! - Dependency upgrades for build tooling and runtime packages: bippy 0.6, react-grab 0.2, @pierre/diffs 1.6, @tanstack/hotkeys 0.18, rrweb 2.2, changesets 3, turbo 2.11 and the rest of the deps-packages lane.

- [#650](https://github.com/conciv-dev/conciv/pull/650) [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee) Thanks [@omridevk](https://github.com/omridevk)! - New built-in design extension, mounted by `@conciv/it`: register a design image as the target of a route at a width, then `conciv tools design diff` compares the live page with it and ranks the components that differ, with the deltas and the source that sets them. `conciv tools design status` says when every registered width matches. The agent guide written by `conciv init` describes the loop.

- [#652](https://github.com/conciv-dev/conciv/pull/652) [`af69127`](https://github.com/conciv-dev/conciv/commit/af69127fb97de0d722e206a6d31471a0569fdf02) Thanks [@omridevk](https://github.com/omridevk)! - Isolate crashing extensions behind one boundary: tabs, surfaces, slots, tool and attachment cards and view icons keep the widget up, log the crash, and tabs offer a retry.

- [#677](https://github.com/conciv-dev/conciv/pull/677) [`8d69e53`](https://github.com/conciv-dev/conciv/commit/8d69e53ab3e7c4856db980bb5656eda4fddac9ed) Thanks [@omridevk](https://github.com/omridevk)! - Hold the consolidated chat-plane packages to the test file budget again.

- [#674](https://github.com/conciv-dev/conciv/pull/674) [`15c2fcb`](https://github.com/conciv-dev/conciv/commit/15c2fcb875fae4ffa552671380b7227a1e790d6f) Thanks [@omridevk](https://github.com/omridevk)! - Cut the embed end-to-end suite to the cases no faster test already covers.

- [#666](https://github.com/conciv-dev/conciv/pull/666) [`4465b85`](https://github.com/conciv-dev/conciv/commit/4465b854e45ce6553eebd6547e2d0be49157f71e) Thanks [@omridevk](https://github.com/omridevk)! - Fold the apps/conciv test suite into one node file, one browser file and the calm perf file, with helpers split by runner.
- Updated dependencies [[`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`ad66158`](https://github.com/conciv-dev/conciv/commit/ad66158ab8919dd5a482f30cca45367df5a9566b), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee), [`0d9fe32`](https://github.com/conciv-dev/conciv/commit/0d9fe3275ada18af5e0e65c37c79b8f3662c8d3a), [`f0ffc0b`](https://github.com/conciv-dev/conciv/commit/f0ffc0b076d88de8ebd93655d980629e29889937), [`377d894`](https://github.com/conciv-dev/conciv/commit/377d894a25c2a83fa009b3240b64dc512e0eef95), [`621c280`](https://github.com/conciv-dev/conciv/commit/621c2802782a5f7420bc0c9b2030a948b793a156), [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8), [`96acad4`](https://github.com/conciv-dev/conciv/commit/96acad42d70fcb83a2ab535999a1c97ecb34a21f), [`5b93081`](https://github.com/conciv-dev/conciv/commit/5b930812c5e4ff718da8799d3fddd1429dc6c7a3), [`6bf7fd7`](https://github.com/conciv-dev/conciv/commit/6bf7fd764de4d02b9af80ad10760e733b333c478), [`3cff847`](https://github.com/conciv-dev/conciv/commit/3cff847f9737309ef22fcac06fb84ff974d1340a), [`23c7842`](https://github.com/conciv-dev/conciv/commit/23c78425c6f53b434d4bf3b4e97666b0cbb95103), [`14fec2c`](https://github.com/conciv-dev/conciv/commit/14fec2caf05dc77879f79055c04ee12f84ea9379), [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee), [`19bd8e7`](https://github.com/conciv-dev/conciv/commit/19bd8e7423d375af888579a5bffff335a3e4c7a3), [`f31c74a`](https://github.com/conciv-dev/conciv/commit/f31c74ad91e9ed4ee2def6b062a6f616dbef6ec1)]:
  - @conciv/client@0.0.21
  - @conciv/protocol@0.0.21
  - @conciv/ui-kit-system@0.0.21
  - @conciv/solid-streamdown@0.0.21
  - @conciv/ui-kit-chat@0.0.21
  - @conciv/extension-page@0.0.21
  - @conciv/contract@0.0.21
  - @conciv/extension@0.0.21
  - @conciv/mascot@0.0.21
  - @conciv/extension-ios@0.0.21
  - @conciv/ui-kit-chat-tools@0.0.21
  - @conciv/ui-kit-tap@0.0.21
  - @conciv/grab@0.0.21
  - @conciv/solid-diffs@0.0.21
  - @conciv/storage-history@0.0.21

## 0.0.20

### Patch Changes

- [#538](https://github.com/conciv-dev/conciv/pull/538) [`258fe9a`](https://github.com/conciv-dev/conciv/commit/258fe9a39f93eaf2f258f0f87efa9b2e3878fa01) Thanks [@omridevk](https://github.com/omridevk)! - Keystrokes typed into the widget composer no longer trigger host-page hotkeys: keyboard events originating from an editable element inside the widget stop at the shadow host, so a `/` in a prompt no longer opens a docs site's search modal mid-sentence.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Highlight tool-result code and diffs in a worker pool instead of on the main thread. `SolidCodeBlock`, `SolidFileDiff` and `SolidPatchDiff` now hand `@pierre/diffs` a shared worker pool built from its portable worker entry, so that grammar compilation and tokenization run off the main thread while the block keeps rendering plain text until the highlighted result arrives.

- [#490](https://github.com/conciv-dev/conciv/pull/490) [`d796d1e`](https://github.com/conciv-dev/conciv/commit/d796d1e8a08f86ed9593cadff9748b5d57772cf2) Thanks [@omridevk](https://github.com/omridevk)! - Dragging the closed launcher no longer jitters outside the viewport and no longer snaps back from a valid drop. The live drag position is clamped so the button never renders past a viewport edge, the drag offset rides a single owner (an inline transform relative to the button's own resting anchor instead of competing `left`/`top` writes), and the release glides to the snap point through one Web Animations pass whose end state is the resting state — so the hand-off back to CSS moves nothing. A drop that is already at the resting spot skips the animation entirely.

- [#513](https://github.com/conciv-dev/conciv/pull/513) [`6020d52`](https://github.com/conciv-dev/conciv/commit/6020d52d60bc6c824118d10787d557beeac1fc3f) Thanks [@omridevk](https://github.com/omridevk)! - Grabs are attachments: the snapshot survives a panel reload, sent grabs render as a card in the transcript instead of raw HTML text, and composer attachments now persist in the session draft.

- [#481](https://github.com/conciv-dev/conciv/pull/481) [`f3bea6c`](https://github.com/conciv-dev/conciv/commit/f3bea6c3656a282dc193b86f9835bfa80ba135d7) Thanks [@omridevk](https://github.com/omridevk)! - Grab reference cards clear the moment a message is sent and are restored if the send fails. The staged-grabs strip
  sizes to its content by default and resizes via a pill grabber on its top edge (the shared createResizable, which
  gained an optional max bound and no longer requires a storage key); previews scale to the card like images through
  an svg viewBox, capped at 40% of the panel height. The panel minimum height rises to 400px and the composer keeps
  priority at any panel size.

- [#570](https://github.com/conciv-dev/conciv/pull/570) [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1) Thanks [@omridevk](https://github.com/omridevk)! - The widget now adapts to the host page's color scheme instead of always rendering dark. It resolves
  the scheme at mount, before first paint, from a computed `color-scheme` on the host root, then a
  `.light`/`.dark` class or `data-theme` attribute, then `prefers-color-scheme`, and re-resolves live
  when the host page toggles its theme. Every color token is declared once as a `light-dark()` pair,
  so a scheme is a single `color-scheme` flip: scrollbars, native controls, Shiki code blocks, the
  diffs component, popped-out windows, and the terminal pane all follow. UnoCSS `dark:`/`light:`
  variants key off the widget's own scheme classes. Extension `chat-accent` / `chat-hue` overrides keep
  working in both schemes.

- [#544](https://github.com/conciv-dev/conciv/pull/544) [`84905d3`](https://github.com/conciv-dev/conciv/commit/84905d36e10b9cbc0dd54736e3f8c6e84b38e3b6) Thanks [@omridevk](https://github.com/omridevk)! - Fix [#532](https://github.com/conciv-dev/conciv/issues/532): an idle widget on the fetch transport now notices the engine refusing new connections. `engineProbeRefetchInterval` takes a `heartbeat` condition alongside `reachable`; while reachable and the heartbeat condition holds (fetch transport, panel open) the existing engine-meta query polls every 30s instead of going silent, so a refused connection surfaces the standing offline notice without requiring the user to attempt an action first.

- [#591](https://github.com/conciv-dev/conciv/pull/591) [`1ff8988`](https://github.com/conciv-dev/conciv/commit/1ff89883697627cf4d9c108a602607a0af921bc6) Thanks [@omridevk](https://github.com/omridevk)! - Host marker strings renamed off the dead `pw` prefix to `conciv`: the `pw-widget` / `pw-api-base` meta tags, every `data-pw-*` attribute, the `pw-chat-panel` id (and its `aria-controls` references), the `pw-session-` id prefix, the `pw-conciv-model` localStorage key (now `conciv-model`, saved preference intentionally dropped), `pw-grab-pseudo-` capture-clone classes, and the `.pw-fab-*` / `.pw-rig-*` mascot rig classes. Breaking for any host or tooling still targeting the old meta names, data attributes, ids, or storage key.

- [#542](https://github.com/conciv-dev/conciv/pull/542) [`c5015fe`](https://github.com/conciv-dev/conciv/commit/c5015fe3ec89327975fabf814f0d6eaadcada1fb) Thanks [@omridevk](https://github.com/omridevk)! - The panel's composer-focus effect no longer steals focus from the host page. A restored open panel (page load, session switch, or FAB open) now checks whether a host-page element currently holds focus and skips the composer focus claim when it does, so a host input with `autofocus` keeps focus across widget boot. Opening the panel while focus is inside the widget itself (for example clicking the FAB) still focuses the composer as before.

- [#568](https://github.com/conciv-dev/conciv/pull/568) [`d03af7f`](https://github.com/conciv-dev/conciv/commit/d03af7f7cac4267f9b573f0cadcd69e74c019f89) Thanks [@omridevk](https://github.com/omridevk)! - The widget now paints once its restored navigation state is known, instead of painting a closed launcher and then reopening the panel a moment later when the restore RPC returns. Reopening the panel after a reload or a remount is unchanged; only the visible jump is gone. A restore that arrives after the user has already navigated is now ignored rather than replacing the route they just moved to.

- [#573](https://github.com/conciv-dev/conciv/pull/573) [`2991888`](https://github.com/conciv-dev/conciv/commit/2991888b1c4baf1d290d39330faf23084959632e) Thanks [@omridevk](https://github.com/omridevk)! - The session title in the panel header now reads the session list inside its own Suspense boundary. Previously that read sat directly under the route-level boundary, so every time the session-list resource was unresolved the router swapped the whole live panel for the full-pane loading indicator and swapped it straight back. That detached and re-attached the header, chat pane, and status bar as the same DOM nodes, which silently blurred a focused composer and left focus on `document.body`. The title now falls back to a skeleton on its own while the rest of the panel stays mounted, so opening the panel reliably lands focus in the composer.

- [#612](https://github.com/conciv-dev/conciv/pull/612) [`413bc87`](https://github.com/conciv-dev/conciv/commit/413bc87ccfd2cc445f0a5b05e039a92d952c29b9) Thanks [@omridevk](https://github.com/omridevk)! - Workspace manifests now take every shared dependency from the single pnpm catalog in `pnpm-workspace.yaml`
  (published manifests still carry concrete versions), and the catalog is upgraded to the newest releases outside the
  48h `minimumReleaseAge` window. Notable upgrades: `@types/node` unified on 26, TypeScript 6 for the Next.js apps,
  preact 10 to 11, p-timeout 7 to 8, oxc-parser 0.127 to 0.156, lucide 1.18 to 1.62, `@orpc/*` 1.14 to 1.16.
  Held back: the `@tanstack/ai*` family (1.0 is a migration), TypeScript 6 (7 ships no compiler API), vitest 4
  (5 changes locator and text-matcher semantics), motion 12, the TanStack router/start set at react-start 1.168.61
  (1.169 removed `useSession`), bippy 0.5 and react-grab 0.1.48 (API removals), and oxlint 1.73 (1.90 adds new
  failing rules).

- [#509](https://github.com/conciv-dev/conciv/pull/509) [`163cfd5`](https://github.com/conciv-dev/conciv/commit/163cfd5f844a2c8b97a97c8ceb1440076ff69a21) Thanks [@omridevk](https://github.com/omridevk)! - Scope widget session invalidation to the session list, so adding, closing or creating a pane no longer re-resolves the warm session over the wire.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Selecting text in the chat and dragging past the edge of the panel no longer highlights the host page behind it. The selection stays inside the chat in Chromium and Firefox whatever styles the host page uses, so copying or quoting it picks up only chat text. In Firefox, moving the pointer out of the panel sideways can stretch the selection up to the top of the panel. Selecting text on the host page works as before.

- [#593](https://github.com/conciv-dev/conciv/pull/593) [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3) Thanks [@omridevk](https://github.com/omridevk)! - Skin axis: named looks over a 37-anchor token contract, selected with `--conciv-skin`.

  A host page picks the widget's look by declaring one CSS custom property on `html` or `body`:

  ```css
  html {
    --conciv-skin: terminal;
  }
  ```

  Two skins ship in-repo: `conciv` (the default) and `terminal`. Each is a typed object in
  `@conciv/ui-kit-system` that sets only the anchors — surfaces, ink, overlays, accent, status, type,
  radii, shadows, easing and a density unit — as `{light, dark}` pairs or single values, so a skin is
  complete for both colour schemes by construction and omitting anything is a compile error. Every
  other `--chat-*` custom property stays internal and is derived once from the anchors, so hand-tuned
  semantics stay consistent across skins.

  The resolved skin is stamped on every render root the widget owns, including the shadow host (so
  Ark portals follow), the body-level effects overlay and popped-out windows, which now carry both the
  scheme and the skin. An unknown value falls back to `conciv` with one console warning. The skin's
  `--chat-space` scales the spacing base of the thread and composer only; frame geometry does not
  follow it.

  Two contract documents are generated from the same typed source and committed, with a CI drift
  check: `docs/skin-anchors.md` (what a skin may write) and `docs/extension-tokens.md` (what an
  extension may read). Every skin's colour pairs are checked for WCAG contrast in CI.

  BREAKING: the per-extension theme map is removed. `defineExtension({theme})`, the `ThemeTokens` type,
  the runtime theme applier and its injected `style[data-conciv-theme]` element, the catalog's theme
  validation and `overridable` token flag, and the `theme` scaffold kind are all gone. Extensions style
  exclusively through the public `--chat-*` tokens and utilities; derive a bespoke colour locally with
  `color-mix` over a public token instead.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - The launcher now reflects only the session it targets: a run in any other session no longer leaves the mascot glowing.

- [#516](https://github.com/conciv-dev/conciv/pull/516) [`70614e8`](https://github.com/conciv-dev/conciv/commit/70614e8f2b415145bfb8f9198bd8818307d15478) Thanks [@omridevk](https://github.com/omridevk)! - The notifications region no longer reserves a padded strip above the widget header while empty — zag inlines `display: flex` on the toast group, so the `empty:hidden` class never applied and its padding rendered as a permanent 20px gap.

- [#521](https://github.com/conciv-dev/conciv/pull/521) [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a) Thanks [@omridevk](https://github.com/omridevk)! - `mount(el)` now resolves only once the widget can actually honor `open()` — previously the returned promise settled as soon as the app's boot sequence finished computing, which raced ahead of the root route's `onMount` (where the open-panel listener registers). Any embedder that opens the panel immediately after `mount()` resolves — including a landing page's "Try it live" button that dispatches an early click before the widget bundle finishes loading — no longer has that open silently dropped.

  `mountConciv(extensions)` now returns the underlying `mount()` promise instead of `void`, so a caller can `await` it (or observe a rejection) instead of the widget's readiness being unobservable outside `createConciv`. Existing fire-and-forget call sites keep working unchanged; they just ignore the returned promise.

  New `@conciv/protocol/event-bus` export: `createEventBus`/`createEventBusClient`, a faithful port of the TanStack Devtools in-page event-bus protocol. It eliminates the whole "sender fires before receiver is listening" class of races, not just the one above. Every emit is wrapped as an envelope (`{type: '<pluginId>:<suffix>', payload, pluginId}`) and dispatched on one fixed bus event (`conciv-dispatch-event`); the running bus re-dispatches it as both a specific `<pluginId>:<suffix>` event and a global `conciv-global` event, and answers the fixed `conciv-connect` handshake with `conciv-connect-success`. Clients queue emits until connected, retry on a bounded loop, and flush in order on ack.

  Panel commands moved onto that protocol under the `panel` plugin id, so the wire events are now `panel:open`, `panel:close` and `panel:toggle` instead of `conciv:open-panel`, `conciv:close-panel` and `conciv:toggle-panel`, and they are spoken through a bus client rather than a bare `window.dispatchEvent`. `createConciv().open()`/`close()`/`toggle()`, the landing page's "Try it live" button, and the iOS bridge's panel open/close all emit through a client; the widget's root route subscribes with `client.on()` and starts the bus once its listeners are registered. Status events (`conciv:connection-changed`, `conciv:panel-toggled`) are unchanged raw window events.

- [#530](https://github.com/conciv-dev/conciv/pull/530) [`7a95ab8`](https://github.com/conciv-dev/conciv/commit/7a95ab8e0cf959d75fb0b47977325b02d90c4718) Thanks [@omridevk](https://github.com/omridevk)! - Restoring a persisted panel route whose extension view is no longer mounted now lands on the chat view instead of rendering an empty pane. The `/panel/$sessionId/$view` route canonicalizes an unknown view id in `beforeLoad` with a replacing redirect to `/panel/$sessionId`, mirroring how `/panel/$sessionId` already canonicalizes an unadopted harness session id.

- [#531](https://github.com/conciv-dev/conciv/pull/531) [`152a7bd`](https://github.com/conciv-dev/conciv/commit/152a7bdf788399e72e20ddb3c780217940faa632) Thanks [@omridevk](https://github.com/omridevk)! - Clear a draft the moment the composer empties, so a sent message can never come back as a stale draft after a reload or remount.
- Updated dependencies [[`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`9549d4a`](https://github.com/conciv-dev/conciv/commit/9549d4a6b484da8e40135eb8abd676ade23ba1b2), [`fd6d4ce`](https://github.com/conciv-dev/conciv/commit/fd6d4ce64ab6a3350406c02e462f5b0bc14dd5f1), [`958dde7`](https://github.com/conciv-dev/conciv/commit/958dde7a862c8cfd735c2232ca13cef659b301f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`4e1e430`](https://github.com/conciv-dev/conciv/commit/4e1e430dd7e67e8f817d0bcfc0c3132782537767), [`efef98a`](https://github.com/conciv-dev/conciv/commit/efef98ab991cd2ce4aca49d7696a135ec0894bec), [`bf64cd8`](https://github.com/conciv-dev/conciv/commit/bf64cd840bb9be69201d7a78b33a7fe3338ac79a), [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`84905d3`](https://github.com/conciv-dev/conciv/commit/84905d36e10b9cbc0dd54736e3f8c6e84b38e3b6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`e74ef75`](https://github.com/conciv-dev/conciv/commit/e74ef75b8635457db259b32bbad61e08f57f582e), [`1ff8988`](https://github.com/conciv-dev/conciv/commit/1ff89883697627cf4d9c108a602607a0af921bc6), [`d796d1e`](https://github.com/conciv-dev/conciv/commit/d796d1e8a08f86ed9593cadff9748b5d57772cf2), [`4538432`](https://github.com/conciv-dev/conciv/commit/45384329144c3d7f66a41bc8296702ff6cd548f5), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`ee779f0`](https://github.com/conciv-dev/conciv/commit/ee779f0456f0c4aedb5c00d8c2d69229de7598a1), [`a3e61ec`](https://github.com/conciv-dev/conciv/commit/a3e61ec0c47879314362b8b9656bc708b675d313), [`436aff0`](https://github.com/conciv-dev/conciv/commit/436aff0ae80ab2d33d06b50128b48e5404dc7b23), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`5bf76b9`](https://github.com/conciv-dev/conciv/commit/5bf76b9869374877e54ffcde85556d4bfbe2615f), [`09f620a`](https://github.com/conciv-dev/conciv/commit/09f620a62d8d65e5721dd16eeaf7f2651225975e), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`f178ec8`](https://github.com/conciv-dev/conciv/commit/f178ec87227ebdb60c10b21426e972083f9a1d05), [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51), [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51), [`2054a18`](https://github.com/conciv-dev/conciv/commit/2054a1840c680cfaddd07f721cb09591b69d5b51), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`478c83b`](https://github.com/conciv-dev/conciv/commit/478c83bdee4d5d7c5e7a27c3586d030907ccf80c), [`5b79c2a`](https://github.com/conciv-dev/conciv/commit/5b79c2ac9dc82e91f7ff67bc927f36c575086688), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`ac969c5`](https://github.com/conciv-dev/conciv/commit/ac969c50f746645d5a5b3bbf51547ed49317c7c3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`1cb8a51`](https://github.com/conciv-dev/conciv/commit/1cb8a51610a59d764ce064216a50b5209d28bde0)]:
  - @conciv/ui-kit-chat@0.0.20
  - @conciv/client@0.0.20
  - @conciv/protocol@0.0.20
  - @conciv/extension@0.0.20
  - @conciv/contract@0.0.20
  - @conciv/ui-kit-chat-tools@0.0.20
  - @conciv/extension-page@0.0.20
  - @conciv/ui-kit-system@0.0.20
  - @conciv/solid-streamdown@0.0.20
  - @conciv/solid-diffs@0.0.20
  - @conciv/mascot@0.0.20
  - @conciv/ui-kit-tap@0.0.20
  - @conciv/extension-ios@0.0.20
  - @conciv/grab@0.0.20
  - @conciv/storage-history@0.0.20

## 0.0.19

### Patch Changes

- [#349](https://github.com/conciv-dev/conciv/pull/349) [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323) Thanks [@omridevk](https://github.com/omridevk)! - Closing a browser rpc connection no longer raises an unhandled error.

  A disposed connection now answers writes itself instead of letting them reach a dead socket: peer
  control frames (cancellations and client event-iterator payloads) are dropped, so oRPC's abort path
  runs to completion and closes the call it was cancelling, while a request frame still fails fast so a
  caller holding a stale link learns the connection is gone instead of hanging. Dispose delivers a
  close event only when partysocket's own `close()` emits none — it already dispatches one
  synchronously unless the socket never dialled or is already closing — so the peer observes exactly
  one terminal event.

  Unmounting the widget now releases the tab's connection: the socket is closed and the registry entry
  dropped, instead of leaving partysocket and its reconnect timers alive for the rest of the tab's
  life. A later mount re-creates the connection through the same registry, running the full transport
  probe again.

  `handle.rebind` now drops the old connection before tearing its consumers down, and rebinding to the
  base the widget is already on re-runs the probe rather than being a no-op, so a tab that fell back to
  fetch/SSE while the engine was unreachable can ride the websocket again once it recovers.

  A live connection reports partysocket's real state: open while open, connecting while it will
  reconnect, closed once it will not, so oRPC fails a send fast instead of waiting on a socket that is
  never coming back.

- Updated dependencies [[`e628f93`](https://github.com/conciv-dev/conciv/commit/e628f93ed9d4067c6ad164a2af0369e543abd62f), [`6ce79cf`](https://github.com/conciv-dev/conciv/commit/6ce79cf66cb0629ba965af4d4d06b242c673b017), [`39c6072`](https://github.com/conciv-dev/conciv/commit/39c6072687cdedeabc42dabe798d88fa10dc716b), [`23f62c9`](https://github.com/conciv-dev/conciv/commit/23f62c9ad8a810cdf177a53701a1516b191436fe), [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323), [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323), [`b329b47`](https://github.com/conciv-dev/conciv/commit/b329b47b889201093c5de042f389eac297caa249)]:
  - @conciv/ui-kit-chat@0.0.19
  - @conciv/ui-kit-system@0.0.19
  - @conciv/contract@0.0.19
  - @conciv/extension@0.0.19
  - @conciv/extension-page@0.0.19
  - @conciv/ui-kit-chat-tools@0.0.19
  - @conciv/client@0.0.19
  - @conciv/extension-ios@0.0.19
  - @conciv/ui-kit-tap@0.0.19
  - @conciv/grab@0.0.19
  - @conciv/mascot@0.0.19
  - @conciv/protocol@0.0.19
  - @conciv/solid-diffs@0.0.19
  - @conciv/solid-streamdown@0.0.19
  - @conciv/storage-history@0.0.19

## 0.0.18

### Patch Changes

- [#170](https://github.com/conciv-dev/conciv/pull/170) [`47c5423`](https://github.com/conciv-dev/conciv/commit/47c5423107f588c9bf5cc94faa5348fc769ef89e) Thanks [@omridevk](https://github.com/omridevk)! - Widget navigation is no longer clobbered by a slow write. The widget now stamps each navigation write with the moment the navigation happened and the server keeps only the newest one, so a request that gets delayed on the network can no longer resurrect a view the user already left. A freshly loaded page continues from the stored stamp, so it still wins over a write the page it replaced left in flight, and the server ignores stamps more than a day ahead of its own clock so a badly wrong client clock cannot wedge navigation saving.

- Updated dependencies [[`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`1e1b01b`](https://github.com/conciv-dev/conciv/commit/1e1b01b36c3b5c282d51a6689b8a18810a330fc2), [`830fc5d`](https://github.com/conciv-dev/conciv/commit/830fc5d17b3bf6ce146b413bb7ddb372ad2c821a), [`3f9bf5d`](https://github.com/conciv-dev/conciv/commit/3f9bf5dc25bcf911e788ef53547436f46cab11b6), [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`42a0ad0`](https://github.com/conciv-dev/conciv/commit/42a0ad0273cbf8b1b48d197c363f4f77da75dc69), [`32b49c3`](https://github.com/conciv-dev/conciv/commit/32b49c36a2c62210391449a1b2f01095d8ece57f)]:
  - @conciv/ui-kit-chat@0.0.18
  - @conciv/protocol@0.0.18
  - @conciv/extension@0.0.18
  - @conciv/extension-ios@0.0.18
  - @conciv/extension-page@0.0.18
  - @conciv/ui-kit-chat-tools@0.0.18
  - @conciv/client@0.0.18
  - @conciv/contract@0.0.18
  - @conciv/grab@0.0.18
  - @conciv/mascot@0.0.18
  - @conciv/solid-diffs@0.0.18
  - @conciv/solid-streamdown@0.0.18
  - @conciv/storage-history@0.0.18
  - @conciv/ui-kit-system@0.0.18

## 0.0.17

### Patch Changes

- [#156](https://github.com/conciv-dev/conciv/pull/156) [`0d2ddf6`](https://github.com/conciv-dev/conciv/commit/0d2ddf6cb63baa58095a70faf9783c12a895928c) Thanks [@omridevk](https://github.com/omridevk)! - The full-screen chat panel on phones now paints an opaque background, so the app behind it no longer shows through the sheet.

- Updated dependencies [[`2aa2b01`](https://github.com/conciv-dev/conciv/commit/2aa2b01db001973dd3432253fabc915462b3ec85), [`cf6fc75`](https://github.com/conciv-dev/conciv/commit/cf6fc75ddc841c4fd01b331b93568af7283b320a), [`d76c337`](https://github.com/conciv-dev/conciv/commit/d76c337ba404b1f5c23a6f548a92e008f09490dd)]:
  - @conciv/ui-kit-chat@0.0.17
  - @conciv/extension-ios@0.0.17
  - @conciv/ui-kit-chat-tools@0.0.17
  - @conciv/client@0.0.17
  - @conciv/contract@0.0.17
  - @conciv/extension@0.0.17
  - @conciv/grab@0.0.17
  - @conciv/mascot@0.0.17
  - @conciv/protocol@0.0.17
  - @conciv/solid-diffs@0.0.17
  - @conciv/solid-streamdown@0.0.17
  - @conciv/storage-history@0.0.17
  - @conciv/ui-kit-system@0.0.17

## 0.0.16

### Patch Changes

- [#143](https://github.com/conciv-dev/conciv/pull/143) [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e) Thanks [@omridevk](https://github.com/omridevk)! - Add the widget-side seams that let the embedded widget behave as a native host: a host-level
  `grabProvider` on `ConcivInit` (threaded to `makePaneGrabApi`, with `grabbable` reaching the composer
  for a capability-driven disabled state), a `launcher: 'native' | 'mascot' | false` settings field that
  gates the mascot FAB and reports `mascotRect`, programmatic `open()`/`close()`/`toggle()` handle methods
  over `conciv:open-panel`/`conciv:close-panel`/`conciv:toggle-panel` events with a `bootNormal`-tolerant
  open, and a public `handle.rebind(apiBase)` (plus `conciv:rebind` event) that re-points RPC/SSE on
  same-core port drift while preserving nav/session state.

- [#144](https://github.com/conciv-dev/conciv/pull/144) [`1019e21`](https://github.com/conciv-dev/conciv/commit/1019e213fc99b84d0931a50cffa2cd602fd31e0e) Thanks [@omridevk](https://github.com/omridevk)! - Make the widget panel usable at phone widths. Below a 520px viewport the floating modal now becomes a full-bleed sheet (`inset-0`, edge to edge) instead of a small clipped card, driven by a reactive media query so the stored `conciv-modal-width`/`-height` prefs and resize handles no longer fight the breakpoint. The sheet pads with `env(safe-area-inset-*)` via a new `pad-safe` preset shortcut so the header and composer clear the notch, status bar, and home indicator when the native page runs under `viewport-fit=cover`. Long inline code tokens now wrap (`overflow-wrap: anywhere` in the typography preset) instead of clipping, and code blocks keep their own horizontal scroll, so tool cards, code blocks, and the composer produce no horizontal overflow at 320/375/393/430px in both light and dark. While the full-screen sheet is open the launcher mascot is hidden so it no longer covers the composer; the panel is closed via its header control.

- [#141](https://github.com/conciv-dev/conciv/pull/141) [`aa06a88`](https://github.com/conciv-dev/conciv/commit/aa06a88067430bd97934f4abb0b096bfdf1812f4) Thanks [@omridevk](https://github.com/omridevk)! - Render code and tool output through SolidCodeBlock instead of hand-rolled pre blocks, with explicit languages: plaintext for payloads, TypeScript for eval'd page code, and ANSI for terminal streams so command colors render natively.

- [#125](https://github.com/conciv-dev/conciv/pull/125) [`7627eba`](https://github.com/conciv-dev/conciv/commit/7627eba4ffaddd6e85289724759f41d75b5c2e7b) Thanks [@omridevk](https://github.com/omridevk)! - Stop the widget from scrolling the host page to the top. TanStack Router installs its scroll handler on every client router even with `scrollRestoration` unset, and `resetScroll` defaults to `true`, so every panel navigation ran `window.scrollTo(0, 0)` on the embedding page, so opening the widget yanked the host site back to the top. The widget router now opts out globally with `scrollRestoration: () => false`, which also covers the `history.back()` paths (Escape-close, quick-terminal close) that a per-navigation `resetScroll` cannot reach. The widget never relied on router scroll restoration: its own scrolling is element-level.

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e), [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e), [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e), [`af04b36`](https://github.com/conciv-dev/conciv/commit/af04b368a4b7bf2eecf3fb20f0b6c0949368ce1e), [`aa06a88`](https://github.com/conciv-dev/conciv/commit/aa06a88067430bd97934f4abb0b096bfdf1812f4), [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/extension@0.0.16
  - @conciv/protocol@0.0.16
  - @conciv/grab@0.0.16
  - @conciv/extension-ios@0.0.16
  - @conciv/ui-kit-chat@0.0.16
  - @conciv/ui-kit-chat-tools@0.0.16
  - @conciv/client@0.0.16
  - @conciv/contract@0.0.16
  - @conciv/mascot@0.0.16
  - @conciv/solid-diffs@0.0.16
  - @conciv/solid-streamdown@0.0.16
  - @conciv/storage-history@0.0.16
  - @conciv/ui-kit-system@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/client@0.0.15
  - @conciv/contract@0.0.15
  - @conciv/extension@0.0.15
  - @conciv/grab@0.0.15
  - @conciv/mascot@0.0.15
  - @conciv/protocol@0.0.15
  - @conciv/solid-streamdown@0.0.15
  - @conciv/storage-history@0.0.15
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
  - @conciv/protocol@0.0.14
  - @conciv/solid-streamdown@0.0.14
  - @conciv/storage-history@0.0.14
  - @conciv/ui-kit-system@0.0.14

## 0.0.13

### Patch Changes

- [#84](https://github.com/conciv-dev/conciv/pull/84) [`5db2ac5`](https://github.com/conciv-dev/conciv/commit/5db2ac5a8e7d49f2966cbbaf6718483f5837f759) Thanks [@omridevk](https://github.com/omridevk)! - Corrective release: several 0.0.12 artifacts (embed, extension-terminal, react, preact, solid, and others) were published from an unbuilt workspace and are empty or stale; 0.0.13 republishes every package from a clean CI build.

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13
  - @conciv/client@0.0.13
  - @conciv/contract@0.0.13
  - @conciv/extension@0.0.13
  - @conciv/ui-kit-chat@0.0.13
  - @conciv/ui-kit-chat-tools@0.0.13
  - @conciv/grab@0.0.13
  - @conciv/mascot@0.0.13
  - @conciv/solid-streamdown@0.0.13
  - @conciv/storage-history@0.0.13
  - @conciv/ui-kit-system@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/client@0.0.12
  - @conciv/contract@0.0.12
  - @conciv/extension@0.0.12
  - @conciv/grab@0.0.12
  - @conciv/mascot@0.0.12
  - @conciv/protocol@0.0.12
  - @conciv/solid-streamdown@0.0.12
  - @conciv/storage-history@0.0.12
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
  - @conciv/protocol@0.0.11
  - @conciv/storage-history@0.0.11
  - @conciv/ui-kit-system@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/client@0.0.10
  - @conciv/contract@0.0.10
  - @conciv/extension@0.0.10
  - @conciv/grab@0.0.10
  - @conciv/mascot@0.0.10
  - @conciv/protocol@0.0.10
  - @conciv/solid-streamdown@0.0.10
  - @conciv/storage-history@0.0.10
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
  - @conciv/protocol@0.0.9
  - @conciv/solid-streamdown@0.0.9
  - @conciv/storage-history@0.0.9
  - @conciv/ui-kit-chat@0.0.9
  - @conciv/ui-kit-chat-tools@0.0.9
  - @conciv/ui-kit-system@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies [[`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf)]:
  - @conciv/contract@0.0.8
  - @conciv/client@0.0.8
  - @conciv/extension@0.0.8
  - @conciv/ui-kit-chat-tools@0.0.8
  - @conciv/grab@0.0.8
  - @conciv/mascot@0.0.8
  - @conciv/protocol@0.0.8
  - @conciv/solid-streamdown@0.0.8
  - @conciv/storage-history@0.0.8
  - @conciv/ui-kit-chat@0.0.8
  - @conciv/ui-kit-system@0.0.8
