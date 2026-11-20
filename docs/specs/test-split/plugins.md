# Test split: plugins group

Every test that lived in the plugin packages at `9d4f4834f`, the last commit with every old test:
packages/plugins/page (page.browser.test.tsx and page.test.ts), packages/plugins/ios, recorder, tanstack, test-runner,
try-it and whiteboard, plus the page card stories. Four kinds of rows cite tests that were already gone by `9d4f4834f`;
each says so and names the commit that removed it:

- the tanstack and recorder card tests;
- the terminal resume test;
- the whiteboard card stories.

plugin-testkit.test.ts was deleted in `9d4f4834f` itself.

Rules this plan follows (`docs/specs/test-rewrite-after-port.md`):

- Line numbers are lines at `9d4f4834f`.
- Destinations name today's runners:
  - `node`: `src/x.test.ts` with `createEngine`;
  - `node (table)`: an `it.each` table in a `src/x.test.ts`;
  - `happy-dom`: `src/<package>.dom.test.tsx` with `createEngine` + `mount`;
  - `browser mode`: one `src/<package>.browser.test.tsx` per package, only for layout, scrolling, canvas and real focus;
  - `e2e`;
  - `story`: a `*.stories.tsx` play.
- `DELETE-DUP` and `DELETE-COVERED` name the test that keeps the behaviour. `DELETE-NOTHING` deletes a test that proves
  nothing a user sees. `not carried` gives the reason. `FIXTURE` marks an input app a test runs, not a test.
- The kit is `createEngine({plugins, replies, settings, files, permission, log})`, `mount({engine, seed: {storage}, route})`
  and `createHarnessEngine`. A plugin tool is called with `engine.session.tool(name).call(input)`.
- Ruled out, so no row leans on them:
  - connection faults and proxies;
  - held or failed socket calls;
  - chat hold and release;
  - scripted tool-call replies;
  - the old `/flow`, `chat`, `pane`, `widget` and `fault` fixtures;
  - `expectLog`;
  - mocks.
- A row whose target is `src/index.test.ts` tests through the package entry. When a row's subject is one source file, the
  writer puts it beside that file instead.

## Group totals

Counted from the rows. An `(xN)` site counts as N. whiteboard.browser.test.ts counts its 26 parts: 25 segments of three
long tests, plus the background test. The 3 rows added on 2026-11-20 are counted.

| destination    | count |
| -------------- | ----- |
| node           | 97    |
| node (table)   | 93    |
| happy-dom      | 51    |
| browser mode   | 108   |
| story          | 94    |
| FIXTURE        | 9     |
| DELETE-DUP     | 12    |
| DELETE-COVERED | 1     |
| DELETE-NOTHING | 2     |
| not carried    | 17    |
| total          | 484   |

Per old file:

| old file at 9d4f4834f                                                            | rows | goes to                                                                              |
| -------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------ |
| packages/plugins/page/test/page.browser.test.tsx, lines 1300 to 3642             | 114  | browser mode 47, story 31, happy-dom 23, node (table) 8, DELETE-DUP 3, not carried 2 |
| packages/plugins/page/src/*.stories.tsx (10 files)                               | 41   | story 41, unchanged                                                                  |
| whiteboard card stories (4 files, removed by 2574b0acb)                          | 21   | story 21, in packages/plugins/whiteboard/src/cards.stories.tsx                       |
| packages/plugins/page/test/page.browser.test.tsx, lines 1 to 1299                | 58   | browser mode 30, happy-dom 21, DELETE-DUP 6, DELETE-COVERED 1                        |
| packages/plugins/page/test/page.test.ts                                          | 40   | node (table) 30, node 10                                                             |
| packages/plugin-testkit/test/plugin-testkit.test.ts (deleted in 9d4f4834f)       | 14   | not carried 14                                                                       |
| packages/plugins/ios/test/ios.test.ts                                            | 50   | node (table) 30, node 19, DELETE-NOTHING 1                                           |
| packages/plugins/recorder/test/recorder.test.ts                                  | 36   | node 28, node (table) 7, DELETE-NOTHING 1                                            |
| packages/plugins/recorder/test/recorder.it.test.ts                               | 11   | browser mode 8, node 2, happy-dom 1                                                  |
| packages/plugins/tanstack/test/tanstack.test.ts                                  | 10   | node 10                                                                              |
| packages/plugins/tanstack/test/tanstack.browser.test.ts                          | 1    | browser mode 1                                                                       |
| packages/plugins/test-runner/test/test-runner.test.ts                            | 10   | node 5, node (table) 5                                                               |
| packages/plugins/test-runner/test/test-runner.browser.test.ts                    | 4    | happy-dom 3, node (table) 1                                                          |
| packages/plugins/test-runner/test/fixtures/**                                    | 9    | FIXTURE 9                                                                            |
| packages/plugins/try-it/test/try-it.test.ts                                      | 17   | node 8, node (table) 8, DELETE-DUP 1                                                 |
| packages/plugins/try-it/test/try-it.browser.test.ts                              | 3    | happy-dom 2, browser mode 1                                                          |
| packages/plugins/whiteboard/test/whiteboard.test.ts and src/canvas-tools.test.ts | 19   | node 15, node (table) 4                                                              |
| packages/plugins/whiteboard/test/whiteboard.browser.test.ts                      | 26   | browser mode 21, DELETE-DUP 2, story 1, happy-dom 1, not carried 1                   |

Files each package ends with (no `test/` folders):

- `@conciv/plugin-page` (packages/plugins/page):
  - `src/page.browser.test.tsx` for layout, act verbs, capture, simulator and queue;
  - `src/page.dom.test.tsx` for read, edit-live, react, effect and tab journeys and the DOM tables;
  - `src/*.test.ts` beside `rpc.ts`, `tools.ts`, `machine.ts`, `queue.ts`, `files.ts`, `symbolicate.ts`,
    `operations.ts`, `open-source.ts` and `cards.tsx`;
  - its card stories.
- `@conciv/plugin-ios`, `plugin-recorder`, `plugin-tanstack`, `plugin-test-runner`, `plugin-try-it`,
  `plugin-whiteboard`: `src/*.test.ts` beside the code each row names. A `src/<package>.dom.test.tsx` only where a row
  says happy-dom, and a `src/<package>.browser.test.tsx` only where a row says browser mode.
- Stories that leave a deleted test: `packages/ui-kit-system` ZoomableImage, `packages/plugins/tanstack/src/plugin-experimental.stories.tsx`,
  `packages/plugins/recorder/src/recording-card.stories.tsx`, `packages/plugins/whiteboard/src/cards.stories.tsx` and
  `overlay.stories.tsx`.

## Main happy-dom blockers (group-wide)

- Every page act verb refuses a zero-size box (`actionable()` in packages/plugins/page/src/act.ts). happy-dom gives every
  box zero size, so these stay in browser mode: act verbs, rich-text editors, the simulator, and capture after a fill.
  `snapshot`'s hidden flag reads `offsetParent`, which is layout.
- Capture needs the real CSSOM and canvas.
- The whiteboard comment layer (pins, thread, inbox, drift prompt) renders inside the Excalidraw canvas, so the inbox
  sort, filter and search stay in browser mode though they look like they could move.
- Suspected, to confirm when the rows are written: tiptap mention field, Ark/zag focus gating, Ark collapsible tab order
  in the test-runner card, clipboard in the try-it connect pane.

## Open points

- `src/page.dom.test.tsx` takes 44 rows. If it passes the 1,000-line cap, the DOM tables move beside their sources
  (`snapshot.ts`, `grab.ts`, `react.ts`).
- The whiteboard card stories import the page card story fixtures (`packages/plugins/page/src/story.fixtures.tsx`); they
  need an export from the page plugin or a copy.
- Rule breaks to fix in the rewrite: recorder.test:513 waits out the real 5 s start timeout in its start-without-a-page step
  (make it an option); recorder.test.ts:948 reads the process table with `ps`.

---

## page.browser.test.tsx lines 1300 to 3642 (formerly builtin-plugins.browser.test.tsx)

114 rows. At `9d4f4834f` these tests sit in packages/plugins/page/test/page.browser.test.tsx from line 1300 on, and every
row cites that line. Three rows (2582 tanstack cards, 2674 recorder cards, terminal resume) cite tests that were already
removed; each names its commit.

Key fact for the split: every act verb goes through `actionable()` in packages/plugins/page/src/act.ts, which refuses an
element whose `getBoundingClientRect()` is 0 by 0. The act verbs are click, hover, fill, fill_form, select, check, uncheck
and press with a target. happy-dom has no layout and returns 0 by 0 for everything, so every act verb answers "That element
is not visible." there. Act verbs and everything built on them are browser mode: the simulator, the queue, and captures
after a fill.

These touch no layout and go to happy-dom:

- read verbs: route, exists, query, dom, attr, value;
- edit-live verbs: setattr, removeattr, addclass, removeclass, setstyle, settext, insert, remove, sethtml, css;
- eval, react verbs and effects.

`snapshot` reads rects, offsetParent and computed style, so snapshot-based rows are browser mode.

### 1. Every test

| test (file:line, short title)                                                                                                                                                       | destination  | target                                                                                                    | merge-id           | why                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1326 effects: lists what exists once per name                                                                                                                                       | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-EFFECT           | effect list needs no layout; one call at the top of the effect journey                                                                                        |
| 1332 effects: enable, toggle, start, stop change the page, report tells the truth                                                                                                   | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-EFFECT           | banner appears and goes, read by role; no layout                                                                                                              |
| 1345 effects: unknown effect fails naming what exists                                                                                                                               | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-EFFECT-ERR       | error text through the tool call                                                                                                                              |
| 1352 effects: driving action without a name, or list with one, is invalid args                                                                                                      | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-EFFECT-ERR       | two more failing calls in the same error step                                                                                                                 |
| 1420 target resolution: each way a target can be missing                                                                                                                            | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-READ             | fails before the visibility gate; pure lookup messages                                                                                                        |
| 1434 dom verbs: clicks through React handlers                                                                                                                                       | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-ACT              | layout: click goes through the visibility gate                                                                                                                |
| 1439 dom verbs: fills fields, masks a password value                                                                                                                                | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-ACT              | layout: fill goes through the visibility gate                                                                                                                 |
| 1450 dom verbs: masks a password value attribute in dom and attr reads                                                                                                              | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-READ             | setattr/attr/dom only; drop the `document.querySelector` read at 268                                                                                          |
| 1461 dom verbs: React-controlled checkboxes and radios follow                                                                                                                       | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-ACT              | layout: check/uncheck go through the visibility gate                                                                                                          |
| 1484 dom verbs: mutates attributes, classes, styles, text, structure                                                                                                                | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-EDIT             | edit-live verbs need no layout; read back through attr/dom/exists instead of querySelector                                                                    |
| 1504 dom verbs: route, exists, query, markup, attributes                                                                                                                            | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-READ             | read verbs; replace the shared-fixture `count 8` with a count of its own fixture                                                                              |
| 1521 dom verbs: waits for visibility, times out, abort ends the wait                                                                                                                | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-ACT              | layout: `state: 'visible'` is a geometry check                                                                                                                |
| 1544 dom verbs: eval of a bare expression and a statement body                                                                                                                      | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-READ             | eval needs no layout                                                                                                                                          |
| 1552 dom verbs: refuses a result over 512000 JSON characters                                                                                                                        | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-READ             | the cap is on the reply; drive it with an eval that returns a large value, since snapshot reads layout                                                        |
| 1572 dom verbs: clamps a long handler error to the reply bound                                                                                                                      | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-READ             | eval throw; no layout                                                                                                                                         |
| 1582 dom verbs: injects css stylesheets                                                                                                                                             | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-EDIT             | one more edit-live verb                                                                                                                                       |
| 1589 react verbs: find, locate, tree, inspect, path                                                                                                                                 | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-REACT            | React fibers render in happy-dom; no layout                                                                                                                   |
| 1609 react verbs: override validates input and sets state                                                                                                                           | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-REACT            | no layout                                                                                                                                                     |
| 1620 react verbs: tracks renders between start and stop                                                                                                                             | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-REACT            | trigger the re-render with `override`, not `click` (click needs layout); also removes the order dependence on 1434                                            |
| 1637 act: select by value or label, missing option changes nothing                                                                                                                  | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-ACT              | layout: select goes through the visibility gate                                                                                                               |
| 1654 act: fill_form field by field, stops at first refusal, abort mid-form                                                                                                          | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-ACT              | layout: fill_form uses act verbs                                                                                                                              |
| 1697 act: fails instead of ok when a field or box refuses                                                                                                                           | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-ACT              | layout: fill/check through the visibility gate                                                                                                                |
| 1720 act: submits the owning form without navigating                                                                                                                                | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-ACT              | submit itself needs no layout but sits on the same form journey; one call after fill_form                                                                     |
| 1730 act: presses keys so page shortcuts fire                                                                                                                                       | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-ACT              | layout: press with a target uses the visibility gate; real key events                                                                                         |
| 1757 act: reaches into open shadow roots, never the widget's                                                                                                                        | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-ACT              | layout: click and snapshot read geometry                                                                                                                      |
| 1789 act: hovers with bubbling mouseover and mouseenter                                                                                                                             | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-ACT              | layout: hover goes through the visibility gate                                                                                                                |
| 1797 act: scrolls a far-away element into view                                                                                                                                      | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-FAR              | real scrolling; folds into 1998                                                                                                                               |
| 1812 act: replaces inner HTML with sethtml                                                                                                                                          | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-EDIT             | edit-live verb                                                                                                                                                |
| 1821 a change the app undoes in a microtask or task is refused, a kept one made                                                                                                     | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-ACT              | layout: fill/check/select through the visibility gate                                                                                                         |
| 1900 rich text: plain contenteditable via nested target, plaintext-only                                                                                                             | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-RICHTEXT         | layout gate, plus contenteditable selection and editing                                                                                                       |
| 1917 rich text: falls back to editing commands when beforeinput is cancelled                                                                                                        | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-RICHTEXT         | execCommand does not exist in happy-dom                                                                                                                       |
| 1931 rich text: refuses read-only editors                                                                                                                                           | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-RICHTEXT         | layout gate on fill                                                                                                                                           |
| 1943 rich text: editor that ignores every way of typing, masked                                                                                                                     | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-RICHTEXT         | beforeinput plus execCommand fallback, real editing                                                                                                           |
| 1965 rich text: refuses CodeMirror and Monaco                                                                                                                                       | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-RICHTEXT         | layout gate on fill                                                                                                                                           |
| 1979 rich text: types into a real Tiptap editor                                                                                                                                     | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-RICHTEXT         | ProseMirror needs real selection and contenteditable                                                                                                          |
| 1998 far-away targets: fill, check, click scroll each into view                                                                                                                     | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-FAR              | real scrolling, `toBeInViewport`                                                                                                                              |
| 2042 refs: a ref from an earlier snapshot fails as stale                                                                                                                            | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-ACT              | layout: snapshot and fill read geometry                                                                                                                       |
| 2094 screenshot: viewport webp the size of the window                                                                                                                               | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-SHOT             | canvas and real rendering                                                                                                                                     |
| 2102 screenshot: widget host, overlay and toast left out                                                                                                                            | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-SHOT             | canvas pixel sample                                                                                                                                           |
| 2122 screenshot: caller-named elements left out, bad selector warned                                                                                                                | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-SHOT             | canvas pixel sample; one more shot in 2102                                                                                                                    |
| 2148 page_hmr: not applied when no update lands in time                                                                                                                             | node (table) | packages/plugins/page/src/operations.test.ts (`watchHotUpdates`)                                          | M-HMR              | in tests there is no hot surface, so this is the same outcome as 2152; one table row                                                                          |
| 2152 page_hmr: no hot surface is unsupported                                                                                                                                        | node (table) | packages/plugins/page/src/operations.test.ts (`watchHotUpdates`)                                          | M-HMR              | pure `watchHotUpdates(undefined)`                                                                                                                             |
| 2161 page_hmr: waits for an update already in flight                                                                                                                                | node (table) | packages/plugins/page/src/operations.test.ts (`watchHotUpdates`)                                          | M-HMR              | pure, fake hot surface; use fake timers, drop the `waitedMs >= 30` guess                                                                                      |
| 2174 page_hmr: resolves once a pending update is applied                                                                                                                            | node (table) | packages/plugins/page/src/operations.test.ts (`watchHotUpdates`)                                          | M-HMR              | same sequence as 2161 without the stale update; one row                                                                                                       |
| 2186 page_hmr: reports the error when the update fails to build                                                                                                                     | node (table) | packages/plugins/page/src/operations.test.ts (`watchHotUpdates`)                                          | M-HMR              | pure                                                                                                                                                          |
| 2195 page_hmr: gives up when the pending update never lands                                                                                                                         | node (table) | packages/plugins/page/src/operations.test.ts (`watchHotUpdates`)                                          | M-HMR              | pure; fake timers                                                                                                                                             |
| 2223 a page call carries its capture: css once, shared before/after, payment field out                                                                                              | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-CAPTURE          | layout: fill gate, and snapdom needs real computed style                                                                                                      |
| 2274 page console: since is inclusive                                                                                                                                               | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-CONSOLE          | console buffer needs no layout                                                                                                                                |
| 2285 page console: records uncaught and unhandled with location                                                                                                                     | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-CONSOLE          | built bundle in a host page: window `unhandledrejection` and uncaught timer errors only fire as a real page throws them                                       |
| 2307 Alt inspects until released or Esc, not while typing                                                                                                                           | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-INSPECT          | keyboard plus a status hint; drop the `document.activeElement` precondition read                                                                              |
| 2339 Alt over a plugin overlay picks the page element under it                                                                                                                      | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-INSPECT          | layout: hit testing under fixed-position elements                                                                                                             |
| 2373 opening an element's source: opened, symbolicated, no-source, failed                                                                                                           | node (table) | packages/plugins/page/src/open-source.test.ts                                                             | -                  | pure Effect logic over a fake opener; one it.each row per outcome                                                                                             |
| 2443 capture keeps one-line link text on one line                                                                                                                                   | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-SHOT             | real layout and canvas, Firefox regression                                                                                                                    |
| 2459 capture keeps a wrapping paragraph wrapped                                                                                                                                     | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-SHOT             | real layout and canvas, Firefox regression                                                                                                                    |
| 2518 agent acts like a person: menu, focus, mask, two-click stop, refusals, remount                                                                                                 | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-SIM              | real focus and layout (mask hit, visibility gate)                                                                                                             |
| 2614 cursor: an aim replaced by a newer one settles                                                                                                                                 | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-CURSOR           | layout: cursor geometry and Web Animations                                                                                                                    |
| 2621 cursor: an aim whose cursor is dropped settles                                                                                                                                 | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-CURSOR           | same fixture, two lines                                                                                                                                       |
| 2628 cursor: an aim off screen settles at once                                                                                                                                      | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-CURSOR           | same fixture, one line                                                                                                                                        |
| 2649 after dispose a page scroll no longer re-lays-out the cursor                                                                                                                   | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | -                  | real scrolling                                                                                                                                                |
| 2690 dispose leaves a later console wrapper in place                                                                                                                                | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-CONSOLE          | no DOM; unmount the plugin and check console.info                                                                                                             |
| 2793 queue: answers at once, plays fill, check, press in order                                                                                                                      | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-QUEUE            | layout: queued actions are act verbs                                                                                                                          |
| 2814 queue: a missing target and a read-only field fail alone, rest play                                                                                                            | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-QUEUE            | act verbs                                                                                                                                                     |
| 2827 queue: queue_async answers at once, mask down when done                                                                                                                        | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-QUEUE            | act verbs plus mask                                                                                                                                           |
| 2838 queue: a queued fill types into a contenteditable                                                                                                                              | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-QUEUE            | one more action in 2793's list                                                                                                                                |
| 2849 queue: cut off by an unmount does not keep a later mount's mask                                                                                                                | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-QUEUE            | the covering conciv.browser:12697 is deleted and app.md has no row for it; a real unmount mid-queue in the page queue journey                                 |
| 2867 queue: a session switch mid-queue lands nothing more                                                                                                                           | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-QUEUE            | covering conciv.browser:12713 deleted, no app.md row; a real session switch mid-queue in the same journey                                                     |
| 2882 queue: acceptance never reached the engine plays nothing                                                                                                                       | not carried  | -                                                                                                         | -                  | an acceptance that never reached the engine needs a garbled or lost reply, a socket fault the rules forbid                                                    |
| 2893 queue: a session switch while a fill waits on the editor does not type                                                                                                         | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-QUEUE            | covering conciv.browser:12749 deleted, no app.md row; the session switch while a fill waits joins 2867                                                        |
| 2905 queue: a fill the engine cancels while waiting stops, next queue plays alone                                                                                                   | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-QUEUE            | act verbs; engine cancel only here                                                                                                                            |
| 2919 queue: masks a card number in the result                                                                                                                                       | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-QUEUE            | add the card field to 2793's list                                                                                                                             |
| 2927 queue: two clicks on the mask stop the queue                                                                                                                                   | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-QUEUE            | real pointer clicks on the mask                                                                                                                               |
| 2947 queue: still finishes under reduced motion                                                                                                                                     | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-QUEUE            | real media emulation (Playwright `emulateMedia`)                                                                                                              |
| 2960 contract: Page.toast shows, capture excludes conciv                                                                                                                            | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-SHOT             | canvas pixel sample of a snapdom capture                                                                                                                      |
| 3008 contract: ReactTree reads, names, locates, dehydrates                                                                                                                          | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-REACT            | fibers only; no layout                                                                                                                                        |
| 3031 contract: Page.pick returns source and box, null on Escape                                                                                                                     | browser mode | packages/plugins/page/src/page.browser.test.tsx                                                           | M-INSPECT          | layout: the box is a real rect and picking hit-tests; drop the `picking()` poll                                                                               |
| 3054 every page tool has a card, route card renders                                                                                                                                 | node (table) | packages/plugins/page/src/cards.test.ts (the card registry in cards.tsx)                                  | -                  | registry completeness is a list compare; the route card render is already read-value-card.stories.tsx:41 RouteObject                                          |
| 3069 act card: zero-input call shows title, nothing to open                                                                                                                         | story        | packages/plugins/page/src/act-card.stories.tsx                                                            | M-ACTCARD          | one card state                                                                                                                                                |
| 3075 act card: shows input while running with no result                                                                                                                             | story        | packages/plugins/page/src/act-card.stories.tsx                                                            | M-ACTCARD          | one card state (running)                                                                                                                                      |
| 3087 act card: error-only result opens on the error                                                                                                                                 | story        | packages/plugins/page/src/act-card.stories.tsx                                                            | M-ACTCARD          | one card state plus a click                                                                                                                                   |
| 3100 console card: error mark when the page threw                                                                                                                                   | story        | packages/plugins/page/src/console-card.stories.tsx                                                        | -                  | one card state                                                                                                                                                |
| 3120 read-value card: element as subtitle, raw selector key dropped                                                                                                                 | story        | packages/plugins/page/src/read-value-card.stories.tsx                                                     | M-CHIPS            | one card state                                                                                                                                                |
| 3130 read-value card: root array as a JSON tree                                                                                                                                     | DELETE-DUP   | packages/plugins/page/src/read-value-card.stories.tsx:24 RootArray                                        | -                  | the story opens the card and sees the tree and both items                                                                                                     |
| 3140 read-bulk card: element as subtitle, other input kept                                                                                                                          | story        | packages/plugins/page/src/read-bulk-card.stories.tsx                                                      | M-CHIPS            | one card state                                                                                                                                                |
| 3150 react card: element as subtitle, other input kept                                                                                                                              | story        | packages/plugins/page/src/react-card.stories.tsx                                                          | M-CHIPS            | one card state                                                                                                                                                |
| 3175 screenshot result shows the picture, not a base64 tree                                                                                                                         | story        | packages/plugins/page/src/read-value-card.stories.tsx (a screenshot story)                                | -                  | one card state                                                                                                                                                |
| 3195 viewer: clicking the thumbnail opens the full image                                                                                                                            | story        | packages/ui-kit-system ZoomableImage story                                                                | M-VIEWER           | the covering ui-kit-chat composer.browser:323 is deleted; the click that opens the full image joins the viewer story play                                     |
| 3205 viewer: Escape closes, visible focus back on thumbnail                                                                                                                         | story        | packages/ui-kit-system ZoomableImage story                                                                | M-VIEWER           | covering composer.browser:334 deleted; Escape and focus back on the thumbnail join the same play (real focus in Storybook)                                    |
| 3219 viewer: Enter on the focused thumbnail opens it                                                                                                                                | story        | packages/ui-kit-system ZoomableImage story                                                                | M-VIEWER           | one kit component's keyboard interaction; real focus is fine in the Storybook Chromium run                                                                    |
| 3230 viewer: close button closes it                                                                                                                                                 | story        | packages/ui-kit-system ZoomableImage story                                                                | M-VIEWER           | one more step of 3219                                                                                                                                         |
| 3239 viewer: click toggles actual size, reopening starts fitted                                                                                                                     | story        | packages/ui-kit-system ZoomableImage story                                                                | M-VIEWER           | toggle is composer.browser:323; "reopen starts fitted" is new and joins the play                                                                              |
| 3254 viewer: an image that cannot load says so                                                                                                                                      | story        | packages/ui-kit-system ZoomableImage story                                                                | M-VIEWER-BROKEN    | one component state                                                                                                                                           |
| 3261 viewer: a failed image recovers when its source changes                                                                                                                        | story        | packages/ui-kit-system ZoomableImage story                                                                | M-VIEWER-BROKEN    | same story, source arg changes                                                                                                                                |
| 3338 session card: streamed appends keep existing rows mounted                                                                                                                      | story        | packages/plugins/page/src/session-card.stories.tsx                                                        | M-SESSION-STREAM   | ruled out: the scripted chat streaming page_fill calls is a scripted tool-call reply; a story play steps the streamed card states and checks the rows stay    |
| 3358 session card: form fill step label while running and done                                                                                                                      | story        | packages/plugins/page/src/session-card.stories.tsx                                                        | M-SESSION-STREAM   | same play: the form fill step label running, then done                                                                                                        |
| 3381 session card: streaming act outside shorthand verbs reads as running                                                                                                           | story        | packages/plugins/page/src/session-card.stories.tsx Streaming                                              | -                  | one static streaming state                                                                                                                                    |
| 3396 session card: settled shows folded reasoning and script, collapsed                                                                                                             | story        | packages/plugins/page/src/session-card.stories.tsx                                                        | M-SESSION-SETTLED  | one state plus a click                                                                                                                                        |
| 3413 session card: expanded shows step rail without its own input row                                                                                                               | story        | packages/plugins/page/src/session-card.stories.tsx                                                        | M-SESSION-SETTLED  | same mount                                                                                                                                                    |
| 3423 session card: only error is the folded script run reports error                                                                                                                | story        | packages/plugins/page/src/session-card.stories.tsx                                                        | -                  | WithError (215) covers a step error, not a folded-script-only error; new story                                                                                |
| 3438 session card: settled without route result shows no location pill                                                                                                              | story        | packages/plugins/page/src/session-card.stories.tsx                                                        | M-SESSION-LOCATION | one state; assert by text, not body.textContent                                                                                                               |
| 3451 session card: script step reads its first code line, no duplicate pill                                                                                                         | DELETE-DUP   | packages/plugins/page/src/session-card.stories.tsx:255 Scripted                                           | -                  | the story checks the code line and no stray "script" text                                                                                                     |
| 3464 session card: streaming without route shows current location                                                                                                                   | story        | packages/plugins/page/src/session-card.stories.tsx                                                        | M-SESSION-LOCATION | the other side of 3438                                                                                                                                        |
| 3488 grab card: shows snapshot and source label                                                                                                                                     | story        | packages/plugins/page/src/grab-card.stories.tsx GrabbedElement (46)                                       | M-GRAB             | extend that play with the snapshot title and source label                                                                                                     |
| 3495 grab card: click opens a dialog that reveals the agent text                                                                                                                    | story        | packages/plugins/page/src/grab-card.stories.tsx                                                           | M-GRAB             | one component interaction                                                                                                                                     |
| 3508 grab card: no preview falls back to the agent text                                                                                                                             | story        | packages/plugins/page/src/grab-card.stories.tsx                                                           | M-GRAB-PREVIEW     | one state                                                                                                                                                     |
| 3514 grab card: unreadable payload says so                                                                                                                                          | DELETE-DUP   | packages/plugins/page/src/grab-card.stories.tsx:69 UnreadablePayload                                      | -                  | same text, same state                                                                                                                                         |
| 3520 grab card: image preview renders as the snapshot image                                                                                                                         | story        | packages/plugins/page/src/grab-card.stories.tsx                                                           | M-GRAB-PREVIEW     | the other preview kind                                                                                                                                        |
| 3544 grab snapshot frame: renders in its own document                                                                                                                               | story        | packages/plugins/page/src/grab-card.stories.tsx (a snapshot frame story)                                  | M-GRAB-FRAME       | 3552 already renders the frame                                                                                                                                |
| 3552 grab snapshot frame: inline handlers never run in the widget                                                                                                                   | story        | packages/plugins/page/src/grab-card.stories.tsx (a snapshot frame story)                                  | M-GRAB-FRAME       | security; iframe sandbox needs the real Chromium the Storybook run uses, not happy-dom                                                                        |
| 2582 (at 86d94e743 only; removed by 38352bbc7, no test at 9d4f4834f) tanstack cards: every card on success, error, running, pending                                                 | story        | packages/plugins/tanstack/src/plugin-experimental.stories.tsx (the cards live in plugin-experimental.tsx) | -                  | card states; one story per case instead of one for loop that stops at the first broken card                                                                   |
| 2674 (at 86d94e743 only; removed by 74c08ec2e, no test at 9d4f4834f) recorder cards: pull window, start, failed stop, embedded summary                                              | story        | packages/plugins/recorder/src/recording-card.stories.tsx                                                  | -                  | card states                                                                                                                                                   |
| 3577 page tab: hides secret search, hash and router path values                                                                                                                     | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-TAB              | history API and a React router render in happy-dom; security                                                                                                  |
| 3617 page tab: long url and title fit the rpc caps                                                                                                                                  | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-TAB              | same readTab call                                                                                                                                             |
| 3626 page tab: reports again after pushState and a title change                                                                                                                     | happy-dom    | packages/plugins/page/src/page.dom.test.tsx                                                               | M-TAB              | pushState and title observer work in happy-dom                                                                                                                |
| terminal over the rpc socket: resumes after the last output shown (old builtin-plugins.browser.test.tsx:27, at 86d94e743 only; removed by 5c6a70239, no terminal test at 9d4f4834f) | not carried  | -                                                                                                         | -                  | resume after the stream ends needs the stream cut (a connection fault) or a fake rpc link (a stub); the terminal running a command is embed-flows embed.it:97 |

Count: 114 rows, 114 tests.

### 2. Totals and what the file becomes

| destination  | count | where                                                                                  |
| ------------ | ----- | -------------------------------------------------------------------------------------- |
| browser mode | 47    | packages/plugins/page/src/page.browser.test.tsx                                        |
| story        | 31    | page card stories, ui-kit-system ZoomableImage, the tanstack and recorder card stories |
| happy-dom    | 23    | packages/plugins/page/src/page.dom.test.tsx                                            |
| node (table) | 8     | packages/plugins/page/src/operations.test.ts, open-source.test.ts, cards.test.ts       |
| DELETE-DUP   | 3     | the page card story plays that already prove them                                      |
| not carried  | 2     | queue 2882 (needs a lost reply) and the terminal resume (needs a cut stream)           |
| total        | 114   |                                                                                        |

Why browser mode:

- layout through the act-verb visibility gate or snapshot (most rows);
- real scrolling (1797, 1998, 2649);
- canvas or pixel capture (2094, 2102, 2122, 2223, 2443, 2459, 2960);
- real focus and hit testing (2518, 2339, 3031);
- real page errors on the test page (2285);
- media emulation (2947).

Merge journeys:

- M-EFFECT / M-EFFECT-ERR: effect list, every action, report; then the two error paths.
- M-READ: target resolution, read verbs, password masking in attr/dom, eval, result cap, error clamp.
- M-EDIT: every edit-live verb, css and sethtml, read back through attr/dom/exists.
- M-REACT: find, locate, tree, inspect, override, track, and the ReactTree contract (3008).
- M-ACT: the agent drives a React form like a person: click, fill with password mask, check/radio, select, fill_form with stop, submit, press, hover, shadow roots, microtask undo honesty, wait, stale refs.
- M-RICHTEXT: every editor kind in one host (contenteditable, beforeinput fallback, read-only, stubborn, code editors, Tiptap).
- M-FAR: scroll and the act verbs on far-away controls.
- M-SHOT: screenshot size, exclusions, caller exclude, capture fidelity, toast contract capture.
- M-CAPTURE: capture css bundle shared and payment field masked.
- M-SIM / M-CURSOR / M-QUEUE: simulator journey; cursor aims settle; queue order, failures, async, editor fill, engine cancel, card mask, user stop, reduced motion, unmount and session switch mid-queue.
- M-INSPECT: Alt hint lifecycle in happy-dom; Alt over an overlay, pick, and the React source open in browser mode.
- M-CONSOLE: since boundary and dispose leaving console wrappers (happy-dom); uncaught and unhandled stay in browser mode.
- M-HMR: one `it.each` table of `watchHotUpdates`: unsupported, in flight, pending applied, build error, timeout.
- M-TAB: redaction, caps, change reports.
- M-SESSION-STREAM: one story play that steps the streamed session card.
- M-VIEWER: one ZoomableImage story play: open the full image, Escape, focus back on the thumbnail.
- card merges: act card states, chip subtitles, session card states, grab card states.

Owners: packages/plugins/page owns 104 rows (2882 among them, not carried). The rest:

- 2582 goes to packages/plugins/tanstack;
- 2674 goes to packages/plugins/recorder;
- the terminal row is not carried;
- the 5 viewer rows (3219-3261) and the 2 viewer rows (3195, 3205) go to ui-kit-system.

No row belongs to whiteboard or test-runner.

### 3. Cross-file duplicates

- 3130 = read-value-card.stories.tsx:24 RootArray; 3514 = grab-card.stories.tsx:69 UnreadablePayload; 3451 =
  session-card.stories.tsx:255 Scripted. These three rows are DELETE-DUP.
- 3488 overlaps grab-card.stories.tsx GrabbedElement; 3054's route-card part = read-value-card.stories.tsx:41 RouteObject.
- These rows overlap lines 1 to 1299 of the same file:
  - 3008 overlaps 1055;
  - 1609 overlaps 1099;
  - 1589 overlaps 1141 and 1162;
  - 3031 overlaps 1210 (merged as PICK);
  - 2223 overlaps 385 and 417.

  The lower lines are DELETE-DUP rows (section B, 1.2). One capture journey stays in `page.browser.test.tsx`.

- 3577 (tab redaction) is different code from tanstack.browser.test.ts:128 (tanstack's own location reading); not a
  duplicate.
- page.test.ts:590 (a queued action whose command never reached the page counts as lost) proves in node what 2882 proved
  through the page; 2882 is not carried, 590 stays.

### 4. Cannot move to happy-dom (though it looks like it could)

- Every act verb: `actionable()` needs a non-zero `getBoundingClientRect` and `checkVisibility`. happy-dom returns 0 by 0
  and may lack `checkVisibility`, so click, fill, check, select, press and hover all refuse. That keeps these in browser
  mode: 1434, 1439, 1461, 1637, 1654, 1697, 1720, 1730, 1789, 1821, the rich-text rows, the queue, the simulator and 2223.
- `snapshot` reads rects, offsetParent and computed style (packages/plugins/page/src/snapshot.ts), so 1757 and 2042 stay in
  browser mode; 1552 moves to happy-dom only if the cap is driven by eval instead of snapshot.
- `wait` with `state: 'visible'` (1521) is a geometry check.
- Rich text needs two things happy-dom lacks:
  - `document.execCommand`, which `simulator.ts` relies on;
  - a real selection inside contenteditable.

  Tiptap/ProseMirror needs both (1900-1979, 2838).

- Simulator and cursor need layout: `elementFromPoint`, `scrollIntoView`, cursor rects and animations (`simulator.ts`).
- Screenshot and captures need a real browser: canvas, `createImageBitmap`, `OffscreenCanvas`, and snapdom with real
  computed style and fonts (2094-2122, 2443, 2459, 2960, 2223).
- Page errors: happy-dom raises no window `unhandledrejection` for a rejected promise in Node, so 2285 stays in browser mode.
- Alt over an overlay (2339) and Page.pick (3031) hit-test under fixed-position elements.
- Grab snapshot frame (3544, 3552): the iframe sandbox and `onerror` on a broken image in srcdoc only behave like a browser
  in a browser; a story play in Storybook's Chromium.
- 2307 (Alt hint) stays in happy-dom only if the "not while typing in a textbox" check works on happy-dom's
  `activeElement`; otherwise it moves to browser mode.
- Order dependence to drop in the rewrite:
  - 1620 needed 1434's click;
  - 1504 counted 8 inputs of the shared fixture;
  - 1797 assumed `scrollY === 0`;
  - listeners at 1637, 1697, 1720 and 1789 were never removed.

---

## Section B: page card stories, whiteboard card stories, page.browser lines 1 to 1299, page.test.ts, plugin-testkit.test.ts

Line numbers are the `it`/`test`/story export line at `9d4f4834f`. For the whiteboard stories, they are the lines at
86d94e743, the last commit that had those stories.

### 1. Per test file

#### 1.1 Card stories (10 page files at 9d4f4834f, 4 whiteboard files removed by 2574b0acb)

Every story stays a story. Storybook runs every story as a render test; a play adds asserts. The page card stories stay in
packages/plugins/page/src. The whiteboard cards now live in packages/plugins/whiteboard/src/cards.tsx and are drawn
through `ctx.ui`; their 21 stories are written again as `packages/plugins/whiteboard/src/cards.stories.tsx`.

##### whiteboard/element-card.stories.tsx (2 stories, 0 plays)

| test                                                                                    | destination | target                                            | merge-id | why                                        |
| --------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------- | -------- | ------------------------------------------ |
| :10 Found (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f)    | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | visual state of the element reference card |
| :23 NotFound (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f) | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | failed state                               |

##### whiteboard/anchor-card.stories.tsx (3 stories, 0 plays)

| test                                                                                    | destination | target                                            | merge-id | why                          |
| --------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------- | -------- | ---------------------------- |
| :10 Fresh (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f)    | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | anchor resolve fresh         |
| :15 Drifted (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f)  | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | drift with before/after diff |
| :31 NotFound (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f) | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | failed call                  |

##### whiteboard/canvas-card.stories.tsx (9 stories, 0 plays)

| test                                                                                           | destination | target                                            | merge-id | why                  |
| ---------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------- | -------- | -------------------- |
| :13 Read (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f)            | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | canvas read result   |
| :34 Svg (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f)             | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | svg op               |
| :52 Diagram (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f)         | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | diagram op           |
| :65 PreviewImage (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f)    | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | png preview          |
| :77 PreviewEmpty (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f)    | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | empty preview        |
| :84 DeleteConfirmed (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f) | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | delete confirmed     |
| :91 CommitFailed (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f)    | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | commit failure state |
| :98 ExportFailed (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f)    | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | export failure state |
| :111 RunningOp (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f)      | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | running row          |

##### whiteboard/comment-card.stories.tsx (7 stories, 0 plays)

| test                                                                                            | destination | target                                            | merge-id | why                    |
| ----------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------- | -------- | ---------------------- |
| :12 CreatePreview (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f)    | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | comment create preview |
| :34 ListResults (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f)      | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | list results           |
| :67 ReadThread (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f)       | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | thread read            |
| :99 ResolveConfirmed (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f) | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | resolve confirmed      |
| :106 DeleteConfirmed (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f) | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | delete confirmed       |
| :113 PinLocked (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f)       | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | locked pin             |
| :122 NotFound (no play) (at 86d94e743 only; removed by 2574b0acb, no story at 9d4f4834f)        | story       | packages/plugins/whiteboard/src/cards.stories.tsx | -        | failed call            |

##### packages/plugins/page/src/effect-card.stories.tsx (4 stories, 4 plays)

| test                         | destination | target                                            | merge-id | why                                  |
| ---------------------------- | ----------- | ------------------------------------------------- | -------- | ------------------------------------ |
| :9 EffectTurnedOn (play)     | story       | packages/plugins/page/src/effect-card.stories.tsx | -        | effect name once, action, on state   |
| :32 RegisteredEffects (play) | story       | packages/plugins/page/src/effect-card.stories.tsx | -        | effect list with description and off |
| :57 NoEffects (play)         | story       | packages/plugins/page/src/effect-card.stories.tsx | -        | empty state text                     |
| :70 Trace (play)             | story       | packages/plugins/page/src/effect-card.stories.tsx | -        | card inside a trace gallery          |

##### packages/plugins/page/src/console-card.stories.tsx (3 stories, 3 plays)

| test                | destination | target                                             | merge-id | why                     |
| ------------------- | ----------- | -------------------------------------------------- | -------- | ----------------------- |
| :11 LogLines (play) | story       | packages/plugins/page/src/console-card.stories.tsx | -        | line count and log text |
| :39 NoOutput (play) | story       | packages/plugins/page/src/console-card.stories.tsx | -        | empty state             |
| :52 Trace (play)    | story       | packages/plugins/page/src/console-card.stories.tsx | -        | in a trace              |

##### packages/plugins/page/src/edit-live-card.stories.tsx (3 stories, 3 plays)

| test                          | destination | target                                               | merge-id | why                                        |
| ----------------------------- | ----------- | ---------------------------------------------------- | -------- | ------------------------------------------ |
| :14 TextChangeWithDiff (play) | story       | packages/plugins/page/src/edit-live-card.stories.tsx | -        | Before/After tabs switch the capture image |
| :51 EvalCodeBlock (play)      | story       | packages/plugins/page/src/edit-live-card.stories.tsx | -        | script shown as code, not raw              |
| :72 Trace (play)              | story       | packages/plugins/page/src/edit-live-card.stories.tsx | -        | in a trace                                 |

##### packages/plugins/page/src/page-result-views.stories.tsx (3 stories, 3 plays)

| test                 | destination | target                                                  | merge-id | why                        |
| -------------------- | ----------- | ------------------------------------------------------- | -------- | -------------------------- |
| :14 NodeList (play)  | story       | packages/plugins/page/src/page-result-views.stories.tsx | -        | snapshot nodes with refs   |
| :31 HtmlBlock (play) | story       | packages/plugins/page/src/page-result-views.stories.tsx | -        | html shown in a code block |
| :44 ValueChip (play) | story       | packages/plugins/page/src/page-result-views.stories.tsx | -        | scalar value chip          |

##### packages/plugins/page/src/act-card.stories.tsx (2 stories, 2 plays)

| test                   | destination | target                                         | merge-id | why                           |
| ---------------------- | ----------- | ---------------------------------------------- | -------- | ----------------------------- |
| :10 FilledField (play) | story       | packages/plugins/page/src/act-card.stories.tsx | -        | typed value and capture image |
| :32 Trace (play)       | story       | packages/plugins/page/src/act-card.stories.tsx | -        | in a trace, timeout error row |

##### packages/plugins/page/src/grab-card.stories.tsx (2 stories, 2 plays)

| test                         | destination | target                                          | merge-id | why                                                                                       |
| ---------------------------- | ----------- | ----------------------------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| :44 GrabbedElement (play)    | story       | packages/plugins/page/src/grab-card.stories.tsx | -        | snapshot button and source label; the play owns what page.browser.test.tsx:3488 re-proves |
| :69 UnreadablePayload (play) | story       | packages/plugins/page/src/grab-card.stories.tsx | -        | could-not-be-read state; owns what page.browser:3514 re-proves                            |

##### packages/plugins/page/src/react-card.stories.tsx (5 stories, 5 plays)

| test                      | destination | target                                           | merge-id | why                               |
| ------------------------- | ----------- | ------------------------------------------------ | -------- | --------------------------------- |
| :9 LocatedSource (play)   | story       | packages/plugins/page/src/react-card.stories.tsx | -        | component and file:line           |
| :35 InspectedProps (play) | story       | packages/plugins/page/src/react-card.stories.tsx | -        | props tree                        |
| :60 RenderCounts (play)   | story       | packages/plugins/page/src/react-card.stories.tsx | -        | plural and singular render counts |
| :89 NoRenders (play)      | story       | packages/plugins/page/src/react-card.stories.tsx | -        | empty state                       |
| :108 Trace (play)         | story       | packages/plugins/page/src/react-card.stories.tsx | -        | in a trace                        |

##### packages/plugins/page/src/read-value-card.stories.tsx (4 stories, 4 plays)

| test                      | destination | target                                                | merge-id | why                                                         |
| ------------------------- | ----------- | ----------------------------------------------------- | -------- | ----------------------------------------------------------- |
| :9 ElementAndValue (play) | story       | packages/plugins/page/src/read-value-card.stories.tsx | -        | value as JSON tree                                          |
| :24 RootArray (play)      | story       | packages/plugins/page/src/read-value-card.stories.tsx | -        | root array as a tree; owns what page.browser:3130 re-proves |
| :41 RouteObject (play)    | story       | packages/plugins/page/src/read-value-card.stories.tsx | -        | route object                                                |
| :67 Trace (play)          | story       | packages/plugins/page/src/read-value-card.stories.tsx | -        | in a trace                                                  |

##### packages/plugins/page/src/read-bulk-card.stories.tsx (5 stories, 5 plays)

| test                     | destination | target                                               | merge-id | why                                                                                               |
| ------------------------ | ----------- | ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| :15 DomMarkup (play)     | story       | packages/plugins/page/src/read-bulk-card.stories.tsx | -        | markup in the diff viewer (reads shadowRoot textContent, a DOM read to replace with a role query) |
| :36 SnapshotNodes (play) | story       | packages/plugins/page/src/read-bulk-card.stories.tsx | -        | snapshot nodes with refs                                                                          |
| :61 QueryMatches (play)  | story       | packages/plugins/page/src/read-bulk-card.stories.tsx | -        | match count                                                                                       |
| :83 EmptySnapshot (play) | story       | packages/plugins/page/src/read-bulk-card.stories.tsx | -        | empty state                                                                                       |
| :96 Trace (play)         | story       | packages/plugins/page/src/read-bulk-card.stories.tsx | -        | in a trace                                                                                        |

##### packages/plugins/page/src/session-card.stories.tsx (10 stories, 10 plays)

| test                       | destination | target                                             | merge-id | why                                                                |
| -------------------------- | ----------- | -------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| :122 Streaming (play)      | story       | packages/plugins/page/src/session-card.stories.tsx | -        | running session, current step, 4 rows                              |
| :146 Settled (play)        | story       | packages/plugins/page/src/session-card.stories.tsx | -        | settled header, collapse on click                                  |
| :170 BornOpen (play)       | story       | packages/plugins/page/src/session-card.stories.tsx | -        | opened session lists every step and value                          |
| :192 Aborted (play)        | story       | packages/plugins/page/src/session-card.stories.tsx | -        | no running marker after abort                                      |
| :215 WithError (play)      | story       | packages/plugins/page/src/session-card.stories.tsx | -        | step error shown                                                   |
| :255 Scripted (play)       | story       | packages/plugins/page/src/session-card.stories.tsx | -        | script steps read their first code line                            |
| :266 ScriptedNarrow (play) | story       | packages/plugins/page/src/session-card.stories.tsx | -        | same at a narrow split (needs layout)                              |
| :277 Narrow (play)         | story       | packages/plugins/page/src/session-card.stories.tsx | -        | narrow card hides url and counts (container query, needs layout)   |
| :301 HeaderSummary (play)  | story       | packages/plugins/page/src/session-card.stories.tsx | -        | Tab focus and tooltip (real focus; inline 2000 ms timeout to drop) |
| :326 LongUrl (play)        | story       | packages/plugins/page/src/session-card.stories.tsx | -        | long url present (weak: toBeInTheDocument)                         |

#### 1.2 packages/plugins/page/test/page.browser.test.tsx lines 1 to 1299 (58 tests)

| test                                                                            | destination    | target                                                                      | merge-id      | why                                                                                                                                           |
| ------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| :107 captureElement captures the clone as markup carrying the inlined styles    | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | GRAB-CLONE    | needs real computed styles (no CSS engine in happy-dom); drop the style.color asserts for a rendered check                                    |
| :121 captures pseudo-element rules into a scoped stylesheet                     | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | GRAB-CLONE    | ::before rules come from the real CSSOM                                                                                                       |
| :132 strips ids and neutralizes the root layout                                 | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | GRAB-CLONE    | same clone, one more step                                                                                                                     |
| :144 keeps the markup of a grabbed svg element                                  | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | GRAB-CLONE    | width needs layout                                                                                                                            |
| :361 survives a later class flip and deletion of the captured node              | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | CAP-FROZEN    | capture runs rrweb over the real CSSOM                                                                                                        |
| :376 carries the ancestor skeleton down to a marked target                      | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | CAP-FROZEN    | css bundle from document.styleSheets                                                                                                          |
| :385 hashes the same page css to the same bundle on every capture               | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | CAP-FROZEN    | second capture in the same fixture                                                                                                            |
| :392 keeps a css bundle for each side when the page injects a rule mid-tool     | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | CAP-FROZEN    | before/after css differ                                                                                                                       |
| :411 keeps a password out of the capture payload                                | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | CAP-FROZEN    | secret masked in capture (password case not in page.browser:2223)                                                                             |
| :417 keeps a payment field out of the capture payload                           | DELETE-DUP     | page.browser.test.tsx:2223                                                  | -             | page.browser:2223 keeps a payment field out of the result and the capture                                                                     |
| :423 records a before side and no after side when the verb detaches the element | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | CAP-FROZEN    | detach path                                                                                                                                   |
| :429 degrades to a descriptor when the subtree holds the conciv widget          | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | CAP-FROZEN    | widget never serialized                                                                                                                       |
| :438 strips handlers, javascript: urls, iframe/object/embed                     | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | CAP-SANITIZE  | one proof the serializer applies the protocol rules                                                                                           |
| :467 keeps script and stylesheet-link nodes out                                 | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | CAP-SANITIZE  | same hostile fixture                                                                                                                          |
| :481 still produces a capture with an out-of-range numeric character reference  | DELETE-COVERED | packages/protocol/src/element-capture-sanitize.test.ts (`isLocalReference`) | CAP-SANITIZE  | the decode rule is a protocol unit; the :438 fixture already carries the link                                                                 |
| :491 inlines a same-origin image as webp at rendered size, src stripped         | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | CAP-IMAGES    | canvas encode + image decode                                                                                                                  |
| :508 admits images in document order within budget                              | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | CAP-IMAGES    | canvas                                                                                                                                        |
| :535 measures the payload budget in utf-8 bytes                                 | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | CAP-IMAGES    | over budget gives descriptor only, same outcome as :604                                                                                       |
| :548 rejects an encoder failure, sibling still inlines                          | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | CAP-IMAGES    | canvas size limit                                                                                                                             |
| :563 leaves the live element untouched and silent when the canvas taints        | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | CAP-IMAGES    | cross-origin taint; replace the three vi.spyOn with an observable assert                                                                      |
| :585 never inlines a conciv-block image                                         | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | CAP-IMAGES    | opt-out class                                                                                                                                 |
| :604 omits the node and keeps the descriptor past the payload budget            | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | CAP-IMAGES    | budget fallback                                                                                                                               |
| :699 a captured run keeps its line count under a fallback font                  | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | FONT-FALLBACK | real fonts and line boxes (geometry assert to reword per Decision 6)                                                                          |
| :712 a run the frame can render itself is left untouched                        | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | FONT-FALLBACK | font check needs document.fonts                                                                                                               |
| :725 a captured run keeps its advance width                                     | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | FONT-FALLBACK | real text widths                                                                                                                              |
| :779 fitImagePreview returns a preview that already fits untouched              | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | GRAB-FIT      | canvas encode                                                                                                                                 |
| :788 refits an oversized preview so it survives a payload round trip            | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | GRAB-FIT      | canvas                                                                                                                                        |
| :804 keeps an image when nothing can reach the budget                           | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | GRAB-FIT      | canvas                                                                                                                                        |
| :814 returns the original when the data url cannot be decoded                   | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | GRAB-FIT      | image decode                                                                                                                                  |
| :842 elementSnippet opening tag, salient attributes, trimmed text               | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | SNIPPET       | DOM-only string building, it.each row                                                                                                         |
| :849 keeps role and aria-label, drops others                                    | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | SNIPPET       | it.each table on a DOM; row                                                                                                                   |
| :854 omits the closing tag for void and empty                                   | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | SNIPPET       | it.each table on a DOM; row                                                                                                                   |
| :859 truncates long text to eighty characters                                   | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | SNIPPET       | it.each table on a DOM; row                                                                                                                   |
| :867 groundGrabText snippet plus full data-tsd-source path                      | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | GROUND        | it.each table on a DOM; row                                                                                                                   |
| :878 reads the attribute off the nearest annotated ancestor                     | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | GROUND        | it.each table on a DOM; row                                                                                                                   |
| :885 passes react-grab text through when no attribute resolves                  | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | GROUND        | it.each table on a DOM; row                                                                                                                   |
| :914 buildSnapshot derives roles from tags, input types, roles                  | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | SNAPSHOT      | role table; see 4 on the hidden check                                                                                                         |
| :946 prefers aria-label, then label, then trimmed text                          | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | SNAPSHOT      | it.each table on a DOM; name table                                                                                                            |
| :959 truncates long names at 80 characters                                      | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | SNAPSHOT      | it.each table on a DOM; row                                                                                                                   |
| :965 reports checked, disabled and hidden state                                 | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | CAP-FROZEN    | hidden reads offsetParent, which needs layout                                                                                                 |
| :979 carries form values and skips uninteresting elements                       | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | SNAPSHOT      | it.each table on a DOM; row                                                                                                                   |
| :990 mints sequential live refs that dereference to the elements                | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | SNAPSHOT      | it.each table on a DOM; ref numbering                                                                                                         |
| :1001 describeElement tag, id, class, rect, computed style                      | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | SNAPSHOT      | it.each table on a DOM; only expect.any on rect/style, so happy-dom zeros pass                                                                |
| :1055 locate names the component and walks the owner chain                      | DELETE-DUP     | page.browser.test.tsx:3008                                                  | -             | same Leaf/Branch stack and owner refs starting with v                                                                                         |
| :1065 locate reads data-tsd-source into a source location                       | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | M-INSPECT     | the covering conciv.browser:12778 is deleted and app.md has no row for it; Alt and click a React element, its source opens through the engine |
| :1074 describe + componentHostAt resolve the owning component                   | DELETE-DUP     | page.browser.test.tsx:3008                                                  | -             | tree.describe(element) gives Leaf there; add the one componentHostAt assert to that test                                                      |
| :1081 inspect reads function-component props and hooks                          | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | REACT-BRIDGE  | hooks only proven here                                                                                                                        |
| :1090 inspect reads class-component state, no hooks                             | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | REACT-BRIDGE  | it.each table on a DOM; class state only here                                                                                                 |
| :1099 override sets class state in place and re-renders                         | DELETE-DUP     | page.browser.test.tsx:1609                                                  | -             | same Counter state override                                                                                                                   |
| :1105 override function-component props                                         | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | REACT-BRIDGE  | it.each table on a DOM; only test                                                                                                             |
| :1111 override hook state by hook id                                            | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | REACT-BRIDGE  | it.each table on a DOM; only test                                                                                                             |
| :1120 override nearest context provider value                                   | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | REACT-BRIDGE  | it.each table on a DOM; only test                                                                                                             |
| :1126 override reports actionable errors                                        | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | REACT-BRIDGE  | it.each table on a DOM; three error texts, it.each                                                                                            |
| :1141 tree builds the composite tree                                            | DELETE-DUP     | page.browser.test.tsx:1589                                                  | -             | same Branch > Leaf, Counter                                                                                                                   |
| :1157 tree truncates beyond maxNodes                                            | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | REACT-BRIDGE  | it.each table on a DOM; only test                                                                                                             |
| :1162 find by display name                                                      | DELETE-DUP     | page.browser.test.tsx:1589                                                  | -             | find Leaf then locate by its ref                                                                                                              |
| :1197 root discovery with no recorded fiber roots                               | happy-dom      | packages/plugins/page/src/page.dom.test.tsx                                 | REACT-BRIDGE  | it.each table on a DOM; real bug class; clears bippy global, own describe                                                                     |
| :1210 a real pointer pick, plain or React, comment and pick mode                | browser mode   | packages/plugins/page/src/page.browser.test.tsx                             | PICK          | real pointer hit test beside the text (layout); joins page.browser:3031 Page.pick                                                             |

#### 1.3 packages/plugins/page/test/page.test.ts (40 tests)

Machine and schema rows are pure, so they are `node (table)` rows beside `rpc.ts`, `tools.ts` and `machine.ts`. Queue,
files and symbolicate use real async play, real files and an injected fetch, so they are `node` rows beside `queue.ts`,
`files.ts` and `symbolicate.ts`.

| test                                                                                      | destination  | target                                        | merge-id       | why                                                                                      |
| ----------------------------------------------------------------------------------------- | ------------ | --------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| :42 every page operation takes an optional tab ID                                         | node (table) | packages/plugins/page/src/rpc.test.ts         | RPC-SCHEMA     | schema guard                                                                             |
| :54 page input bounds and optional fields survive the wire                                | node (table) | packages/plugins/page/src/rpc.test.ts         | RPC-SCHEMA     | bounds table                                                                             |
| :71 page files are bounded bytes, not remote paths                                        | node (table) | packages/plugins/page/src/rpc.test.ts         | RPC-SCHEMA     | security bound                                                                           |
| :87 the RPC version is explicit                                                           | node (table) | packages/plugins/page/src/rpc.test.ts         | RPC-SCHEMA     | now refuses an old or wrong version (no longer the self-equal literal the audit flagged) |
| :96 symbolicate takes bounded frames                                                      | node (table) | packages/plugins/page/src/rpc.test.ts         | RPC-SCHEMA     | schema bounds                                                                            |
| :109 page ID patterns survive JSON Schema export                                          | node (table) | packages/plugins/page/src/rpc.test.ts         | RPC-SCHEMA     | model tool defs                                                                          |
| :114 it.each tool def keeps its schema, mutating and capture as an operation              | node (table) | packages/plugins/page/src/tools.test.ts       | RPC-SCHEMA     | table over all tools                                                                     |
| :123 the operations are the page tools plus tabs.list and fill_form                       | node (table) | packages/plugins/page/src/tools.test.ts       | RPC-SCHEMA     | one set assert beside :114                                                               |
| :131 the built-in page skill uses a virtual skill:// URI                                  | node (table) | packages/plugins/page/src/tools.test.ts       | RPC-SCHEMA     | one assert                                                                               |
| :189 a closing tab never revokes another tab's grant                                      | node (table) | packages/plugins/page/src/machine.test.ts     | MACH-ATTACH    | reducer                                                                                  |
| :207 a tab that attaches again replaces its own attachment                                | node (table) | packages/plugins/page/src/machine.test.ts     | MACH-ATTACH    | reducer                                                                                  |
| :219 a re-attach waits for the revoke in flight                                           | node (table) | packages/plugins/page/src/machine.test.ts     | MACH-ATTACH    | race                                                                                     |
| :237 a call during re-attach answers still connecting                                     | node (table) | packages/plugins/page/src/machine.test.ts     | MACH-ATTACH    | race                                                                                     |
| :250 two tabs attaching at once share the grant                                           | node (table) | packages/plugins/page/src/machine.test.ts     | MACH-ATTACH    | race                                                                                     |
| :266 no tool reaches an attachment before its grant                                       | node (table) | packages/plugins/page/src/machine.test.ts     | MACH-HANDSHAKE | security order                                                                           |
| :287 attach.closed while attaching never sends attached                                   | node (table) | packages/plugins/page/src/machine.test.ts     | MACH-HANDSHAKE | race                                                                                     |
| :304 a request for a closed tab is never sent                                             | node (table) | packages/plugins/page/src/machine.test.ts     | MACH-HANDSHAKE | race                                                                                     |
| :316 it.each grant ends failed or timed out                                               | node (table) | packages/plugins/page/src/machine.test.ts     | MACH-SYNC      | table                                                                                    |
| :335 a failed revoke before a re-attach still grants                                      | node (table) | packages/plugins/page/src/machine.test.ts     | MACH-SYNC      | failure path                                                                             |
| :347 stale sync results and attach events change nothing                                  | node (table) | packages/plugins/page/src/machine.test.ts     | MACH-SYNC      | staleness table                                                                          |
| :370 granting what is already granted writes nothing                                      | node (table) | packages/plugins/page/src/machine.test.ts     | RECONCILE      | pure                                                                                     |
| :376 revoking keeps the user's rules in order                                             | node (table) | packages/plugins/page/src/machine.test.ts     | RECONCILE      | pure                                                                                     |
| :382 page denies are not page allows                                                      | node (table) | packages/plugins/page/src/machine.test.ts     | RECONCILE      | pure                                                                                     |
| :389 a tab ID resolves to its tab, else the last focused                                  | node (table) | packages/plugins/page/src/machine.test.ts     | MACH-TABS      | routing                                                                                  |
| :427 attached with no tab state yet is in neither list                                    | node (table) | packages/plugins/page/src/machine.test.ts     | MACH-TABS      | empty state                                                                              |
| :439 deleting an attached session closes every tab without a revoke                       | node (table) | packages/plugins/page/src/machine.test.ts     | MACH-LIFE      | reducer                                                                                  |
| :449 deleting an attaching session ends after its grant settles                           | node (table) | packages/plugins/page/src/machine.test.ts     | MACH-LIFE      | reducer                                                                                  |
| :462 an idle plugin drains at once                                                        | node (table) | packages/plugins/page/src/machine.test.ts     | MACH-LIFE      | base case of :468                                                                        |
| :468 disposal drains only when the last revoke settles                                    | node (table) | packages/plugins/page/src/machine.test.ts     | MACH-LIFE      | reducer                                                                                  |
| :493 a disposed plugin rejects requests and ignores attachments                           | node (table) | packages/plugins/page/src/machine.test.ts     | MACH-LIFE      | reducer                                                                                  |
| :506 a finished chat queue is owed until claimed                                          | node         | packages/plugins/page/src/queue.test.ts       | QUEUE          | async queue contract                                                                     |
| :537 queue.claim and settle back                                                          | node         | packages/plugins/page/src/queue.test.ts       | QUEUE          | claim contract                                                                           |
| :564 a deleted session drops its queues                                                   | node         | packages/plugins/page/src/queue.test.ts       | QUEUE          | owner level (core.test copies trim)                                                      |
| :590 an undispatched queued action counts as lost                                         | node         | packages/plugins/page/src/queue.test.ts       | QUEUE          | distinct path                                                                            |
| :642 keeps each reply for its own action, lost when unconfirmed, owes what no caller took | node         | packages/plugins/page/src/queue.test.ts       | QUEUE          | ordering and ownership                                                                   |
| :710 a claimed result outlives 200 delivered queues                                       | node         | packages/plugins/page/src/queue.test.ts       | QUEUE          | retention cap                                                                            |
| :732 at 1000 owed results a new queue is refused                                          | node         | packages/plugins/page/src/queue.test.ts       | QUEUE          | backpressure                                                                             |
| :755 saved capture names never escape their directory                                     | node         | packages/plugins/page/src/files.test.ts       | -              | path traversal, real files                                                               |
| :785 symbolicate reads a server frame, loopback only                                      | node         | packages/plugins/page/src/symbolicate.test.ts | SYMBOLICATE    | SSRF guard, injected fetch                                                               |
| :799 null for a frame with no fileName                                                    | node         | packages/plugins/page/src/symbolicate.test.ts | SYMBOLICATE    | one more frame in :785                                                                   |

#### 1.4 packages/plugin-testkit/test/plugin-testkit.test.ts (14 tests, file deleted in 9d4f4834f)

These tested the old kit itself: bootCoreKit, listenLocal, gates, faults, observeRpc and rpcSocketFor. That kit is gone,
and the new kit (`createEngine`, `mount`, `createHarnessEngine`) is proven by the step 2 samples. Every row is
`not carried` (Decision P3).

| test                                                                                                   | destination | target | merge-id  | why                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------ | ----------- | ------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| :40 bootCoreKit adopts harness transcript rows as external sessions (file deleted in 9d4f4834f itself) | not carried | -      | TK-ENGINE | the old kit this tested (bootCoreKit, listenLocal, gates, faults, observeRpc, rpcSocketFor) is gone; the new kit is proven by the step 2 samples, not by these rows                                   |
| :63 serves the injected staleness probe (file deleted in 9d4f4834f itself)                             | not carried | -      | TK-ENGINE | the old kit this tested (bootCoreKit, listenLocal, gates, faults, observeRpc, rpcSocketFor) is gone; the new kit is proven by the step 2 samples, not by these rows                                   |
| :70 lets a non-loopback origin through only when allowed (file deleted in 9d4f4834f itself)            | not carried | -      | TK-ENGINE | the old kit this tested (bootCoreKit, listenLocal, gates, faults, observeRpc, rpcSocketFor) is gone; the new kit is proven by the step 2 samples, not by these rows                                   |
| :91 keeps a passed state root across two kits (file deleted in 9d4f4834f itself)                       | not carried | -      | TK-ENGINE | the old kit this tested (bootCoreKit, listenLocal, gates, faults, observeRpc, rpcSocketFor) is gone; the new kit is proven by the step 2 samples, not by these rows                                   |
| :113 listenLocal rejects instead of hanging on a bound port (file deleted in 9d4f4834f itself)         | not carried | -      | -         | the old kit this tested (bootCoreKit, listenLocal, gates, faults, observeRpc, rpcSocketFor) is gone; the new kit is proven by the step 2 samples, not by these rows                                   |
| :126 a socket the page closes is closed on the engine too (file deleted in 9d4f4834f itself)           | not carried | -      | -         | Playwright socket routing; the old kit this tested (bootCoreKit, listenLocal, gates, faults, observeRpc, rpcSocketFor) is gone; the new kit is proven by the step 2 samples, not by these rows        |
| :193 a gate with an input pattern holds only the matching call (file deleted in 9d4f4834f itself)      | not carried | -      | TK-GATE   | gate fixture, a held socket call; the old kit this tested (bootCoreKit, listenLocal, gates, faults, observeRpc, rpcSocketFor) is gone; the new kit is proven by the step 2 samples, not by these rows |
| :236 observer dispose fails the pending waiter at once (file deleted in 9d4f4834f itself)              | not carried | -      | -         | `observeRpc` is gone with the old kit                                                                                                                                                                 |
| :253 observer dispose leaks no unhandled rejection (file deleted in 9d4f4834f itself)                  | not carried | -      | -         | `observeRpc` is gone with the old kit                                                                                                                                                                 |
| :283 a call the page aborts after its answer is reported given up (file deleted in 9d4f4834f itself)   | not carried | -      | TK-GATE   | gate fixture; the old kit this tested (bootCoreKit, listenLocal, gates, faults, observeRpc, rpcSocketFor) is gone; the new kit is proven by the step 2 samples, not by these rows                     |
| :338 a gate given an exact input holds only matching calls (file deleted in 9d4f4834f itself)          | not carried | -      | TK-GATE   | gate fixture; the old kit this tested (bootCoreKit, listenLocal, gates, faults, observeRpc, rpcSocketFor) is gone; the new kit is proven by the step 2 samples, not by these rows                     |
| :382 a failure given an input fails only matching calls (file deleted in 9d4f4834f itself)             | not carried | -      | TK-FAULT  | fault fixture; the old kit this tested (bootCoreKit, listenLocal, gates, faults, observeRpc, rpcSocketFor) is gone; the new kit is proven by the step 2 samples, not by these rows                    |
| :429 a gate that releases as a failure is answered with it (file deleted in 9d4f4834f itself)          | not carried | -      | TK-FAULT  | fault fixture; the old kit this tested (bootCoreKit, listenLocal, gates, faults, observeRpc, rpcSocketFor) is gone; the new kit is proven by the step 2 samples, not by these rows                    |
| :479 an rpc socket counts as live once the page speaks on it (file deleted in 9d4f4834f itself)        | not carried | -      | -         | raw socket liveness; the old kit this tested (bootCoreKit, listenLocal, gates, faults, observeRpc, rpcSocketFor) is gone; the new kit is proven by the step 2 samples, not by these rows              |

Merge journeys:

- GRAB-CLONE: one grab of a styled card and an svg: inlined styles, pseudo rules, no ids, static root.
- CAP-FROZEN: one capture journey: frozen copy, skeleton, css bundle stable and per side, password masked, detach, widget subtree, snapshot hidden state.
- CAP-SANITIZE: one hostile fixture capture, every dangerous thing gone.
- CAP-IMAGES: image inlining, order under budget, encoder failure, taint, opt-out, utf-8 budget, over-budget fallback.
- FONT-FALLBACK: one replica, line count, width, untouched system font (joins page.browser:2443 and :2459 "a capture in every engine").
- GRAB-FIT: fitImagePreview no-op, refit, never-drop, undecodable.
- SNIPPET, GROUND, SNAPSHOT, RECONCILE: it.each tables.
- REACT-BRIDGE: inspect then override journey in one fresh React root per test (fixes today's order dependence).
- PICK: page:1171 plus page.browser:3031 as one pick journey (comment mode, plain heading, React heading, Escape).
- RPC-SCHEMA, MACH-*: transition tables. QUEUE: queue contract journey. SYMBOLICATE: one call table.

### 2. Totals per file

| file                                    | rows | goes to                                                                                                   |
| --------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------- |
| page card stories (10 files)            | 41   | story 41, unchanged                                                                                       |
| whiteboard card stories (4 files, gone) | 21   | story 21, written again in packages/plugins/whiteboard/src/cards.stories.tsx                              |
| page.browser.test.tsx lines 1 to 1299   | 58   | browser mode 30 (page.browser.test.tsx), happy-dom 21 (page.dom.test.tsx), DELETE-DUP 6, DELETE-COVERED 1 |
| page.test.ts                            | 40   | node (table) 30, node 10, in `src/*.test.ts` beside rpc, tools, machine, queue, files, symbolicate        |
| plugin-testkit.test.ts                  | 14   | not carried 14                                                                                            |
| total                                   | 174  |                                                                                                           |

Budget note: `src/page.dom.test.tsx` takes 21 DOM rows here and 23 from section A. The machine rows become real tables in
`machine.test.ts`, so no single test file passes 1,000 lines.

### 3. Cross-file duplicates (suspected or verified)

Verified by reading both:

- page.browser:1055 and :1074 = page.browser:3008 "reads the component tree, names and locates an element, and dehydrates what it finds".
- page.browser:1099 = page.browser:1609 "overrides props and validates its inputs" (Counter state override).
- page.browser:1141 and :1162 = page.browser:1589 "finds, locates, walks and inspects a component...".
- page.browser:417 = page.browser:2223 "carries the page css once per capture call... keeps a payment field out".
- page.browser:481 is covered by packages/protocol/src/element-capture-sanitize.test.ts (`isLocalReference`).
- grab-card story GrabbedElement (:44) = page.browser:3488; UnreadablePayload (:69) = page.browser:3514. The plays own them.
- read-value-card story RootArray (:24) = page.browser:3130. The play owns it.

Suspected (same subject, not proven identical):

- page.browser:1210 and :3031 (Page.pick): merged as PICK.
- page.browser FONT-FALLBACK and :2443 / :2459 (capture keeps one-line links and wrapped paragraphs): one font and line journey.
- session-card stories Scripted / ScriptedNarrow and page.browser:3451; Settled and page.browser:3396. If the test only
  renders a card from story data, a play owns it.
- console-card stories and page.browser:3100 (error mark not in any story: add a story, delete the test).
- react-card story LocatedSource and page.browser:3150 (subtitle not in the story play).

Owners: every page card story and every page.browser / page.test row belongs to `@conciv/plugin-page`; the whiteboard card
stories to `@conciv/plugin-whiteboard`. Nothing here belongs to the shell.

### 4. Cannot move to happy-dom, and suspected blockers

- The whole capture library (page.browser :107-:604) looks like it only checks serialized JSON. But rrweb snapshot and
  the css bundle read the real CSSOM and computed styles, and images need canvas encode, image decode and cross-origin
  taint. happy-dom has none of these, so capture stays in browser mode.
- buildSnapshot's hidden flag (page.browser:965) reads `offsetParent === null` (packages/plugins/page/src/snapshot.ts).
  happy-dom has no layout, so the flag is never right, and :965 stays in browser mode. The role, name and value rows
  (:946, :959, :979, :990) run in happy-dom only if the hidden check does not change their result.
- Fallback-font rows need real fonts and line boxes, grab fit needs canvas, and the pointer pick needs hit testing.
- React bridge rows (:1090-:1197) run in happy-dom with react-dom, but bippy must install its devtools hook before React
  loads; set the import order in `page.dom.test.tsx`. inspect's rect assert is `expect.any(Number)`, fine with zeros.
- Stories: session-card Narrow and ScriptedNarrow depend on a real width split (Ark Splitter plus container queries), and
  HeaderSummary needs real focus and a tooltip. Storybook runs in Chromium, so they stay stories.
- Rule breaks to fix in the rewrite: page.browser:563 uses three `vi.spyOn`; :107/:132/:712 assert CSS strings; :699/:725
  assert geometry; :1210 polls `grabApi.isActive()`; session-card HeaderSummary has an inline 2000 ms timeout; read-bulk
  DomMarkup reads shadowRoot textContent.

---

## Section C: ios and recorder

Line numbers are lines at `9d4f4834f`. The audit files (test-audit-plugins-ios.md, test-audit-plugins-recorder.md) are
stale and were used as hints only.

### packages/plugins/ios/test/ios.test.ts (50 tests)

| test                                                                                             | destination    | target                                 | merge-id   | why                                                                                    |
| ------------------------------------------------------------------------------------------------ | -------------- | -------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| 146 offers screenshot and logs in code mode, build/run direct, not configured from every tool    | node           | packages/plugins/ios/src/index.test.ts | I-ENGINE   | tool surface over a real engine                                                        |
| 171 fails to load with a tagged InvalidOptions naming the bad option                             | node           | packages/plugins/ios/src/index.test.ts | I-ENGINE   | plugin load state over a real engine                                                   |
| 181 asks before building or running, a denial runs nothing                                       | node           | packages/plugins/ios/src/index.test.ts | I-ENGINE   | approval ask gate over the engine                                                      |
| 193 adds the ios rules to every model request, nothing when unconfigured                         | node           | packages/plugins/ios/src/index.test.ts |            | system prompt reaches the model request                                                |
| 224 reads no options as unconfigured, normalizes concivUrl, keeps extra source dirs              | node (table)   | packages/plugins/ios/src/index.test.ts |            | pure zod parse; concivUrl rows become it.each                                          |
| 253 describes the native overlay, names the served app, rules out crawls                         | node (table)   | packages/plugins/ios/src/index.test.ts |            | pure prompt text; overrides become rows                                                |
| 291 stops the child process when the run is interrupted                                          | node           | packages/plugins/ios/src/index.test.ts | I-RUNNER   | real child process                                                                     |
| 316 collects stdout up to 128 MiB and fails with OutputTooLarge past it                          | node           | packages/plugins/ios/src/index.test.ts | I-RUNNER   | real child process output cap                                                          |
| 432 reports swiftc diagnostics, or raw stderr when none                                          | node           | packages/plugins/ios/src/index.test.ts | I-BUILD    | build over a fake simctl service                                                       |
| 458 builds in swiftc mode with extra source roots, honoring developerDir                         | node           | packages/plugins/ios/src/index.test.ts | I-BUILD    | same swiftc build path                                                                 |
| 484 builds in xcodebuild mode: failure diagnostics, success app path                             | node           | packages/plugins/ios/src/index.test.ts | I-BUILD    | xcodebuild branch of the same build                                                    |
| 522 reads the app path from xcodebuild settings by bundle id and wrapper                         | node (table)   | packages/plugins/ios/src/index.test.ts |            | pure parser; seven inputs become it.each rows                                          |
| 546 runs the app: boot, install, terminate, launch, url and autoshow env                         | node           | packages/plugins/ios/src/index.test.ts | I-RUN      | run sequence over the fake simctl                                                      |
| 579 checks every packaging step of a swiftc build                                                | node           | packages/plugins/ios/src/index.test.ts | I-BUILD    | plutil/codesign/Info.plist failures                                                    |
| 607 picks the available simulator among duplicate names                                          | node           | packages/plugins/ios/src/index.test.ts | I-RUN      | device pick on the run path                                                            |
| 628 names the stage a run stopped at                                                             | node           | packages/plugins/ios/src/index.test.ts | I-RUN      | one injected failure per stage, a table                                                |
| 674 captures the screen as a png data uri with its size                                          | node           | packages/plugins/ios/src/index.test.ts | I-READS    | screenshot tool shape                                                                  |
| 685 runs one build at a time                                                                     | node           | packages/plugins/ios/src/index.test.ts |            | build serialisation with a Deferred gate                                               |
| 719 reads recent log lines with window and limit, missing simulator, bad predicate               | node           | packages/plugins/ios/src/index.test.ts | I-READS    | logs tool shapes                                                                       |
| 802 covers every catalog message (13)                                                            | node (table)   | packages/plugins/ios/src/index.test.ts | I-FIXTURES | count guard; fold into 815                                                             |
| 806 it.each: each type has valid, invalid and unknown-key fixtures                               | node (table)   | packages/plugins/ios/src/index.test.ts | I-FIXTURES | fixture coverage table                                                                 |
| 812 every fixture type is a known union member                                                   | node (table)   | packages/plugins/ios/src/index.test.ts | I-FIXTURES | reverse of 815                                                                         |
| 820 it.each: valid fixture parses                                                                | node (table)   | packages/plugins/ios/src/index.test.ts | I-PARSE    | schema table                                                                           |
| 824 it.each: unknown-key fixture parses and drops the key                                        | node (table)   | packages/plugins/ios/src/index.test.ts | I-PARSE    | schema table                                                                           |
| 833 it.each: invalid fixture fails runtime and strict parse                                      | node (table)   | packages/plugins/ios/src/index.test.ts | I-PARSE    | schema table                                                                           |
| 843 it.each: unknown-key fixture fails strict parse                                              | node (table)   | packages/plugins/ios/src/index.test.ts | I-PARSE    | schema table                                                                           |
| 852 it.each: valid fixture survives decode, encode, decode                                       | node (table)   | packages/plugins/ios/src/index.test.ts | I-PARSE    | schema table                                                                           |
| 860 it.each: committed JSON equals the authored table entry                                      | node (table)   | packages/plugins/ios/src/index.test.ts |            | drift guard for the Swift-side fixtures                                                |
| 871 it.each: native encode JSON equals the authored payload                                      | node (table)   | packages/plugins/ios/src/index.test.ts | I-ENCODE   | drift guard                                                                            |
| 876 it.each: native encode payload validates against NativeToPageSchema                          | node (table)   | packages/plugins/ios/src/index.test.ts | I-ENCODE   | schema table                                                                           |
| 880 a handshake with no token key parses with token null                                         | node (table)   | packages/plugins/ios/src/index.test.ts | I-ENCODE   | one more row of 885                                                                    |
| 895 normalizes absent grab keys to null on a successful pick                                     | node (table)   | packages/plugins/ios/src/index.test.ts | I-NILKEYS  | schema default rows                                                                    |
| 922 accepts a grabResult with no grab key and yields null                                        | node (table)   | packages/plugins/ios/src/index.test.ts | I-NILKEYS  | same table as 904                                                                      |
| 954 accepts a subtree at the depth limit                                                         | node (table)   | packages/plugins/ios/src/index.test.ts | I-SUBTREE  | one it.each over depth and width                                                       |
| 958 rejects a subtree deeper than the depth limit                                                | node (table)   | packages/plugins/ios/src/index.test.ts | I-SUBTREE  | same table                                                                             |
| 962 rejects a subtree whose node count exceeds the budget                                        | node (table)   | packages/plugins/ios/src/index.test.ts | I-SUBTREE  | same table                                                                             |
| 969 NeutralGrab is assignable to Grab                                                            | DELETE-NOTHING |                                        |            | runtime assert is always true; tsc already proves it, keep the type line without an it |
| 978 nativePageBase: bare origin without token                                                    | node (table)   | packages/plugins/ios/src/index.test.ts | I-PAGEBASE | four rows of one it.each                                                               |
| 984 nativePageBase: keeps /t/<token>                                                             | node (table)   | packages/plugins/ios/src/index.test.ts | I-PAGEBASE | same table                                                                             |
| 990 nativePageBase: trailing slash                                                               | node (table)   | packages/plugins/ios/src/index.test.ts | I-PAGEBASE | same table                                                                             |
| 994 nativePageBase: falls back to the origin                                                     | node (table)   | packages/plugins/ios/src/index.test.ts | I-PAGEBASE | same table                                                                             |
| 1040 bridge machine: announces, acks, handshakes, stops once ready                               | node (table)   | packages/plugins/ios/src/index.test.ts |            | pure transition replay                                                                 |
| 1066 bridge machine: rebinds on another api base                                                 | node (table)   | packages/plugins/ios/src/index.test.ts |            | pure transition replay                                                                 |
| 1085 bridge machine: incompatible on version mismatch                                            | node (table)   | packages/plugins/ios/src/index.test.ts |            | pure transition replay                                                                 |
| 1110 bridge machine: pick attempt id, stale grabResult, subtree fold                             | node (table)   | packages/plugins/ios/src/index.test.ts |            | pure transition replay                                                                 |
| 1152 bridge machine: ends a pick by timeout, cancel, native cancel/failure, unparseable, dispose | node (table)   | packages/plugins/ios/src/index.test.ts |            | pure; already a table in disguise                                                      |
| 1196 bridge machine: grab capability and panel toggles                                           | node (table)   | packages/plugins/ios/src/index.test.ts |            | pure transition replay                                                                 |
| 1234 bridge driver: posts ready and hello every 300 ms until acked                               | node           | packages/plugins/ios/src/index.test.ts | I-DRIVER   | Effect runtime with TestClock and a fake transport                                     |
| 1264 bridge driver: pick times out after 10 s, live pick settles                                 | node           | packages/plugins/ios/src/index.test.ts | I-DRIVER   | same driver, clocked                                                                   |
| 1300 bridge driver: open pick resolves null when its scope closes                                | node           | packages/plugins/ios/src/index.test.ts | I-DRIVER   | same driver, scope close                                                               |

Totals (50): node (table) 30, node 19, DELETE-NOTHING 1. Targets are `src/*.test.ts` beside the code each row names; no
happy-dom or browser mode file. Merges shrink it:

- I-ENGINE 3 to 1, I-BUILD 4 to 1, I-RUN 3 to 1, I-READS 2 to 1, I-FIXTURES 3 to 1, I-DRIVER 3 to 1;
- I-PARSE: 5 tables to 1 table keyed by kind;
- I-SUBTREE and I-PAGEBASE: one `it.each` each.

### packages/plugins/recorder/test/recorder.test.ts (36 tests)

| test                                                                                                                     | destination    | target                                        | merge-id | why                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------ | -------------- | --------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| 252 is active                                                                                                            | DELETE-NOTHING |                                               |          | every other test fails if the plugin is not active                                                              |
| 260 config defaults, flush/window/log, client pins, save in project, caps, corrupt, io-error, stray sweep, reset, reopen | node           | packages/plugins/recorder/src/index.test.ts   | R-STORE  | store journey over a real engine; the click label cases (304-366) are pure and could become `node (table)` rows |
| 466 live state, appended event with client id and cursor, since deltas, snapshot on reset                                | node           | packages/plugins/recorder/src/index.test.ts   |          | event wire contract the page player relies on                                                                   |
| 496 viewer presence: live, renew without snapshot, off on leave                                                          | node           | packages/plugins/recorder/src/index.test.ts   | R-LEASE  | lease grant and renew                                                                                           |
| 513 four tools offered, start fails without a page, start/stop/pull, clip, get, gone                                     | node           | packages/plugins/recorder/src/index.test.ts   | R-TOOLS  | tool journey; 531 waits out the real 5 s START_WAIT_MS (rule 2 break, needs an option)                          |
| 583 reads a saved recording until the seven day retention, then expired                                                  | node           | packages/plugins/recorder/src/index.test.ts   | R-TOOLS  | retention over the tools and rpc (fake Date)                                                                    |
| 600 log as output, keyframes as image parts after the untrusted-data note                                                | node           | packages/plugins/recorder/src/index.test.ts   | R-PULL   | pull output shape with real Chromium render                                                                     |
| 652 logs only user-made input as typing: a script setting a value or a radio sibling unchecking is not typing            | node (table)   | packages/plugins/recorder/src/distill.test.ts | R-PULL   | missing row added: pure `distill()` over rrweb events; input rows only for `userTriggered: true`                |
| 689 renders no keyframes from a stream with no full snapshot                                                             | node           | packages/plugins/recorder/src/index.test.ts   | R-PULL   | real renderer edge                                                                                              |
| 703 holds the text log and no image when the renderer fails                                                              | node           | packages/plugins/recorder/src/index.test.ts   | R-PULL   | degrade path through pullWindow                                                                                 |
| 727 kept whole, also with a fresh full snapshot at its tail                                                              | node           | packages/plugins/recorder/src/index.test.ts   | R-STORE  | fits-under-cap row beside 263's trim                                                                            |
| 757 renders a short recording once into <id>.webm, one piece                                                             | node           | packages/plugins/recorder/src/index.test.ts   | R-VIDEO  | video export                                                                                                    |
| 767 several concurrent exports each answer a complete video                                                              | node           | packages/plugins/recorder/src/index.test.ts   | R-VIDEO  | same export, raced                                                                                              |
| 788 reads a stored video larger than the cap in pieces, past end, unknown                                                | node           | packages/plugins/recorder/src/index.test.ts   |          | chunked read                                                                                                    |
| 814 keeps the newest 50 when saves race the count cap                                                                    | node           | packages/plugins/recorder/src/index.test.ts   | R-RACE   | concurrent saves                                                                                                |
| 839 a save stays saved when pruning an old recording fails                                                               | node           | packages/plugins/recorder/src/index.test.ts   | R-RACE   | same store and cap, one injected failure                                                                        |
| 864 page flusher splits a burst into accepted flushes, client cap                                                        | node           | packages/plugins/recorder/src/index.test.ts   |          | client cap agrees with the engine cap                                                                           |
| 912 recorder skill loads and names the four tools                                                                        | node           | packages/plugins/recorder/src/index.test.ts   | R-TOOLS  | one assert in the tools journey                                                                                 |
| 989 closes its Chromium renderer and stops its sweep across reload and unload                                            | node           | packages/plugins/recorder/src/index.test.ts   |          | leak guard over plugin hot reload; reads ps for chromium pids (918)                                             |
| 1026 refused stop as tool error, render failure and unreadable video as rpc errors                                       | node           | packages/plugins/recorder/src/index.test.ts   |          | error mapping                                                                                                   |
| 1064 capture sweep: lease runs out, start after it, expired capture off, stop refused                                    | node           | packages/plugins/recorder/src/index.test.ts   | R-LEASE  | lease and capture TTL expiry (fake timers)                                                                      |
| 1095 capture control machine                                                                                             | node (table)   | packages/plugins/recorder/src/index.test.ts   |          | pure transitions; becomes an event to effects table                                                             |
| 1197 visibility pause machine                                                                                            | node (table)   | packages/plugins/recorder/src/index.test.ts   |          | pure transitions                                                                                                |
| 1235 capture session machine                                                                                             | node (table)   | packages/plugins/recorder/src/index.test.ts   |          | pure transitions                                                                                                |
| 1284 boot machine                                                                                                        | node (table)   | packages/plugins/recorder/src/index.test.ts   |          | pure transitions                                                                                                |
| 1334 flusher machine                                                                                                     | node (table)   | packages/plugins/recorder/src/index.test.ts   |          | pure transitions                                                                                                |
| 1398 panel machine                                                                                                       | node (table)   | packages/plugins/recorder/src/index.test.ts   |          | pure transitions                                                                                                |
| 1431 client rings keep eight clients, drop one idle thirty minutes                                                       | node           | packages/plugins/recorder/src/index.test.ts   |          | Effect service with TestClock                                                                                   |
| 1453 capture control model: lapsed lease from its own tick, append wait                                                  | node           | packages/plugins/recorder/src/index.test.ts   |          | Effect service with TestClock; lease half overlaps 1035                                                         |
| 1481 renderer cache shares, disposes after five idle minutes, relaunches                                                 | node           | packages/plugins/recorder/src/index.test.ts   |          | Effect service with TestClock                                                                                   |
| 1522 flusher model backoff 1, 2, 4 s up to 30 s, last chunk on dispose                                                   | node           | packages/plugins/recorder/src/index.test.ts   |          | Effect runtime with TestClock                                                                                   |
| 1575 visibility pause model 30 s, not 29                                                                                 | node           | packages/plugins/recorder/src/index.test.ts   |          | timing wiring around the 1128 machine                                                                           |
| 1614 capture session model ignores a config read after a second pause                                                    | node           | packages/plugins/recorder/src/index.test.ts   |          | wiring around 1150; same behaviour as 1150:1157 and recorder.it 540                                             |
| 1657 boot model ignores a prepare that lands after the selector moved                                                    | node           | packages/plugins/recorder/src/index.test.ts   |          | wiring around 1180; same behaviour as 1180:1188                                                                 |
| 1687 player follow resubscribes one second after a drop from its cursor                                                  | node           | packages/plugins/recorder/src/index.test.ts   |          | Effect stream with TestClock                                                                                    |
| 1719 panel model renews lease every 7 s, drops on close, one job at a time                                               | node           | packages/plugins/recorder/src/index.test.ts   |          | Effect runtime with TestClock                                                                                   |

Totals (36, with recorder 652 added): node 28, node (table) 7, DELETE-NOTHING 1. Merges:

- R-STORE (2 to 1), R-TOOLS (3 to 1), R-PULL (3 to 1), R-VIDEO (2 to 1), R-RACE (2 to 1), R-LEASE (2 to 1);
- the six machine tests become event-to-effect tables beside their machine files.

### packages/plugins/recorder/test/recorder.it.test.ts (11 tests; a real-browser suite despite the .it. name)

| test                                                                                                                 | destination  | target                                                  | merge-id  | why                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 109 active plugin with a browser part; tab loading, empty, replays the page; agent start while offline               | browser mode | packages/plugins/recorder/src/recorder.browser.test.tsx | R-TAB     | page reload and the rrweb replay iframe that rebuilds the host page; the "agent start while offline" step is a connection fault and is not carried                                                           |
| 171 follows live: append race, appends while the socket was down, failed since resumes                               | browser mode | packages/plugins/recorder/src/recorder.browser.test.tsx | R-TAB     | live append race and replay iframe; the appends while the socket was down and the failed since are connection faults and are not carried                                                                     |
| 238 send to agent: note chip, hidden reference, plays after reload, last click saved                                 | browser mode | packages/plugins/recorder/src/recorder.browser.test.tsx | R-SEND    | page reload, toBeInViewport of the replay controls, replay iframe                                                                                                                                            |
| 491 captures nothing idle, real click and typing, strips scripts and conciv styles, samples typing, quiet after stop | browser mode | packages/plugins/recorder/src/recorder.browser.test.tsx | R-CAPTURE | rrweb captures the real host page next to the built bundle                                                                                                                                                   |
| 540 pauses while hidden, resumes; a stale resume never attaches a second recorder                                    | browser mode | packages/plugins/recorder/src/recorder.browser.test.tsx | R-CAPTURE | same capture of the host page; page clock                                                                                                                                                                    |
| 586 stop overtaken by a newer start; failed flush events kept in order                                               | node         | packages/plugins/recorder/src/flusher-machine.test.ts   | R-CAPTURE | ruled out: a failed flush over the socket is a socket fault. The flusher machine is fed a newer start over a stop and a failed flush result, and keeps the events in order; the real page flush stays in 491 |
| 653 replay LIVE badge, scrub, GO LIVE, pause and play, no Solid store write                                          | browser mode | packages/plugins/recorder/src/recorder.browser.test.tsx | R-TAB     | rrweb player timeline and replay iframe                                                                                                                                                                      |
| 716 start outlasting the attach deadline answers unattached; later start records                                     | browser mode | packages/plugins/recorder/src/recorder.browser.test.tsx | R-LIBRARY | lazy rrweb chunk loading exists only in the built bundle                                                                                                                                                     |
| 754 recording unavailable when the capture library fails to load                                                     | node         | packages/plugins/recorder/src/boot-machine.test.ts      | R-LIBRARY | ruled out: a capture library that fails to load is a chunk fault. The boot machine is fed the load failure and answers unavailable; the message on screen is not carried                                     |
| 767 player could not load with Retry; Retry replays after the page reloads                                           | browser mode | packages/plugins/recorder/src/recorder.browser.test.tsx | R-LIBRARY | Retry reloads the page; chunk loader                                                                                                                                                                         |
| 793 restoring the Recorder tab once the plugin is gone lands on chat                                                 | happy-dom    | apps/conciv/src/runtime/plugin/panels.dom.test.tsx      |           | shell route restore for a missing plugin pane; a remount over the same state root, no layout                                                                                                                 |

Totals (11): browser mode 8, node 2, happy-dom 1.

- The 8 browser rows become `packages/plugins/recorder/src/recorder.browser.test.tsx`, in three journeys: R-TAB, R-SEND
  and R-CAPTURE.
- 586 and 754 become node tests of `flusher-machine.ts` and `boot-machine.ts`.
- 793 moves to `apps/conciv/src/runtime/plugin/panels.dom.test.tsx`.

### Duplicates suspected (within the slice)

- recorder.test 513 (its start-without-a-page step waits 5 s for "no page client attached within 5s") and recorder.it 716 assert the same message; keep the node
  one with the wait made an option, and let 716 keep only the late-library recovery.
- Stale config read after a second pause, three levels:
  - recorder.test 1235 (machine);
  - recorder.test 1614 (model);
  - recorder.it 540 (browser).

  1614 folds into a wiring row; the browser one stays as the only end-to-end proof.

- Stale prepare after the selector moved: recorder.test 1284 (machine) and 1657 (model).
- Lease lapse appears three times: recorder.test 1095 (machine), 1453 (model) and 1064 (engine). Keep the machine and
  engine rows. Drop the lease half of 1453 and keep its append-wait half.
- Flusher: 1334 (oversized drop) and 864 (client cap drop through the engine). Keep both; 864 proves the client and engine
  caps agree.
- Panel one-job-at-a-time: 1398 (machine) and 1719 (model).
- Visibility pause: 1197 (machine) and 1575 (30 s timing); complementary, not duplicate.
- recorder.it 491 pull text overlaps recorder.test 513 (engine pull of the same click log). Not a delete: 491's own proof
  is the real capture.
- ios: two pairs of the bridge machine and driver test the same thing at two levels, pure transitions and clocked wiring.
  Keep both:
  - machine 1040 and driver 1234 (announce until handshake);
  - machine 1152 and driver 1264 (timeout settle).
- The recorder cards (2674, removed by 74c08ec2e) become `packages/plugins/recorder/src/recording-card.stories.tsx`.

### What cannot move to happy-dom though it looks like it could

- recorder.it 238 send-to-agent: the save error message, the composer note chip and the hidden transcript reference could
  run in happy-dom. But the same journey needs the replay dialog (rrweb player in an iframe), `toBeInViewport` and a page
  reload, so it stays in browser mode.
- recorder.it 491 and 540: rrweb record over happy-dom is the blocker. It reads stylesheets (CSSOM), computed styles,
  iframes and input values, which happy-dom only partly supports. The test proves that real script and conciv style nodes
  are stripped from the host page.
- recorder.it 540 sets `document.visibilityState` on the test page; allowed as the event a user causes by switching tabs.
- recorder.it 653 reads aria-valuemax with getAttribute; rewrite to the slider's accessible value.
- rrweb-player builds an iframe document and scales it with real layout (ResizeObserver, getBoundingClientRect). Its
  timeline is a slider fed by requestAnimationFrame timing.
- ios has no UI tests: the native page (bridge.ts) is proven only in node.

Rule breaks to fix in the rewrite:

- recorder.test 513 waits the real 5 s START_WAIT_MS;
- recorder.test.ts:948 reads the process table with ps;
- recorder.it carries 60+ inline 30 s timeouts and per-test 120 s timeouts;
- recorder.test 260 is a 200-line test proving about 14 behaviours.

---

## Section D: tanstack, test-runner, try-it

Line numbers are the `it(`/`test(` call line at `9d4f4834f`. The test-runner audit is stale: the old test-runner.test.ts also holds a
run machine, a follow machine and a fake-spawner driver suite (lines 341-635). try-it has no audit.

### 1. packages/plugins/tanstack/test/tanstack.test.ts (10 tests)

| test                                                                                                                        | destination | target                                           | merge-id    | why                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 126 is active, lists for code mode, loads its skill, reads the route manifest and tells the model why a tool failed         | node        | packages/plugins/tanstack/src/index.test.ts      | TS-SURFACE  | engine surface, skill, manifest (quoted and $param), ENOENT and bundler-unavailable wording; keep ONE `conciv plugin call` round trip, drop the other four (CLI owned by cli tests)                                                                                                        |
| 231 offers its 3 engine tools while the browser tools are denied and no tab is listed                                       | node        | packages/plugins/tanstack/src/index.test.ts      | TS-ATTACH   | first step of the attach journey at 288                                                                                                                                                                                                                                                    |
| 240 refuses an attach to a session that was never created or was deleted                                                    | node        | packages/plugins/page/src/index.test.ts          | PAGE-ATTACH | the refusal is the page plugin's `attach` (plugins/page/src/connection.ts:460), not tanstack code; no page test proves it today                                                                                                                                                            |
| 292 grants the browser tools to that session only, carries each call to the focused tab, answers with the page result       | node        | packages/plugins/tanstack/src/index.test.ts      | TS-ATTACH   | session-scoped grant, relay, `[tanstack.x] ... untrusted` wording, spoofed codes; the generic relay steps (abort sends cancel, unfocused tab routing, disconnected_after_dispatch, replaced attach) belong to the page plugin, prove them once in packages/plugins/page and trim them here |
| 397 times out a page that never answers and cancels the call on the page                                                    | node        | packages/plugins/page/src/index.test.ts          | PAGE-ATTACH | no page attached is a real state, not a fault: the call times out with `pageReplyTimeoutMs` set short. The cancel on the page needs an attached page that never answers, a fault, and is not carried                                                                                       |
| 414 reads a real transform error and decodes server-function requests, also under a basepath                                | node        | packages/plugins/tanstack/src/index.test.ts      |             | only real-Vite proof of build_errors and server_fn_trace                                                                                                                                                                                                                                   |
| 473 packs without the workspace protocol, installs from tarballs and loads as a plugin (tag packed)                         | node        | packages/plugins/tanstack/src/index.test.ts      |             | packed-install proof, stays tagged `packed`                                                                                                                                                                                                                                                |
| 534 fails its activation with Tanstack.InvalidOptions                                                                       | node        | packages/plugins/tanstack/src/index.test.ts      |             | options validation surfaces as a failed plugin and rpc.unavailable                                                                                                                                                                                                                         |
| 550 waits the set time on the test clock for a dev server, then fails BUNDLER_UNAVAILABLE                                   | node        | packages/plugins/tanstack/src/index.test.ts      |             | Effect layer under TestClock, not a pure function, so node rather than unit                                                                                                                                                                                                                |
| 570 fails for a route id no match carries and names the matched route ids, and answers null data for a route with no loader | node        | packages/plugins/tanstack/src/operations.test.ts | -           | missing row added: `execute('loader_data')` over a real memory-history router; an unknown route id fails with `handler_error` naming the matched ids, a loader-less route answers `data: null`                                                                                             |

Totals (10, with tanstack 570 added): node 10.

- 8 go to `packages/plugins/tanstack/src` (`index.test.ts`, `operations.test.ts`).
- 2 go to `packages/plugins/page/src/index.test.ts`: 240 (attach refused) and 397 (no page attached times out).
- The tanstack tests become about 6: surface (126), attach journey (231+292), real Vite (414), packed (473), bad option
  (534), bundler wait (550).

### 1. packages/plugins/tanstack/test/tanstack.browser.test.ts (1 test)

| test                                                                                                                               | destination  | target                                                  | merge-id | why                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 128 shows its chip ... lists the new path of a tab whose router mounted after it attached (one 190-line test, about 15 behaviours) | browser mode | packages/plugins/tanstack/src/tanstack.browser.test.tsx |          | needs the built bundle in a host page running a real React TanStack app, three tabs at once (cross-tab listing), real `pageerror` events and in-page navigation; split into two journeys: (a) router reads, navigation, loader and query cache, redaction; (b) handler error, thrown error, fifty-error ordering, router-less tab, late-mounted router |

Totals: browser mode 1, in `packages/plugins/tanstack/src/tanstack.browser.test.tsx`, split into two journeys.

### 1. packages/plugins/test-runner/test/test-runner.test.ts (10 tests)

| test                                                                                                                                                    | destination  | target                                                  | merge-id      | why                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 197 is active, lists for code mode, offers run and status as direct tools, lists, runs, streams live, reports status, stops on rpc stop and engine stop | node         | packages/plugins/test-runner/src/index.test.ts          | TR-VITEST     | engine contract over a real vitest child                                                                                                                                                                     |
| 269 answers UNAVAILABLE when vitest is missing, names the exit code or the signal when the child dies silently                                          | node         | packages/plugins/test-runner/src/index.test.ts          | TR-VITEST     | "vitest missing" becomes the opening step of 197 (before node_modules is linked); exit-code and signal naming is already proven by 394 (unit) and 580 (driver), so the two `vitest.config.ts` crash steps go |
| 287 answers UNAVAILABLE without playwright, lists, runs, runs a pattern, removes its report when stopped mid-test                                       | node         | packages/plugins/test-runner/src/index.test.ts          |               | only playwright adapter proof; pass env to the spawn instead of mutating process.env (withChildEnvironment)                                                                                                  |
| 330 fails only this plugin and leaves the engine up (jest)                                                                                              | node         | packages/plugins/test-runner/src/index.test.ts          |               | runner-registry failure isolation, cheap                                                                                                                                                                     |
| 365 runs a child to its run-end, publishing each event and settling with the finished run                                                               | node (table) | packages/plugins/test-runner/src/run-machine.test.ts    | TR-RUNMACHINE | pure transitionRun; one it.each table of event sequences to state and effects                                                                                                                                |
| 394 names the reason a run could not start, until the next run-start                                                                                    | node (table) | packages/plugins/test-runner/src/run-machine.test.ts    | TR-RUNMACHINE | pure; table rows                                                                                                                                                                                             |
| 422 lists files, ignores stale attempts, refuses a second request while busy and stops the running child                                                | node (table) | packages/plugins/test-runner/src/run-machine.test.ts    | TR-RUNMACHINE | pure; table rows                                                                                                                                                                                             |
| 470 on dispose kills the running child, settles its caller and refuses every later request                                                              | node (table) | packages/plugins/test-runner/src/run-machine.test.ts    | TR-RUNMACHINE | pure; table rows                                                                                                                                                                                             |
| 493 reads the run on each connect, applies only the newest read, forwards live events and stops when disposed                                           | node (table) | packages/plugins/test-runner/src/follow-machine.test.ts |               | pure transitionFollow; table rows                                                                                                                                                                            |
| 591 runs, streams, warns on a non-message line, reports a failed start and a signal, lists, stops a hanging run and settles callers on dispose          | node         | packages/plugins/test-runner/src/index.test.ts          |               | driver over a fake ChildProcessSpawner (a real fake, not a mock); only proof of the warn-on-bad-line log                                                                                                     |

Totals: node 5, node (table) 5: one run-machine table (TR-RUNMACHINE, 4 rows) and one follow-machine table. Targets are
`index.test.ts`, `run-machine.test.ts`, `follow-machine.test.ts` and `view.test.ts` in packages/plugins/test-runner/src.

### 1. packages/plugins/test-runner/test/test-runner.browser.test.ts (4 tests)

| test                                                                                                                                                           | destination  | target                                                                 | merge-id | why                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 50 lists the Tests tab, shows a failed start, a run the agent starts live, the run so far after a reload, its summary, opens a failing test and prefills a fix | happy-dom    | packages/plugins/test-runner/src/test-runner.dom.test.tsx              |          | panel needs no layout; the reload becomes a remount over the same engine (the read-on-connect logic is unit 484); the 360 px viewport step only checks the tab is visible, drop it; the open-file check reads the engine call instead of the rpc observer |
| 133 draws a finished run in the thread: summary, files as keyboard disclosures, failure that opens its file and prefills a fix                                 | happy-dom    | packages/plugins/test-runner/src/test-runner.dom.test.tsx              | TR-CARD  | card UI lives in the plugin; keyboard toggling of disclosures is user-event Tab/Enter/Space (see section 4 risk)                                                                                                                                          |
| 225 streams the run the agent starts into its card: in progress, then finished                                                                                 | happy-dom    | packages/plugins/test-runner/src/test-runner.dom.test.tsx              | TR-CARD  | no chat hold (ruled out): the card is in progress while the real test run runs, then finished. The remount while `chat.join` is held is not carried; the "no /chat-ws or /chat-sse" assert belongs to the shell transport (app.md)                        |
| 338 prefills a fix that names the project-relative file when two failing files share their last two segments                                                   | node (table) | packages/plugins/test-runner/src/view.test.ts relativePath + fixPrompt |          | the path rule is pure; the click wiring is already in 133                                                                                                                                                                                                 |

Totals: happy-dom 3 (two merged as TR-CARD), node (table) 1. The happy-dom rows become
`packages/plugins/test-runner/src/test-runner.dom.test.tsx` on `createEngine` + `mount`.

### 1. packages/plugins/test-runner/test/fixtures/** (9 fixture tests, not suite tests)

These are input apps the runner executes in a temp project. The package suite does not collect them. They existed at
`9d4f4834f` and were deleted with the old tests; they are written again under `packages/plugins/test-runner/fixtures/`
(Decision P4).

| test                                                               | destination | target                                                                                                                     | merge-id | why                                |
| ------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------- |
| playwright-app/blocked.spec.ts:6 blocks until the run is stopped   | FIXTURE     | packages/plugins/test-runner/fixtures/playwright-app (fixtures were deleted with the old tests; written again outside src) |          | stop-mid-test input for 287        |
| playwright-app/browser.spec.ts:3 renders content in a real browser | FIXTURE     | packages/plugins/test-runner/fixtures/playwright-app (fixtures were deleted with the old tests; written again outside src) |          | real-browser run input for 287     |
| playwright-app/fail.spec.ts:3 this fails on purpose                | FIXTURE     | packages/plugins/test-runner/fixtures/playwright-app (fixtures were deleted with the old tests; written again outside src) |          | failure input                      |
| playwright-app/pass.spec.ts:3 one plus one                         | FIXTURE     | packages/plugins/test-runner/fixtures/playwright-app (fixtures were deleted with the old tests; written again outside src) |          | pass input                         |
| playwright-app/pass.spec.ts:8 two plus two                         | FIXTURE     | packages/plugins/test-runner/fixtures/playwright-app (fixtures were deleted with the old tests; written again outside src) |          | nested describe input              |
| vitest-app/fail.test.ts:3 this fails on purpose                    | FIXTURE     | packages/plugins/test-runner/fixtures/vitest-app (fixtures were deleted with the old tests; written again outside src)     |          | failure input                      |
| vitest-app/pass.test.ts:3 one plus one                             | FIXTURE     | packages/plugins/test-runner/fixtures/vitest-app (fixtures were deleted with the old tests; written again outside src)     |          | pass input                         |
| vitest-app/pass.test.ts:8 shares a title                           | FIXTURE     | packages/plugins/test-runner/fixtures/vitest-app (fixtures were deleted with the old tests; written again outside src)     |          | distinct-id-for-shared-title input |
| vitest-app/pass.test.ts:14 shares a title                          | FIXTURE     | packages/plugins/test-runner/fixtures/vitest-app (fixtures were deleted with the old tests; written again outside src)     |          | same                               |

Also inline fixture sources (template strings, no rows): test-runner.test.ts:59 BLOCKED_VITEST_TEST and
test-runner.browser.test.ts:21 GATED_VITEST_TEST. The gated test still works in happy-dom: it watches the temp project
dir, not a browser.

### 1. packages/plugins/try-it/test/try-it.test.ts (17 tests)

| test                                                                                                    | destination  | target                                                                                             | merge-id      | why                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 31 finds a token-gated core on any candidate port                                                       | node         | packages/plugins/try-it/src/plugin-experimental.test.ts                                            | TRYIT-PROBE   | real http servers on loopback; one it.each with 37                                                                                                  |
| 37 resolves null when nothing answers                                                                   | node         | packages/plugins/try-it/src/plugin-experimental.test.ts                                            | TRYIT-PROBE   | row of the same table                                                                                                                               |
| 56 starts probing with one unspaced first sweep                                                         | node (table) | packages/plugins/try-it/src/connect-machine.test.ts                                                | TRYIT-MACHINE | pure transitionConnect; table row                                                                                                                   |
| 63 a first sweep that answers connects at once, with no hold                                            | node (table) | packages/plugins/try-it/src/connect-machine.test.ts                                                | TRYIT-MACHINE | table row                                                                                                                                           |
| 70 a silent first sweep starts the slow hint and a spaced sweep, a later answer holds before connecting | node (table) | packages/plugins/try-it/src/connect-machine.test.ts                                                | TRYIT-MACHINE | table row                                                                                                                                           |
| 89 the slow hint marks probing slow once                                                                | node (table) | packages/plugins/try-it/src/connect-machine.test.ts                                                | TRYIT-MACHINE | table row                                                                                                                                           |
| 95 copying marks probing and holding copied, once                                                       | node (table) | packages/plugins/try-it/src/connect-machine.test.ts                                                | TRYIT-MACHINE | table row                                                                                                                                           |
| 103 stale attempts return the same state object                                                         | node (table) | packages/plugins/try-it/src/connect-machine.test.ts                                                | TRYIT-MACHINE | table row                                                                                                                                           |
| 114 events that do not apply return the same state object                                               | node (table) | packages/plugins/try-it/src/connect-machine.test.ts                                                | TRYIT-MACHINE | table row                                                                                                                                           |
| 136 disposal ends every state, and nothing applies after it                                             | node (table) | packages/plugins/try-it/src/connect-machine.test.ts                                                | TRYIT-MACHINE | table row                                                                                                                                           |
| 209 a core that answers the first sweep is connected at once, with no hold                              | node         | packages/plugins/try-it/src/plugin-experimental.test.ts                                            | TRYIT-DRIVER  | Effect driver under TestClock with a probe layer the driver accepts as its service (a real implementation, not a mock); journey: first-sweep answer |
| 223 a core that answers a later sweep is held for holdMs before the hand-off                            | node         | packages/plugins/try-it/src/plugin-experimental.test.ts                                            | TRYIT-DRIVER  | journey: silent, retry, hold, connect                                                                                                               |
| 243 retries a silent sweep every probeMs until a core answers                                           | node         | packages/plugins/try-it/src/plugin-experimental.test.ts                                            | TRYIT-DRIVER  | same journey as 207 (retry spacing step)                                                                                                            |
| 258 hints that setup is slow once no core has answered for slowMs                                       | node         | packages/plugins/try-it/src/plugin-experimental.test.ts                                            | TRYIT-DRIVER  | journey: slow hint                                                                                                                                  |
| 282 an answer ends the slow hint, nothing dispatched at slowMs once probing is over                     | node         | packages/plugins/try-it/src/plugin-experimental.test.ts                                            | TRYIT-DRIVER  | journey: slow hint then answer, copied while holding                                                                                                |
| 301 dispatches copied into the state                                                                    | DELETE-DUP   | try-it.test.ts:282 (dispatch of copied through the driver) and :95 (copied while probing, machine) |               | the driver wiring of dispatch is already proven by 266                                                                                              |
| 316 closing its scope disposes the state and interrupts every sweep and timer                           | node         | packages/plugins/try-it/src/plugin-experimental.test.ts                                            | TRYIT-DRIVER  | dispose step                                                                                                                                        |

Totals: node 8 (2 probe table, 6 driver), node (table) 8 (one table), DELETE-DUP 1. Targets are
`connect-machine.test.ts` and `plugin-experimental.test.ts` in packages/plugins/try-it/src. They become one probe table,
one machine table and about 3 driver journeys:

- first answer;
- silent, retry, hold, slow hint, copied;
- dispose.

### 1. packages/plugins/try-it/test/try-it.browser.test.ts (3 tests)

| test                                                                                               | destination  | target                                                | merge-id      | why                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 118 covers the panel with the connect steps, then hands off in place to the core that answers      | happy-dom    | packages/plugins/try-it/src/connect-pane.dom.test.tsx | TRYIT-HANDOFF | steps, npx command, "Agent connected" while holding, hand-off to the composer need no layout; one journey with app.md's conciv.browser:4792 row, which app.md also places in this file; the reload step becomes a remount (first-sweep answer is node (table) 63 + node 209) |
| 158 a denied local-network permission replaces the waiting line, and granting it restores the wait | browser mode | packages/plugins/try-it/src/try-it.browser.test.tsx   |               | needs Chromium's real local-network-access permission set over CDP (`Browser.setPermission`) and the permission change event; happy-dom has no such permission                                                                                                               |
| 185 stops probing once the widget is unmounted                                                     | happy-dom    | packages/plugins/try-it/src/connect-pane.dom.test.tsx | TRYIT-HANDOFF | unmount closes the driver scope; count probes on the loopback ledger; the scope-close logic itself is try-it.test.ts:300                                                                                                                                                     |

Totals: happy-dom 2, browser mode 1.

- The permission test (158) becomes `packages/plugins/try-it/src/try-it.browser.test.tsx`; fix its missing `finally`.
- 118 and 185 become `packages/plugins/try-it/src/connect-pane.dom.test.tsx`.

### Per-slice totals

| file                        | rows | node | node (table) | happy-dom | browser mode | DELETE | FIXTURE |
| --------------------------- | ---- | ---- | ------------ | --------- | ------------ | ------ | ------- |
| tanstack.test.ts            | 10   | 10   |              |           |              |        |         |
| tanstack.browser.test.ts    | 1    |      |              |           | 1            |        |         |
| test-runner.test.ts         | 10   | 5    | 5            |           |              |        |         |
| test-runner.browser.test.ts | 4    |      | 1            | 3         |              |        |         |
| test-runner fixtures        | 9    |      |              |           |              |        | 9       |
| try-it.test.ts              | 17   | 8    | 8            |           |              | 1 DUP  |         |
| try-it.browser.test.ts      | 3    |      |              | 2         | 1            |        |         |
| total                       | 54   | 23   | 14           | 5         | 2            | 1      | 9       |

### 3. Duplicates across files (this slice and neighbours)

- try-it.browser.test.ts:185 and try-it.test.ts:316: the scope-close logic is 316; 185 keeps only the unmount wiring.
- try-it.test.ts:301 duplicates :282 (driver dispatch) plus :95 (machine).
- test-runner.test.ts:269 exit-code/signal naming duplicates :394 (machine) and :580 (driver, SIGKILL).
- test-runner.browser.test.ts:225 and :133: same card, merged (TR-CARD).
- tanstack.test.ts:231 is the opening of :292 (TS-ATTACH).
- tanstack.test.ts:240 and :397 prove page plugin behaviour, so they go to packages/plugins/page: 240 is the attach
  refusal, 397 the reply timeout. The generic relay steps inside :292 go there too.
- The tanstack cards (2582, removed by 38352bbc7) become `packages/plugins/tanstack/src/plugin-experimental.stories.tsx`.
  The test proved card rendering, not the page operations that tanstack.browser 128 proves, so it is no duplicate of 128.

### 4. What cannot move to happy-dom, and suspected blockers

- tanstack.browser 128 stays in browser mode. It needs a real React app with TanStack Router and Query on the test page,
  three tabs attached at once, and page errors from thrown handlers and unhandled rejections. The page plugin's tab
  identity, focus and visibility state, and error capture are window-level.
- try-it.browser 158 needs Chromium's local-network-access permission; no happy-dom equivalent.
- try-it 118 and 185 in happy-dom: the probe fetches 127.0.0.1 ports in the connect range
  (CONNECT_FIRST_PORT..CONNECT_LAST_PORT). The tests bind real connect ports, so parallel test files can collide; the
  port range needs to be a plugin option. The "Copy" step in the connect pane hits the clipboard (happy-dom clipboard is
  partial).
- test-runner card 133 keyboard steps (Shift+Tab twice, Enter, Space, Tab, Enter) rely on real tab order and Ark
  Collapsible keyboard handling. If they flake in happy-dom, click the disclosure triggers instead, and leave keyboard
  toggling to a story play on the kit disclosure.
- test-runner panel 50 and card 225: the reload becomes a remount over the same engine. That proves the plugin state
  survives, but not a real page reload, which only e2e proves.
- test-runner.test.ts withChildEnvironment mutates process.env for the child spawn: unsafe once tests share a worker;
  pass the env as an option.

---

## Section E: whiteboard (packages/plugins/whiteboard)

Line numbers are lines at `9d4f4834f`. The audit (51708bc06) is stale: it lists 9 node tests and 1 browser test, and the
old files hold 18 node tests and 4 browser tests. At `9d4f4834f` a third file, `src/canvas-tools.test.ts`, holds one more
test, added as a row below. The audit's 703 rule break (real 10 s export and 15 s commit deadlines) still stands, at line 795. canvas-tools.test.ts:41 already proves both timeouts on short deadlines.

Every target below is in `@conciv/plugin-whiteboard` (packages/plugins/whiteboard/src).

### 1. packages/plugins/whiteboard/test/whiteboard.test.ts (18 tests) and src/canvas-tools.test.ts (1 test)

| test                                                                                                                                                 | destination  | target                                                          | merge-id      | why                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 341 the whiteboard plugin > is active, serves its browser bundle, offers its twenty-two tools                                                        | node         | packages/plugins/whiteboard/src/index.test.ts                   | M-WB-TOOLS    | a surface check that becomes the first step of the canvas tools journey                                                                                                                                                    |
| 359 store and rpc > keeps rows per room, reads one by id, refuses foreign or empty updates, gates element versions                                   | node         | packages/plugins/whiteboard/src/index.test.ts                   | M-WB-STORE    | only proof that room and id smuggling is refused, plus version conflicts and canvas_read order by index                                                                                                                    |
| 473 store and rpc > one tab at a time claims a pending row, an outlived lease can be taken again                                                     | node         | packages/plugins/whiteboard/src/index.test.ts                   | M-WB-STORE    | the claim lease over the real rpc; fake Date is allowed                                                                                                                                                                    |
| 492 store and rpc > keeps its board in the plugin storage of the state root, a second engine reads it back                                           | node         | packages/plugins/whiteboard/src/index.test.ts , per-test engine | -             | persistence across an engine restart; also proves a held anchor file does not block shutdown                                                                                                                               |
| 537 store and rpc > announces changes with a per-room cursor, answers since, broadcasts a live cursor without storing it, throttles the agent cursor | node         | packages/plugins/whiteboard/src/index.test.ts                   | M-WB-FEED     | the wire contract the second tab's catch-up reads                                                                                                                                                                          |
| 604 canvas tools > draws into the draft through an open canvas, previews, exports, commits and discards                                              | node         | packages/plugins/whiteboard/src/index.test.ts                   | M-WB-TOOLS    | engine side of every draw tool, and the svg colour injection guard in preview                                                                                                                                              |
| 669 canvas tools > leaves an abandoned draft when a turn is stopped, commits it when a turn finishes                                                 | node         | packages/plugins/whiteboard/src/index.test.ts                   | -             | only proof that the turn end decides the draft fate                                                                                                                                                                        |
| 699 comment tools > creates, replies, reads, lists, moves comments with the agent cursor, sets pin state, asks before delete/clear/resolve/remove    | node         | packages/plugins/whiteboard/src/index.test.ts                   | M-WB-COMMENTS | only plugin side proof of comment tools and their approval asks (reject, always, once)                                                                                                                                     |
| 795 comment tools > raises each failure to the caller with its message                                                                               | node         | packages/plugins/whiteboard/src/index.test.ts                   | M-WB-TOOLS    | the message table stays (it.each of tool, input, message); drop lines 808 and 810, which wait out the real 10 s and 15 s deadlines and are already proven by canvas-tools.test.ts:41                                       |
| 815 anchors > locates a component, anchors a comment, follows a move, loses a change, enriches an inserted comment                                   | node         | packages/plugins/whiteboard/src/index.test.ts                   | -             | only proof of source anchors over real project files                                                                                                                                                                       |
| 881 pending request machine > waits for the deadline, follows a claim lease, ignores stale attempts, ends once                                       | node (table) | packages/plugins/whiteboard/src/index.test.ts                   | -             | pure transition function; becomes an it.each of (state, event, expected)                                                                                                                                                   |
| 972 pending request driver on the test clock > unclaimed at the deadline, waits out a lease, times out commit and export                             | node         | packages/plugins/whiteboard/src/index.test.ts                   | -             | Effect driver over in-memory storage on TestClock; owns the commit and export timeouts                                                                                                                                     |
| 1024 change feed machine > reads the position, catches up, routes newer changes, reloads, disposed once                                              | node (table) | packages/plugins/whiteboard/src/index.test.ts                   | -             | pure transition function; it.each rows                                                                                                                                                                                     |
| 1089 change feed driver on the test clock > retries with backoff, catches up, routes per table, reloads, disposes                                    | node         | packages/plugins/whiteboard/src/index.test.ts                   | -             | Effect driver on TestClock, no DOM                                                                                                                                                                                         |
| 1177 canvas drain machine > claims each row once, runs then removes, forgets a refused claim, ignores stale, stops on dispose                        | node (table) | packages/plugins/whiteboard/src/index.test.ts                   | -             | pure transition function; it.each rows                                                                                                                                                                                     |
| 1222 canvas scene versions > applies a remote change once, never echoes it, writes only real local edits                                             | node (table) | packages/plugins/whiteboard/src/index.test.ts                   | -             | pure version bookkeeping; it.each rows (seed, remote newer, echo, local edit, own write back, lost tie, removed)                                                                                                           |
| 1259 canvas drain driver on the test clock > removes after every exit, retries a failed removal, re-claims a refused row, disposes                   | node         | packages/plugins/whiteboard/src/index.test.ts                   | -             | Effect driver on TestClock                                                                                                                                                                                                 |
| 1331 commit replay on the test clock > first element at once, next after a step, rest at once when skipped                                           | node         | packages/plugins/whiteboard/src/index.test.ts                   | -             | Effect driver on TestClock                                                                                                                                                                                                 |
| canvas-tools.test.ts:41 gives up a commit and an export after the short deadlines it is handed                                                       | node         | packages/plugins/whiteboard/src/canvas-tools.test.ts            | -             | missing row added (file src/canvas-tools.test.ts at 9d4f4834f, no section before): `commitDraft` and `exportPng` on TestClock fail with `COMMIT_TIMEOUT` and `EXPORT_TIMEOUT` once the deadlines passed as options run out |

Count: 19 rows (18 from whiteboard.test.ts, 1 from src/canvas-tools.test.ts).

#### 2. Totals

node 15 (in 5 journeys: M-WB-STORE 2, M-WB-FEED 1, M-WB-TOOLS 3, M-WB-COMMENTS 1, plus single tests), node (table) 4.
No whole test is deleted. Two lines inside 795 (808 and 810) are DELETE-DUP of canvas-tools.test.ts:41.

What the file becomes:

- Rows target `src/index.test.ts` on `createEngine({plugins: [whiteboard]})`. A tool is called with
  `engine.session.tool(name).call(input)`, and `.failure(input)` reads the typed failure. These replace the local `boot`,
  `call`, `failureType`, `rejection` and `useTool`.
- 341 folds into 604.
- The four machine tests become `it.each` tables beside their machine files.
- It runs about 25 s faster once 808 and 810 go.

### 1. packages/plugins/whiteboard/test/whiteboard.browser.test.ts (4 tests)

Each test is a long chain, so the rows below give the test row first and then its segments with their own destination. The test row's destination is where the bulk goes.

| test                                                                                                                                                                                                                                                        | destination                                                   | target                                                                             | merge-id         | why                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 182 canvas > opens from the pill, draws with keyboard and pointer, drags in few writes, closes on Escape, reopens, converts agent drawings, commits, exports, caps svg, second tab catches up, outlives a minimized chat, failed load toasts                | browser mode                                                  | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx, split into 3 journeys | M-WB-CANVAS      | the only proof of the real Excalidraw canvas; the "failed load toasts" step is a chunk fault and moves to 677-711                                                                               |
| . 199-245 pill opens canvas, 'r' + drag draws 160x120, single drag in few upserts, group drag in bulk writes                                                                                                                                                | browser mode (canvas, pointer geometry)                       | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx (journey 1)            | M-WB-CANVAS      | pointer drags on the canvas                                                                                                                                                                     |
| . 247-279 Escape closes while a turn runs, composer keeps focus, agent draw lands in draft while closed, reopen keeps drawing                                                                                                                               | browser mode (real focus, canvas)                             | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx (journey 1)            | M-WB-CANVAS      | toBeFocused on the composer after close                                                                                                                                                         |
| . 281-320 Escape on chat layers keeps the canvas; main menu stays open while picking background, closes on a canvas click                                                                                                                                   | browser mode (canvas click at coordinates)                    | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx (journey 1)            | M-WB-CANVAS      | Excalidraw's own menu over the canvas                                                                                                                                                           |
| . 322-400 agent draw/svg/mermaid convert; hostile svg never runs script; canvasPending.remove failure; malformed and undrawable svg refused                                                                                                                 | browser mode (canvas)                                         | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx (journey 2)            | M-WB-CANVAS      | conversion runs in the page island against Excalidraw; script safety needs a real document. The canvasPending.remove failure is a fault and is not carried                                      |
| . 402-426 a slow draft write; a session with no canvas is refused                                                                                                                                                                                           | DELETE-DUP for the refusal only                               | whiteboard.test.ts:807 and :665                                                    | M-WB-CANVAS      | "no canvas is open to draw into" is proven in node; the slow write gate is a held socket call and is not carried                                                                                |
| . 428-476 garbled live writes keep the draft, commit, PNG export, dense svg capped at 500, degenerate path skipped                                                                                                                                          | browser mode (canvas)                                         | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx (journey 2)            | M-WB-CANVAS      | export renders the real canvas to PNG; the garbled live writes are a socket fault and are not carried                                                                                           |
| . 478-662 second tab: position read, reconnect catch-up after a failed since, concurrent move tie-break, erase, draw-once export                                                                                                                            | browser mode (cross-tab, canvas)                              | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx (journey 3)            | M-WB-CANVAS      | two real pages over one engine; the reconnect catch-up after a failed since is a connection fault and is not carried                                                                            |
| . 664-675 text tool writes, canvas outlives a minimized chat                                                                                                                                                                                                | browser mode (canvas)                                         | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx (journey 1)            | M-WB-CANVAS      |                                                                                                                                                                                                 |
| . 677-711 failed chunk load toasts once per open, logs once, retry shows loading toast then canvas                                                                                                                                                          | story                                                         | packages/plugins/whiteboard/src/overlay.stories.tsx (`WhiteboardNotices`)          | -                | ruled out: a failed chunk load is a fault the kit cannot make. The toast, the logged line and the retry are `WhiteboardNotices` states, stepped in a story play                                 |
| 719 comments > agent comment becomes an unread pin, click marks read, pointer moves write nothing, dragged pin lands, only others make unread, Escape closes thread, comment pill waits for the picker, page comment hides canvas, inbox sort/filter/search | browser mode                                                  | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx                        | M-WB-COMMENTS-UI | pins sit over the Excalidraw viewport (src/pins.tsx:55 reads `model.viewport()`), so the whole comment layer needs the canvas mounted                                                           |
| . 738-744 empty inbox, close inbox                                                                                                                                                                                                                          | browser mode (canvas)                                         | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx                        | M-WB-COMMENTS-UI | inbox is mounted inside the canvas surface                                                                                                                                                      |
| . 753-793 unread pin, read on click, quiet pointer moves, zoom 120%, pin drag lands at scene coords                                                                                                                                                         | browser mode (geometry, canvas)                               | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx                        | M-WB-COMMENTS-UI | toBeCloseTo on scene coordinates after zoom; real pointer                                                                                                                                       |
| . 794-801 reload keeps the read state                                                                                                                                                                                                                       | browser mode (real reload)                                    | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx                        | M-WB-COMMENTS-UI |                                                                                                                                                                                                 |
| . 803-846 reply makes unread, own reply does not, Previous thread steps and keeps focus                                                                                                                                                                     | browser mode (real focus)                                     | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx                        | M-WB-COMMENTS-UI | merges with 994 1093-1099 (Next thread); one stepping step is enough                                                                                                                            |
| . 848-859 Shift+Tab focuses a pin, tooltip, Escape twice                                                                                                                                                                                                    | browser mode (real focus)                                     | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx                        | M-WB-COMMENTS-UI |                                                                                                                                                                                                 |
| . 861-869 open thread closes when the agent deletes its comments, chat comes back                                                                                                                                                                           | DELETE-DUP                                                    | whiteboard.browser.test.ts:1188-1191                                               | M-WB-COMMENTS-UI | same behaviour, keep one                                                                                                                                                                        |
| . 871-882 pin dragged onto the composer, composer still takes focus                                                                                                                                                                                         | browser mode (real focus, drag)                               | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx                        | M-WB-COMMENTS-UI |                                                                                                                                                                                                 |
| . 884-922 comment pill waits for the picker chunk, page element pick hides canvas, Escape/Enter bring it back, toast only when canvas closed                                                                                                                | browser mode (layout pick of a host element on the test page) | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx                        | M-WB-COMMENTS-UI | picks a real host page element through the page plugin picker; crosses the page plugin                                                                                                          |
| . 924-988 inbox: count badge, newest first, reply count, sort by unread, resolve hides, show resolved, search, mark all read, open scrolls far pin into view                                                                                                | browser mode (canvas; toBeInViewport)                         | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx                        | M-WB-COMMENTS-UI | sort/filter/search alone would be happy-dom if the inbox mounted without Excalidraw; today it cannot                                                                                            |
| 994 cards and thread > agent tool calls show as chat cards, thread hides chat, @mention reply, Escape keeps canvas, next/previous, resolve, delete confirm, source-linked pin drift prompt, agent delete closes open thread                                 | browser mode                                                  | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx                        | M-WB-COMMENTS-UI | thread and pins over the canvas                                                                                                                                                                 |
| . 1010-1031 scripted turn: canvas_read, preview image, delete, export failure, comment create/list/delete, pin state show as cards                                                                                                                          | happy-dom                                                     | packages/plugins/whiteboard/src/whiteboard.dom.test.tsx                            | -                | ruled out: a scripted turn of tool calls. Each whiteboard tool is called with `engine.session.tool(...)` and its card is checked (Decision P1); the card states stay in the stories (section 3) |
| . 1035-1074 unread pin, thread hides chat, reply with @AI mention stored as a mention part                                                                                                                                                                  | browser mode (canvas)                                         | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx                        | M-WB-COMMENTS-UI | the MentionField is tiptap contenteditable; see section 4                                                                                                                                       |
| . 1076-1099 Escape keeps canvas, Next thread steps and keeps focus                                                                                                                                                                                          | browser mode (real focus)                                     | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx                        | M-WB-COMMENTS-UI | merge with 719 837-842                                                                                                                                                                          |
| . 1101-1122 resolve, delete through its confirm (Cancel focused)                                                                                                                                                                                            | browser mode (real focus, canvas)                             | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx                        | M-WB-COMMENTS-UI |                                                                                                                                                                                                 |
| . 1124-1175 source-linked pin drag opens the drift prompt, Cancel, keep link accepts drift and writes offset                                                                                                                                                | browser mode (pointer drag, canvas)                           | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx                        | M-WB-COMMENTS-UI |                                                                                                                                                                                                 |
| . 1177-1186 a refused comments.update shows the save error toast                                                                                                                                                                                            | not carried                                                   | -                                                                                  | M-WB-COMMENTS-UI | a refused comments.update is a socket fault; the save error toast has no other way in                                                                                                           |
| . 1188-1191 agent delete closes the open thread                                                                                                                                                                                                             | browser mode (canvas)                                         | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx                        | M-WB-COMMENTS-UI | owner of the 861-869 duplicate                                                                                                                                                                  |
| 1237 canvas background > host page shows through by default, covered once the settings row turns it solid                                                                                                                                                   | browser mode                                                  | packages/plugins/whiteboard/src/whiteboard.browser.test.tsx                        | -                | only a screenshot of the host page under the canvas proves see-through                                                                                                                          |

Count: 4 tests. Three of them (182, 719, 994) are long chains split into 25 segment rows; 1237 has no segments.

#### 2. Totals

Counted by segment, plus 1237: browser mode 21, DELETE-DUP 2 (402-426 refusal part, 861-869), story 1 (chunk failure
notices, 677-711), happy-dom 1 (tool cards, 1010-1031), not carried 1 (refused comments.update, 1177-1186).

What the file becomes:

- One `src/whiteboard.browser.test.tsx` on `mount`, with these journeys:
  - M-WB-CANVAS 1: draw and close;
  - M-WB-CANVAS 2: agent drawing and svg safety, commit, export;
  - M-WB-CANVAS 3: second tab;
  - M-WB-COMMENTS-UI as one or two journeys (719 and 994 merged);
  - the background pixel test.
- The tool card step goes to `src/whiteboard.dom.test.tsx` (Decision P1).
- The chunk failure notices go to `src/overlay.stories.tsx`.
- All inline `timeout:` values, the two 120 s test timeouts and the `AbortSignal.timeout` calls become options.

### 3. Cross-file duplicates and owners

- whiteboard.browser.test.ts:413-419 duplicates whiteboard.test.ts:807 and :665 (no canvas is open to draw into). Node owns it.
- whiteboard.browser.test.ts:861-869 duplicates whiteboard.browser.test.ts:1188-1191 (an open thread closes when the agent deletes its root).
- whiteboard.browser.test.ts:837-842 (Previous thread) and 1093-1099 (Next thread) prove the same stepping and focus; keep one.
- whiteboard.browser.test.ts:864 and 1052 both prove the open thread hides the chat; keep one.
- whiteboard.test.ts:758-759 (comment_read and pin_set_state on a missing cid reject) overlaps 795:797; 795 checks the message, so 758-759 go.
- whiteboard.test.ts:611-612 (script svg and 501-edge mermaid rejected) overlap 795:801-806; same split, 795 keeps the messages.
- whiteboard.test.ts:795 lines 808 and 810 duplicate canvas-tools.test.ts:41 (export and commit timeouts), and cost about 25 s of real waiting.
- whiteboard.browser.test.ts:1010-1031 checks card text: "3 elements", the preview image, "delete el_9", "export render
  failed · no renderer", "Looks off-center", "2 comments", "deleted" and "locked". It repeats the states of the canvas and
  comment card stories that 2574b0acb removed (Read, PreviewImage, DeleteConfirmed, ExportFailed, CreatePreview,
  ListResults, PinLocked). Those states become plays in `src/cards.stories.tsx`; the happy-dom step keeps only "a
  whiteboard tool call renders its card".
- Owner: the whiteboard cards (canvas, comment, anchor, element cards in `src/cards.tsx`) and their stories belong to
  `@conciv/plugin-whiteboard`.

### 4. Cannot move to happy-dom, and suspected blockers

- The whole comment layer renders inside the Excalidraw surface: pins, thread, inbox and drift prompt
  (`src/canvas-surface.tsx`; `src/pins.tsx` waits for the Excalidraw viewport). happy-dom has no canvas 2D context and no
  real ResizeObserver, so Excalidraw will not mount. Every comment UI step stays in browser mode unless the inbox and
  thread are mounted apart from the canvas. That is why inbox sort, filter, search and mark-all-read look movable but are
  not.
- Pin placement after zoom (753-793) and the far pin scrolled into view (983-986) are geometry.
- The thread reply field is `MentionField` from @conciv/ui-kit-tap (tiptap contenteditable), and its @mention option list
  is an Ark/zag listbox under virtual focus. Both are suspected happy-dom blockers: contenteditable selection and zag
  focus gating.
- Focus asserts need real focus: the composer focused after close (262), Previous/Next thread, Cancel in the delete
  confirm, Shift+Tab to a pin.
- SVG conversion (`src/svg-convert.ts`) runs in the page against Excalidraw's skeleton transform; the hostile svg check
  (no script ran) needs a real document.
- The background test compares screenshots; only a real browser has pixels.

---

## Decisions

Each lists the pick first.

- **P1, plugin cards from a direct tool call.** Page and whiteboard card rows (whiteboard.browser:1010-1031, the page session
  and act cards in happy-dom) rely on a tool called through `engine.session.tool(...)` drawing its card in the thread.
  - Pick: check this on the kit sample before those rows are written; if no card shows, the card checks become story plays.
  - Other: a scripted reply that carries tool calls, which the rulings rule out.
- **P2, page queue rows whose app covering test is gone (page.browser 2849, 2867, 2893, 12778 inspector).** The covering
  conciv.browser rows are deleted and app.md has no row for them.
  - Pick: browser mode in packages/plugins/page/src/page.browser.test.tsx, M-QUEUE and M-INSPECT.
  - Other: add them to app.md as apps/conciv browser mode rows.
- **P3, the old plugin-testkit self-tests (plugin-testkit.test.ts, 14 rows).** The file and the kit it tested were deleted in
  9d4f4834f.
  - Pick: not carried; the new kit is proven by the step 2 samples.
  - Other: one node test per new kit entry (`createEngine`, `mount`, `createHarnessEngine`) in plugin-testkit.
- **P4, test-runner fixture apps.** The `playwright-app` and `vitest-app` fixtures were deleted with the old tests.
  - Pick: write them again under `packages/plugins/test-runner/fixtures/`, outside src, so the test-file budget does not
    count them.
  - Other: create them in a temp folder from the node test.
- **P5, the recorder rrweb fault rows (recorder.it 586, 754 and the offline steps of 109 and 171).**
  - Pick: node tests of `flusher-machine.ts` and `boot-machine.ts`; the on-screen messages are not carried.
  - Other: story plays for the unavailable and failed-flush messages, if the cards render them from props.
