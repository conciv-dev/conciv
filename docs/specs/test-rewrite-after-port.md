# Test rewrite after the plugin port

Status: plan, rewritten 2026-11-19 around the layered design. Order: the port finishes first, then main CI goes
green, then this rewrite. Inputs:

- the full audit in `docs/specs/test-audit/` (155 files, 96,703 lines, every file read in full; `test-audit-summary-2.md`
  holds the totals, the budget breaks and the behaviour x level matrix);
- the layer research in `docs/specs/test-research/`: `summary-layers-1-2.md` (Storybook, testing-library, testkits,
  what every file repeats) and `summary-layers-3-4.md` (browser and node runners, measured timings, fixture layers),
  with file:line evidence in the other files there.

## Goal

Every user-facing behaviour is proven once, at the one layer that owns it, by a lean journey or a table. Test files read
as plain steps: all setup, waiting and teardown sit in fixtures. Targets: about 55,600 lines instead of 96,703, and the
CI wall from 21 m 59 s to about 11 minutes (today one file, `conciv.browser`, is the whole critical path, and half its
time is red tests dying on 15 s per-call timeouts).

## The five layers

| #   | layer                                      | runner                                                                                                                                                                      | proves                                                                                                                                                      | owner of                                                                     |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Storybook stories with `play`              | Storybook + `@storybook/addon-vitest` in Chromium (already wired, 445 tests in ~40 s)                                                                                       | one component in each of its states, what the user sees, a11y                                                                                               | every visual state and simple interaction of a kit component                 |
| 2   | shell tests (the bulk; decided 2026-11-19) | vitest **node** with happy-dom + `@solidjs/testing-library`, NO browser, on `@conciv/plugin-testkit` `mount({plugins, builtins})`; the engine runs in the same Node process | the full shell with built-ins and the plugins under test, over a real in-process engine and the scripted chat: what the user sees and does, by role         | every widget and plugin behaviour that needs no layout, canvas or real focus |
| 3   | browser tests                              | real browser (Playwright Test), on `@conciv/plugin-testkit/flow`                                                                                                            | the built bundle in a host page: layout, scrolling and the virtual list, canvas (whiteboard, terminal), real focus, reload and reconnect over the real page | only what layer 2 cannot prove                                               |
| 4   | node tests                                 | vitest node, on `@conciv/plugin-testkit/node`                                                                                                                               | engine, CLI, plugins, db, harness over real processes and real files                                                                                        | server behaviour                                                             |
| 5   | unit tests                                 | vitest node                                                                                                                                                                 | pure functions only, as `it.each` tables                                                                                                                    | parsers, mappers, state machines                                             |

A behaviour lives at the lowest layer that can prove it, and only there. A higher layer never re-proves it; it proves
the wiring between parts.

## Two kits, no new packages

Ruling 2026-11-19: the rewrite adds no package; it deletes them. There are exactly two kits, both published products:

- `@conciv/harness-testkit`: how a harness author tests a harness; conciv's harness tests use it.
- `@conciv/plugin-testkit`: how a plugin author tests a plugin; it boots the real engine and widget with the scripted
  chat, and every conciv engine, widget and plugin test uses it like any author would.

Deleted: `@conciv/browser-fixture` (folded into plugin-testkit) and `@conciv/plugin-page-testkit` (becomes the page
plugin's `./testing` export). A plugin never gets a testkit package; helpers it offers its consumers ship as a
`./testing` export entry of that plugin. A helper only one package's tests use stays in that package's test file. The
helpers repeated today (the makeApp adapter x4, host page + static server x3, fault injection x2, the widget driver x2,
mountView x2) collapse into plugin-testkit. v0 has no external users, so nothing is re-exported.

Every fixture is built with the runner's own `test.extend` (vitest Test Context, Playwright Fixtures). Teardown is the
fixture's code after `await use(value)`; tests never write `afterEach` or `onTestFinished` for kit resources.

plugin-testkit is the plugin author API (decided 2026-11-19): `mount({plugins})` renders the full widget shell, logged in,
over a real engine started for the test, with exactly the plugins the product has by default (the built-ins) plus the
ones the test passes; `builtins: false` mounts only the passed ones. The test then drives it with Testing Library role
queries. `engine({plugins})` is the node side: call the plugin's tools and rpc. conciv's own plugin suites use only this
API. The conciv-internal wire observers and fault injectors leave the kit's public exports and move into the test files
of the packages that use them.

```tsx
test('a recording made from the pill shows in the panel', async ({mount}) => {
  await mount({plugins: [recorder]})
  await userEvent.click(page.getByRole('button', {name: 'Record'}))
  await userEvent.click(page.getByRole('button', {name: 'Stop recording'}))
  await userEvent.click(page.getByRole('tab', {name: 'Recordings'}))
  await expect.element(page.getByRole('listitem', {name: /Recording 1/})).toBeVisible()
})
```

plugin-testkit entries (harness-testkit keeps the harness fixtures: scripted chat, fake CLI):

| entry      | fixtures                                                                                                                                                                                                                                                                                    | scope                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `/node`    | `tmp`, `db`, `engine({plugins, files, harness, fakeCli, env})`, `session` (fresh session + client + send turn, approve, call tool, read events), `plugin` (engine with this package's plugin, `tool(name)`, typed failure reader)                                                           | engine per file by default, overridable per file; session per test; a per-test `engine` for restart and multi-engine cases |
| `/browser` | `chat` (scripted chat: `reply`, `hold`, `release`, all released at teardown), `component` (render inside the real providers: chat, theme, toast and dialog layers), `pane` (the app shell over an engine started through browser commands)                                                  | test                                                                                                                       |
| `/flow`    | `engine` (engine options overridden per describe), `host` (static host page with the built bundle), `widget` (a logged-in page plus a driver: `openNewSession`, `composer`, `send`, `log`, `panel`, `queued`, `reload`, `approve`), fault and wire-observer fixtures with automatic cleanup | browser per worker, host per file, engine and page per test                                                                |

Measured: an engine starts and stops in about 0.1-0.2 s, so per-test engines cost little and need no reset API.

## Rules baked into the kit and the files

1. **No sleeps, no inline timeouts.** Timeouts are set once in each config (`expect.element`, `expect.poll`, Playwright
   `expect`). Waiting goes through auto-retrying asserts, `expect.poll` on an engine read, or the scripted harness's
   `hold`/`release`. The 469 per-call `timeout:` values, the hand-written `until` poller and every `wait(N)` go.
2. **No product timer is waited out.** Each one a test must cross becomes an option the product already reads, default
   unchanged (standing ruling 2026-11-16; fake timers are also allowed). The list from the research: query retry delay,
   reconnect backoff and ceiling, handshake window, whiteboard export and commit deadlines, ai silence timeout, core idle
   and heartbeat, stop grace, client reconnect ceiling, the fixed `wait(4000)` in core.test, the 300 ms sleep in
   `packages/it`.
3. **Locators by role and name only.** The driver owns the repeated names (the composer textbox name appears 106 times
   today).
4. **No mocks.** Fakes are real implementations of the interface (the scripted harness, fake simctl, fake spawner). The
   seven Storybook `fn()` spies become asserts on what the user sees.
5. **Journeys, not per-behaviour tests.** One `describe` per user flow; consecutive steps are one test.
6. **Tables for inputs** (`it.each`).
7. **Budget.** One node file plus one browser/flow file per package, each at most 1,000 lines. Stories files are not
   test files for the budget.
8. **Unchanged laws.** No DOM/CSS/geometry asserts, no test-ids, real browsers for UI, tests never write app state
   outside their temp dirs.
9. **Never a silent loss.** Each change lists every deleted test with the test that now owns its behaviour (file:line),
   from the audit row.

## How a file reads afterwards

Layer 2 (today `ui-kit-chat/test/composer.browser.test.tsx:420-474`, 55 lines with its own host and timeouts):

```tsx
test('a sent image shows in its user turn, and a data URL image is named image', async ({component, chat}) => {
  component(() => <Thread />)
  await chat.send([{type: 'text', content: 'what color is this'}, gifPart])
  await expect.element(page.getByText('what color is this')).toBeVisible()
  await expect.element(page.getByRole('img', {name: 'image-1'})).toBeVisible()
})
```

Layer 3 (today `embed/test/e2e/embed.it.test.ts:582-656`, 75 lines, five helpers, two 240 s test timeouts, eight 30 s
waits):

```ts
test('a sent message never comes back as a draft; a follow-up behind a queued send survives a reload', async ({
  widget,
  engine,
}) => {
  const session = await widget.openNewSession()
  await widget.send('a message sent right before the reload')
  await widget.reload()
  await expect(widget.composer).toHaveText('')
  engine.chat.hold()
  await widget.send('a run that keeps going')
  await widget.send('sent while the run goes')
  await widget.composer.pressSequentially('typed after the queued send')
  await expect.poll(() => engine.draft(session)).toMatchObject({text: 'typed after the queued send'})
  engine.chat.release()
  await widget.reload()
  await expect(widget.composer).toHaveText('typed after the queued send')
})
```

## The split (every test, origin/main 86d94e743, 2026-11-19)

Seven opus readers gave every test in the repo one destination; the rows are in `docs/specs/test-split/<group>.md`
(app, core, cli-harness, plugin-sdk, plugins, embed-flows, kits). Spot checks against the worktree held. cli.test and
harness.test rows reuse the 11-17 audit verdicts by title except where the test changed since.

| group                                        | tests     | happy-dom app | happy-dom plugin | browser | storybook | node      | unit    | delete  |
| -------------------------------------------- | --------- | ------------- | ---------------- | ------- | --------- | --------- | ------- | ------- |
| app                                          | 531       | 235           | 19               | 54      | 9         | 13        | 187     | 14      |
| core + wire                                  | 578       | 0             | 0                | 0       | 0         | 434       | 104     | 40      |
| cli + harness + tooling                      | 743       | 0             | 0                | 0       | 0         | 377       | 273     | 93      |
| plugin + plugin-host                         | 515       | 0             | 6                | 0       | 0         | 306       | 117     | 86      |
| plugins + page                               | 450       | 1             | 31               | 96      | 89        | 98        | 113     | 22      |
| embed, unplugin, mascot, wrappers, e2e, site | 573       | 14            | 15               | 139     | 20        | 223       | 55      | 107     |
| ui kits + storybook                          | 640       | 2             | 0                | 35      | 437       | 1         | 80      | 85      |
| **total**                                    | **4,030** | **252**       | **71**           | **324** | **555**   | **1,452** | **929** | **447** |

What it means:

- **The app keeps** shell behaviour no plugin owns: composer, thread, sessions, drafts, queue, settings, login and
  trust, notices, navigation, pane chrome. 235 of `conciv.browser`'s 333 tests move to happy-dom; 50 keep a browser
  (virtual-list scrolling, launcher drag, phone width, xterm theme, real focus); 19 move to their plugin.
- **Plugins own** their tests on `plugin-testkit` `mount({plugins})`. With builtin-plugins split (Decided 2026-11-19:
  one package per plugin, new `packages/plugins/terminal`, built-ins on by default from the app's list), the
  `builtin-plugins` targets above go to the real plugin package.
- **Core, CLI, harness, plugin-host** are node and unit only; no DOM.
- **Browser stays** for the built bundle (embed, unplugin dock, wrappers, e2e), page act verbs (zero-size boxes refuse in
  happy-dom), canvas (whiteboard, xterm), virtual-list scrolling, real focus.
- **Over the 1,000-line cap after merging:** core (about 5,500-6,500; shrinks when pty leaves for the terminal plugin and
  the page_eval tests go to the page plugin), cli (about 3,800; the init block 3365-6225 belongs to harness-init),
  harness (about 1,500), the page plugin's node file.

Happy-dom rules: a test reads only what the user sees, through Testing Library queries by role, label and text. No
`document`/`window` reads or writes, no `vi.mock`, `vi.fn`, `vi.stubGlobal`, no polyfill or shim in a setup file. A
test that needs real sizes is a browser test, not a happy-dom test with a fake size.

Checked in code, not a blocker:

- The virtual thread draws every row under 15 turns at any size (`thread.tsx:191`, `VIRTUALIZE_THRESHOLD`); the
  long-chat paging tests are already browser tests.
- The composer actions need no ResizeObserver: at width 0 the fit keeps its first placement
  (`composer-actions-core.ts:90`); only the overflow-by-width tests (M-OVERFLOW) need real widths, and they are browser
  tests.

Still to check in code before the testkit step: tiptap caret, selection, IME and `beforeinput`; zag focus-trap and
focus-return; IndexedDB for drafts; a storage quota for the full-storage tests; clipboard; stylesheet visibility;
product timers as options; engine-side fault injection to replace Playwright socket routes. Each ends as a product
option, a real in-memory implementation the product already accepts, or a browser test; never a mock.

## Waves

Order matters: merging files before the timer options and fixtures exist makes CI slower (core's two big files run in
parallel today; one file would add about 70 s).

| wave | what                                                                                                                                                                                                                                                                      | why first                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| pre  | the app's one entry `ConcivApp` + `Platform` on Effect (docs/specs/app-one-entry.md) and the builtin-plugins split land                                                                                                                                                   | the kit mounts `ConcivApp`; tests move to their real plugin        |
| 0    | plugin-testkit `mount` on happy-dom (clears the blockers above), `/node` `/browser` `/flow` and harness-testkit rewritten on `test.extend` from the duplicated helpers, browser-fixture and plugin-page-testkit deleted; the timer options; one config default per runner | everything else stands on it                                       |
| 1    | `apps/conciv` browser (`conciv.browser`) and `core-api.it`                                                                                                                                                                                                                | the CI critical path (~10 min) and the files everyone conflicts on |
| 2    | plugin-host (39 files to 2, imports shared once), cli (in-process rows), core node, oxlint-plugin (one oxlint run per config)                                                                                                                                             | the next shard (~10.7 min)                                         |
| 3    | embed, mascot, unplugin, harness; old testkits deleted                                                                                                                                                                                                                    | flow layer moves onto the kit                                      |
| 4    | Storybook: plays for the ~15 states tests own today, delete the ~8 browser tests a play already duplicates, wire the 4 orphan stories, a11y on; ui-kit-chat, ui-kit-system, small kits                                                                                    | layers 1-2                                                         |
| 5    | builtin-plugins, page, plugins/*, plugin, plugin-page                                                                                                                                                                                                                     | plugin suites onto `/node` and `/flow`                             |
| 6    | everything else (protocol, contract, client, db, ai, chat, site, e2e, repo tooling, small libs)                                                                                                                                                                           |                                                                    |

Within a wave the packages run in parallel, one lane each. Within a package: list the audit rows first, rewrite, then
check that every KEEP and MERGE row has a home. Measure before and after: test count, coverage (fix the broken
preact/react/solid coverage include first; baseline 4,372 tests, 81.5 % lines) and the CI wall.

## Re-homes before deletion

- The tool-reply truncation cap was tested only in extension-testkit: re-home it into the owning package.
- `concivSolidConfig` optimizeDeps (extension-compiler 348) moves to unplugin.

## Found on the way (fixed in the owning wave)

- `core-api.it.test.ts:1583-1782` boots six engines with the OS temp dir itself as the project folder.
- `try-it.browser.test.ts:185-202` has no `finally`, so a failure leaks pages.
- `e2e/nextjs/test/packed-install.spec.ts:73` sleeps 2 s.
- `vitest-config/src/shards.ts` still lists the deleted extension packages.

## Decisions (one at a time, my pick first)

1. **Flow runner (DECIDED 2026-11-19).** Playwright Test, with its own `test.extend` fixtures, for every flow file (embed, mascot, e2e apps).
   Its built-in `page` opens a fresh browser context per test and closes it, which differs from today's
   "`browser.newPage()`, never `newContext()`" rule. That rule exists because hand-made contexts leaked. Pick: Playwright
   Test, and the rule becomes "never open a context by hand". Alternative: move embed and mascot onto vitest with one
   shared browser.
2. **Kits (DECIDED 2026-11-19).** No new package. Only `@conciv/harness-testkit` and `@conciv/plugin-testkit`;
   browser-fixture and plugin-page-testkit are deleted; per-plugin helpers are a `./testing` export, never a package.
3. **Engine scope.** Flow and browser: one engine per test (about 0.2 s, full isolation, no reset API). Node: one engine
   per file plus a fresh session per test, with a per-test engine for restart cases.
4. **Storybook a11y** switched from `todo` to `error` in wave 4, and today's violations fixed there.
5. **Browser tests a play already duplicates** (about 8) are deleted in wave 4.
6. **Geometry and DOM reads where nothing user-visible exists** (mascot, terminal, streamdown MutationObserver tests):
   rewrite to what the user sees, or delete; no exception.
7. **`vi.stubEnv`** counts as a stub: env goes through the `engine({env})` fixture.
8. **API kept alive only by its tests** (bus replay/claim/remove/log, promise `Flock`, `isRegistryPackage` /
   `isInstallablePackage`, `aguiSnapshotFor`, harness-testkit `harnessModes` and until-failWhen, Suggestion,
   `MAX_INLINE_AUTO_ACTIONS`): delete code and tests together.
9. **The 1,000-line cap** is hard for the rewrite output, including `whiteboard.browser.test.ts`, which has a port-time
   exception.
10. **Happy-dom files (DECIDED 2026-11-19).** Happy-dom tests get their own files, next to the source they test
    (`src/x.tsx` beside `src/x.dom.test.tsx`). They are cheap, so the one-node-plus-one-browser budget does not apply to
    them; the only cap is never more test files than source files in a package. The `conciv/test-file-budget` lint
    rule and AGENTS.md change in wave 0.
    **Node and unit tests follow the same rule (DECIDED 2026-11-19):** a file next to the code it tests
    (`engine-connection.ts` beside `engine-connection.test.ts`), same cap. A shared engine boot is a `plugin-testkit`
    fixture, one line per file. **Browser tests stay one file per package.** This replaces the one-node-file budget
    and makes the 1,000-line cap easy to hold; core, cli and harness split by module instead of needing exceptions.
11. **Two runners only (DECIDED 2026-11-19).** vitest for node, unit and happy-dom; Playwright Test for every browser
    test. vitest browser mode goes (15 configs use it today). The 29 page tests that import TS into the page are
    rewritten to drive a served host page with the page plugin in it. Storybook plays run on Storybook's own
    runner (`@storybook/addon-vitest`), the one exception (decided).
12. **Leak, perf, listener and reduced-motion guards (ruled 2026-11-19, each read in code).** They count with patched
    globals today (`window.pointerMoveListenerCount`, `harness.layoutReads()`), which the no-mock rule removes. What
    they protect is real (the mascot runs on every host page), so they are rewritten, not dropped:
    - Leak (mascot.it 335, 826 x16 effects, 2261; solid-mascot 264; react-wrapper 315): KEEP as happy-dom tests next to
      `packages/mascot/src/core/effects` and next to each wrapper. Assert through GSAP's own public API (the global
      timeline has no tween left, the ticker has no listener left) after work stops and after unmount; 826 is one
      `it.each` over the effects.
    - Listener counts (mascot.it 1776, 1893; react-wrapper 332, 347): DELETE. A left-armed gaze is the same leak, so the
      leak test above (no gaze tween after disarm, after StrictMode double mount) covers it without counting listeners.
    - Perf (mascot.it 967 no layout read per frame, 1007 eye box measured once): DELETE as unit tests; add one mascot
      working scenario to the calm perf gate (`test:perf`, Playwright, frame-gap budget), which catches layout thrash
      as the user feels it.
    - Reduced motion (mascot.it 1386, 2312): KEEP, accessibility. Happy-dom next to `core/config.ts` with reduced
      motion set in the environment: poses land at once, no tween runs, no emitter mounts (GSAP API). One Playwright
      test in the mascot browser file with `emulateMedia({reducedMotion: 'reduce'})` keeps the real media query honest.
13. **`defineFrameworkAdapter`** and `rebind`: called only by contract.test; delete with their tests (product code).
14. **Real-CLI tests** in core-chat.it run on every local run and spend tokens: opt-in by env, as the opencode one.
15. **`Suggestion`**: decision 8 deletes it, the keep-published-kit-API ruling keeps it. Pick: keep (published).
