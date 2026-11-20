# Storybook + testing-library research (aidx, main @ 476a97995, 2026-11-19)

Counts come from `git ls-files` / grep. Story-export counts are `^export const` lines (meta is `export default`, so the count is close to the number of stories).

## (a) Storybook today

### Versions

- storybook 10.6.5, @storybook/addon-vitest 10.6.5, storybook-solidjs-vite 10.7.4, vitest 5.1.0 (versions installed under `apps/storybook/node_modules/*/package.json`).
- Catalog: `pnpm-workspace.yaml:207` storybook ^10.6.5, `:208` storybook-solidjs-vite ^10.7.4, `:97` @storybook/addon-docs ^10.6.5, `:95` @solidjs/testing-library ^0.8.10, `:139` @vitest/browser-playwright 5.1.0, `:217` vitest ^5.1.0, `:182` playwright ^1.64.1.
- Not in the catalog, pinned by hand in `apps/storybook/package.json`: addon-vitest `:33` ^10.6.4, addon-a11y `:30`, addon-themes `:32`, @testing-library/dom `:35` ^10.4.2, @chromatic-com/storybook.

### One Storybook for the whole repo

- Config: `apps/storybook/src/storybook/main.ts` (no `.storybook/` directory anywhere). Story globs are at `main.ts:5-19`. Addons at `:20-26`: chromatic, **addon-vitest**, addon-a11y, addon-docs, addon-themes. The framework turns docgen off under VITEST (`:27`).
- Preview: `apps/storybook/src/storybook/preview.tsx`. It sets `a11y: {test: 'todo'}` (`:11`), so a11y violations are reported and **do not fail** a test. It also has a theme decorator and a wrapper div (`:14-39`).
- Vitest: `apps/storybook/vitest.config.ts`. It uses the `storybookTest({configDir})` plugin (`:17`) in browser mode with playwright chromium, headless, reducedMotion 'reduce' (`:24-35`), `maxWorkers: 2`, `isolate: false`, `testTimeout: 60_000` (`:21-23`).
- Scripts: `test: vitest run` (`apps/storybook/package.json:9`). Turbo inputs pull in every package's stories and ui-kit sources (`apps/storybook/turbo.json:5-17`).

### Stories per package (140 files, 460 exports, 320 `play` functions)

| package                    | files | exports |
| -------------------------- | ----- | ------- |
| packages/ui-kit-chat       | 44    | 130     |
| packages/ui-kit-system     | 36    | 79      |
| packages/builtin-plugins   | 14    | 62      |
| packages/ui-kit-tap        | 3     | 52      |
| packages/ui-kit-chat-tools | 10    | 52      |
| packages/mascot            | 17    | 17      |
| apps/conciv                | 4     | 15      |
| packages/solid-streamdown  | 1     | 13      |
| packages/tools             | 2     | 12      |
| packages/brand             | 5     | 12      |
| packages/core              | 1     | 10      |
| packages/solid-diffs       | 2     | 3       |
| apps/storybook             | 1     | 3       |

- `play` functions: 320 across 107 files (`git grep -P '\bplay\s*:'`). The heaviest files are `packages/ui-kit-tap/src/rich-text-field-triggers.stories.tsx` (34), `rich-text-field.stories.tsx` (11) and `packages/builtin-plugins/src/page/cards/session-card.stories.tsx` (10). Examples: `packages/ui-kit-system/src/dialog.stories.tsx:169,203`, `clipboard-copy-button.stories.tsx:26,34,44`, `packages/brand/src/motion.stories.tsx:15`, `apps/storybook/src/mascot/mascot-gallery.stories.tsx:472,482,496`.
- What the play functions use (all imported from `storybook/test`, 107 files): `expect` ×1085, `within` ×308, `userEvent.click` ×226, `canvas.getByRole` ×147, `userEvent.keyboard` ×143, `waitFor(` ×461, `findBy*` ×21, `setTimeout` ×3. **`fn()` spies ×7** (`composer.stories.tsx:107,121,207,263`, `composer-actions.stories.tsx:359`, `action-row.stories.tsx:16-17`). These spies clash with the AGENTS.md no-mocks rule.
- **Orphans:** the 4 `apps/conciv/src/**/*.stories.tsx` files (`pane/indicators`, `pane/queue-strip`, `pane/status-bar`, `runtime/plugin/dialogs`) match none of the globs in `main.ts:5-19`, so no one runs or builds them. None of them has a play function.
- `tags: ['autodocs']` appears on the mascot stories only (e.g. `packages/mascot/src/mascot.stories.tsx:226`). The plugin's default include tag is `test` (`addon-vitest/dist/vitest-plugin/index.js:2560-2562`), and stories get that tag by default.

### CI

- Job `storybook`, "Storybook browser tests": `.github/workflows/ci.yml:329-362`. It runs alone on ubuntu-latest in the Playwright container. Step `:360` is `turbo run typecheck lint test --filter='./apps/storybook'`.
- Timing (baseline run, `…/test-baseline/baseline.md:116-118,163`; `jobs.tsv:3`): 137 test files (3 failed, 133 passed, 1 skipped), 445 tests (3 failed, 442 passed). Vitest duration was **39.69s**. Job wall time was **2m43s**, from 13:52:26 to 13:55:09.
- For comparison: `apps/conciv/test/conciv.browser.test.tsx` alone takes 1084.1s (335 tests), and `ui-kit-chat/test/composer.browser.test.tsx` takes 48.0s (60 tests) (`baseline.md:104,110`).

### Browser tests that a story + play could replace (component-level)

Browser test files, by lines: conciv 13017, builtin-plugins 2836, ui-kit-chat composer 2055, thread 1968, ui-kit-system 1586, ui-kit-chat cards 1276, ui-kit-chat-tools 764, solid-streamdown 440, markdown 324, mascot 285, ui-kit-tap 175, brand 75.

**A. Already duplicated: a story play asserts the same thing today.**

| browser test                                                                                                                                                     | existing story covering it                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/ui-kit-system/test/ui-kit-system.browser.test.tsx:218` (Copy button renamed to Copied), `:236` (Copy failed), `:206/:212/:242` (live region announces) | `ui-kit-system/src/clipboard-copy-button.stories.tsx:32 Copied`, `:42 CopyFailed` (both assert the `status` role text) |
| `ui-kit-system.browser.test.tsx:491` (escape closes), `:549` (name from heading), focus-return tests `:560/:576` (shadow-root variants are NOT covered)          | `dialog.stories.tsx:167 Parts` (escape and close, focus back to trigger, accessible description)                       |
| `ui-kit-system.browser.test.tsx:519` (non-dismissable holds open)                                                                                                | partly `dialog.stories.tsx:201 Stacked`                                                                                |
| `ui-kit-system.browser.test.tsx:1219` (clipped text reveals a tooltip), `:1229` (text that fits gets no tooltip)                                                 | `truncated-text.stories.tsx:16 Rows`                                                                                   |
| `ui-kit-system.browser.test.tsx:1335,1343` (virtual JSON tree opens branches)                                                                                    | `virtual-json-tree.stories.tsx:49 PageSnapshot`                                                                        |
| `ui-kit-system.browser.test.tsx:868-889` (TextArea autosize: min/max rows)                                                                                       | `text-field.stories.tsx:18 RefitsWhenWidthShrinks`, `:43 Autosize`                                                     |
| `ui-kit-chat-tools/test/ui-kit-chat-tools.browser.test.tsx:121` (search card: no matches)                                                                        | `ui-kit-chat-tools/src/styled/tools/search-card.stories.tsx:49 NoMatches` (play present)                               |

**B. A story already exists without a play, or the state is missing; adding the play would replace the test.**

| browser test                                                                                                                                              | story to extend or add                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui-kit-chat-tools.browser.test.tsx:107` (search card running → "searching…")                                                                             | `search-card.stories.tsx:82 Running` (no play)                                                                                                |
| `ui-kit-chat-tools.browser.test.tsx:135` (tool lookup with missing query), `:149` (todo empty list), `:163` (file read pending)                           | `tool-lookup-card.stories.tsx:23`, `todo-card.stories.tsx:26`, `file-read-card.stories.tsx:82 Running`: add `Empty`/`MissingQuery` stories    |
| `ui-kit-chat-tools.browser.test.tsx:250-332` (catalog cards: labels, write badge, declared error, string/scalar schema)                                   | `ui-kit-chat/src/tools/styled/meta-tool-card.stories.tsx:77 ReadTool, :98 MutatingTool, :115 DeclaredError` (+ add StringSchema/ScalarSchema) |
| `packages/ui-kit-chat/test/composer.browser.test.tsx:476,498,512` (chip: field shows name and value; clipped value gets tooltip; fitting value gets none) | `ui-kit-chat/src/tools/styled/chip.stories.tsx:16 FieldKind, :70 PillLongValue, :85 FieldLongValue`                                           |
| `ui-kit-chat/test/cards.browser.test.tsx:249` (collapsible section toggles)                                                                               | `collapsible-section.stories.tsx:40 DefaultOpen`                                                                                              |
| `cards.browser.test.tsx:540` (permission card: one-shot Allow)                                                                                            | `permission-card.stories.tsx:26 Pending`                                                                                                      |
| `cards.browser.test.tsx:801` (fallback renders an object as a JSON tree)                                                                                  | `tool-fallback.stories.tsx:25 Complete`                                                                                                       |
| `cards.browser.test.tsx:753,767` (card title tooltip reveal)                                                                                              | `meta-tool-card.stories.tsx:157 TitleTooltip`                                                                                                 |
| `ui-kit-chat/test/thread.browser.test.tsx:355,362,370` (now-line spinner, reduced motion, Stop)                                                           | `ui-kit-chat/src/styled/now-line.stories.tsx:20 Running, :31 NoStop`                                                                          |
| `thread.browser.test.tsx:718` (status-visual: each status has an accessible name in dot form)                                                             | `ui-kit-chat/src/tools/primitives/status-visual.stories.tsx:37 DotForm`                                                                       |
| `composer.browser.test.tsx:1930,1963` (model selector: filter by typed keys, late-arriving models)                                                        | `ui-kit-chat/src/primitives/model-selector/model-selector.stories.tsx:16 Headless`                                                            |
| `composer.browser.test.tsx:1474+` (element preview)                                                                                                       | `element-preview.stories.tsx:68-160` (7 stories)                                                                                              |
| `packages/brand/test/browser/solid-lockup.browser.test.tsx:19,33,46` (blink on focus, settle on leave/blur)                                               | a new lockup story in `packages/brand/src/` (`motion.stories.tsx:15` already has a play)                                                      |

**C. Keep these as browser tests, not stories.** Pure functions (`ui-kit-system.browser.test.tsx:54-90` fitHeight/measure, `:702-770` createResizable keys, `:812` skin contrast), `ui-kit-chat-tools.browser.test.tsx:39,577` (parsers), shadow-root/PiP portal cases (`:366`, `:1054-1160`, `:1407`), mascot dist/teardown leak checks (`solid-mascot.browser.test.tsx:23,264`), streamdown node-identity stability (`solid-streamdown.browser.test.tsx:68,89,154`), and all of `apps/conciv/test/conciv.browser.test.tsx` (app wiring).

## (b) testing-library and the vitest browser API in this repo

- `@solidjs/testing-library` 0.8.10 is imported in 19 files, and **only `render` and `cleanup`** are used (e.g. `ui-kit-system.browser.test.tsx:6`, `builtin-plugins.browser.test.tsx:4`). There are no `screen`, `@testing-library/user-event`, jest-dom or `vitest-browser-solid` imports (0 files each). `@testing-library/dom` is used only by apps/storybook (an optimizeDeps entry, `apps/storybook/vitest.config.ts:18`).
- Cleanup runs globally: `packages/vitest-config/src/solid-cleanup-setup.ts:1-4` (`afterEach(cleanup)`), wired through `ciTestSolidBrowser()` setupFiles (`packages/vitest-config/src/reporters.ts:55-67`).
- Queries and interaction all come from `vitest/browser` (19 files): `page`, `userEvent`, `commands`, `cdp`, `server` (e.g. `apps/conciv/test/conciv.browser.test.tsx:4`, `builtin-plugins.browser.test.tsx:3`). Counts across the browser test files and helpers: `expect.element(` 3223, `getByRole(` 1610, `getByText(` 1028, `userEvent.keyboard` 398, `userEvent.click` 325, `render(` 115, `expect.poll(` 27, `vi.waitFor(` 15, `setTimeout` 17, `.querySelector` 104, `getByTestId` 0.
- `test.extend` / `it.extend` fixtures: **0**. The only `.extend(` hits are a zod schema and `expect.extend` (`ui-kit-system.browser.test.tsx:1398`).
- Browser mode (playwright provider, chromium) per package, from each `vitest.config.ts`:
  - `apps/conciv/vitest.config.ts:53-61`: chromium, plus a perf project for chromium and firefox (`:89-90`).
  - `packages/ui-kit-system/vitest.config.ts:19-23`
  - `packages/ui-kit-chat/vitest.config.ts:56-60` (clipboard permissions)
  - `packages/ui-kit-chat-tools/vitest.config.ts:24-28`
  - `packages/ui-kit-tap/vitest.config.ts:27-31`
  - `packages/brand/vitest.config.ts:18-22`
  - `packages/mascot/vitest.config.ts:33-37`
  - `packages/builtin-plugins/vitest.config.ts:42` (chromium) and `:61-65` (firefox)
  - `packages/plugin/vitest.config.ts:18-22`
  - `packages/page/vitest.config.ts:16-20`
  - `packages/solid-streamdown/vitest.config.ts:19-23`
  - `packages/brand-react/vitest.config.ts:11-15`
  - `packages/mascot-react/vitest.config.ts:26-30`
  - `apps/storybook/vitest.config.ts:24-35`
  - Node only: `packages/solid-diffs/vitest.config.ts:8` and `packages/core`. `packages/tools` has no browser project.
- Stories are **not** reused inside package tests: `composeStories`, `composeStory` and `setProjectAnnotations` have 0 hits in repo source.

## (c) How the libraries intend it (docs and installed sources)

**Storybook addon-vitest (10.x)**

- From docs (https://storybook.js.org/docs/writing-tests/integrations/vitest-addon):
  - It uses "a Vitest plugin to transform your stories into" Vitest tests "using portable stories".
  - Each story gets a smoke render test. If it has a play function, "that function runs and its assertions are checked".
  - It runs in Vitest browser mode (Playwright Chromium by default).
  - It tests stories tagged `test` by default, and `exclude` wins over `include`.
  - a11y tests "must be run alongside component tests".
- Plugin options (`addon-vitest/dist/vitest-plugin/index.d.ts:3-40`): `configDir`, `storybookScript`, `storybookUrl`, `tags: {include, exclude, skip}`, `disableAddonDocs` (default true). The docs also list `initialGlobals`.
- How a story becomes a test (`addon-vitest/dist/vitest-plugin/test-utils.js:75-121`): `testStory(...)` builds `composeStory(storyAnnotations, meta, {initialGlobals}, preview ?? globalThis.globalProjectAnnotations, exportName)`, sets the viewport, then calls `await composedStory.run()`, which renders the story and runs its play.
- Project annotations: since 10.3 the plugin applies preview annotations itself (`index.js:2387-2391`: "Since Storybook 10.3, '@storybook/addon-vitest' applies these automatically. You can safely remove the 'setProjectAnnotations' call"). Its own setup file is `setup-file-with-project-annotations.js:1-3`: `setProjectAnnotations(getProjectAnnotations())`.
- Portable stories API for hand-written vitest tests: `storybook/preview-api` exports `composeStories`, `composeStory` and `setProjectAnnotations` (`node_modules/storybook/dist/preview-api/index.d.ts:1`). storybook-solidjs-vite does not re-export them; it exports only `definePreview` plus types (`storybook-solidjs-vite/dist/index.d.ts:4`).
- `storybook/test` `waitFor` and `findBy*` are testing-library polling helpers (retry until timeout). They are the play-side counterpart of `expect.element`.

**@solidjs/testing-library 0.8.10** (`apps/conciv/node_modules/@solidjs/testing-library/README.md`, `dist/index.d.ts`)

- `render(() => <C/>, options)` (README:77; `index.d.ts:70`). It re-exports `@testing-library/dom` (`index.d.ts:3`). It also provides `renderHook`, `renderDirective`, `testEffect` and `cleanup` (`index.d.ts:90-127`).
- README:82: "Solid.js reactive changes are pretty instantaneous, so there is rarely need to use `waitFor(…)`… except for transitions, suspense, resources and router navigation."
- The README has no vitest-browser-mode section; the repo pairs `render` with `page` locators from `vitest/browser`.
- README:197 warns that solid-js must load once under vitest. The repo dedupes it (`apps/storybook/src/storybook/main.ts:31,67`).

**Vitest 5.1 fixtures** (https://vitest.dev/guide/test-context; `vitest/dist/chunks/config.d.B3YV4t0O.d.ts:2986-3017`)

- `FixtureOptions { auto?: boolean /*default false; test-scoped auto fixtures not initialized in beforeAll/afterAll*/; injected?: boolean; scope?: 'test'|'worker'|'file' /*default 'test'; file = once per file; worker = once per worker*/ }`
- Object form: `test.extend<{page: Page}>({ page: async ({}, use) => { const p = await open(); await use(p); await p.close() } })`. Auto fixtures use the tuple `fixture: [async ({}, use) => {...}, {auto: true}]`.
- Builder form: `.extend('database', {scope: 'file'}, async ({config}, {onCleanup}) => ...)` and `.extend('metrics', {auto: true}, ...)`. A file fixture can only use other file and worker fixtures.

**Vitest browser `page` / `userEvent` / `expect.element`** (https://vitest.dev/api/browser/assertions)

- `expect.element(locator, {timeout?, interval?, message?})` has "built-in retry-ability". It re-checks until the assertion passes or the timeout runs out, while plain `expect` "will fail immediately".
- Defaults fall back to `expect.poll.{timeout,interval}`: 1000 ms and 50 ms (`vitest/dist/chunks/plugin.d.LRFSN46m.d.ts:4204,4209`). The repo sets no `expect.poll` override (0 hits in any `vitest.config.ts` or `vitest-config/src`). `TEST_TIMEOUT_MS` is 30_000 (`packages/vitest-config/src/reporters.ts:17`).
- `page.getByRole/getByText` locators are lazy and re-resolve on every retry. `userEvent` from `vitest/browser` drives real CDP/Playwright input. With both, no timing guesses (sleeps, `setTimeout`) are needed; the 17 `setTimeout` and 15 `vi.waitFor` uses in the browser tests are the outliers.
