# The real tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every conciv feature that the kits can carry today has a test, written from scratch from the feature, in the cheapest runner that proves it.

**Architecture:** One lane per product area, all on `test/plugin-testkit-mounts`. Each lane takes its area's feature list, groups the features into user flows, and writes one test file beside the source it covers. The first file, `apps/conciv/src/chat.dom.test.tsx`, is the template every file follows.

**Tech Stack:** vitest through `conciv()` and `conciv-test`; `@conciv/plugin-testkit` (`createEngine`, `mount`, `TestLLM`); `@solidjs/testing-library`; `@testing-library/user-event`; Playwright Test only under `e2e/`.

**Spec:** the Testing section of `AGENTS.md` on this branch (the rules), `docs/specs/kit-plan.md` (what the kits carry and what they do not), and the feature lists in `docs/specs/tests/features/` (Task 0 puts them there).

## Global Constraints

- A test is only: kit calls, Testing Library queries by role, label or text, `user-event`, `expect`. Nothing else. No helper functions, no polling or wait loops, no sleeps, no per-call timeouts, no test ids, no CSS, DOM or geometry reads, no class or id locators, no mocks (`vi.fn`, `vi.mock`, `vi.spyOn`, `vi.stubGlobal`, `vi.stubEnv`), no `fireEvent`, no plugin or code written as a string, no harness written in the test.
- Allowed as input: raw chat events as a reply, a fixture plugin folder, a fixture project folder, a one-line program for the code tool, a plain fetch to an engine route, vitest's own `page.viewport` in browser mode.
- Written from the feature: read the product source and the feature list. Never read, port or copy an old test. Never one test per old test or per spec line.
- One `describe` per user flow, consecutive steps in one test, inputs as `it.each` tables. A test reads top to bottom like the journey.
- The file name picks the runner: `x.test.ts` node, `x.dom.test.tsx` happy-dom, `<area>.browser.test.tsx` browser mode. The cheapest runner that proves the behaviour, and only there: node, then happy-dom, then browser mode (layout, scrolling, canvas, real focus), then `e2e/`.
- Budgets: never more test files than source files in a package; one browser-mode file per package, except the app (one per product area); at most 1,000 lines per file.
- Who mounts the app: the app, and the plugins the app does not contain (test-runner, whiteboard, recorder, try-it). A package the app is made of (page, terminal, tanstack, ios plugins, the plugin SDK, the ui kits, the mascot) keeps node tests and stories; its on-screen journeys live under `apps/conciv/src`.
- A journey that cannot be written this cleanly is NOT hacked. It is left out and written into the area's ledger with the exact kit call or product change it needs.
- A product bug found by a test is reported at once with the failing test text; the lane does not commit a failing test and does not work around the bug.
- No new dependency without asking. `@testing-library/user-event` and `happy-dom` are already in the catalog.
- Commit locally by pathspec under the commit lock (`mkdir /Users/omrikatz/Public/web/aidx/.git/kit-commit.lock`, `rmdir` after), never push, never open a PR, never `--no-verify`. The orchestrator reads every file, runs it, and pushes.
- Subagents are opus and told "You are a subagent. Don't run memo". Reports go to the orchestrator inbox as new files.

## Review Focus

1. A test that passes while the feature is broken. Every test is seen failing once (Per-file steps, step 5).
2. A test that passes alone and fails in the file or in the whole package run (shared module graph in happy-dom). Each file is run alone and with its package.
3. A flaky test. Each file is run three times in a row before it is committed; one red run means it is not committed.
4. A query that matches by accident (the empty live region with `role="alert"`, text that shows in two places). Role queries carry a name; a text shown twice is asserted by role and name, not by `findAllByText`.
5. Two lanes editing `apps/conciv/package.json` or `vite.config.ts`. Only Task 0 touches the app's setup; app lanes add test files only.

## Per-file steps (every test file, every lane)

- [ ] **1. Flows.** From the area's feature list and the product source, list the user flows for this source file or area. One line each in the ledger.
- [ ] **2. Runner.** Pick the cheapest runner for each flow. A flow that needs something the kit does not carry goes to the ledger as blocked, with what it needs.
- [ ] **3. Write** the file in the shape of `apps/conciv/src/chat.dom.test.tsx`.
- [ ] **4. Run** it through the package's `test` script (`node node_modules/@conciv/plugin-testkit/bin/conciv-test.js <file>`), alone, three times, then once with the package's other test files.
- [ ] **5. See it fail.** For each test, break the one product line the flow depends on (a local edit, never committed), run, see the test fail on its own assert, restore. Write the broken line and the failure line in the report.
- [ ] **6. Gates:** `oxlint` and `oxfmt --check` on the file, typecheck of the package.
- [ ] **7. Commit** the file and its ledger lines. **8. Inbox report:** flows covered, flows blocked and why, the three runs, the fail-once lines, any product bug.

## The ledger

`docs/specs/tests/<area>.md`, one table per area: feature (from the feature list), flow, test file and test name, or `blocked: <what it needs>`, or `e2e`, or `story`. It is how "are we done" is answered. A lane updates only its own area's file.

---

### Task 0: the ground (one lane, first, alone)

**Files:** `apps/conciv/package.json` (devDependencies `@conciv/plugin-testkit`, `@solidjs/testing-library`, `@testing-library/user-event`, `vitest`; script `"test": "node node_modules/@conciv/plugin-testkit/bin/conciv-test.js"`), `apps/conciv/vite.config.ts` (`conciv()`), `pnpm-lock.yaml`, `apps/conciv/src/chat.dom.test.tsx`, `docs/specs/tests/features/*.md`, `docs/specs/tests/app-pane.md`.

- [ ] The app's test setup, with only the dependencies the app's tests import. If the kit still needs `@conciv/harness-testkit`, `@conciv/unplugin` or `@conciv/vitest-config` listed in the app for a run to work, list them and report it: that is the peers problem showing, not something to hide.
- [ ] Commit `chat.dom.test.tsx` (three flows: send and read the reply, stop a held reply, a model failure found by `findByRole('alert', {name})`), after the per-file steps.
- [ ] Copy the four feature lists from the orchestrator inbox into `docs/specs/tests/features/` unchanged: `app.md` (234354-plugins-a), `engine.md` (234512-plugins-q), `plugins.md` (234529-plugins-r), `sdk-embed.md` (234313-plugins3). They were judged against an older kit: their YES and NO marks are stale, their feature rows are the list.
- [ ] Check that the app's `test` task is picked up by CI (`conciv-ci-shards plan` lists `@conciv/app`) and that `turbo run test --filter=@conciv/app` builds what it needs on a clean dist.

Every other task starts when Task 0 is committed.

---

### Tasks 1 to 8: one area each, in parallel

Each task is the per-file steps, repeated for each file of the area, in the order given. The feature rows are the sections named.

| Task | Lane                                     | Area                                                                              | Feature list                     | Files, in order                                                                                                                                                                                                                                                                    |
| ---- | ---------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | plugins-6b                               | App: chat pane, thread, tool, permission and ui cards                             | `app.md`, pane                   | `src/pane/*.dom.test.tsx` beside the pane sources, then `src/pane.browser.test.tsx` for scrolling and focus                                                                                                                                                                        |
| 2    | plugins-a                                | App: shell, navigation, settings, tabs, errors, login                             | `app.md`, shell                  | `src/shell/*.dom.test.tsx`, `src/settings/*.dom.test.tsx`, then `src/shell.browser.test.tsx`                                                                                                                                                                                       |
| 3    | plugins-x                                | App: composer, triggers, drafts, queue, steer, model prompt                       | `app.md`, composer               | `src/composer/*.dom.test.tsx`, then `src/composer.browser.test.tsx` for real focus and IME                                                                                                                                                                                         |
| 4    | plugins-t                                | App: sessions list, search, preview, quick pane                                   | `app.md`, sessions               | the session sources' `*.dom.test.tsx`, then `src/sessions.browser.test.tsx`                                                                                                                                                                                                        |
| 5    | plugins-q                                | Engine: core, chat, ai, db, MCP and code mode, CLI, harness                       | `engine.md`                      | node tests beside the sources in `packages/core`, `packages/chat`, `packages/ai`, `packages/db`, `packages/cli`, `packages/harness`                                                                                                                                                |
| 6    | plugins-r                                | Plugins                                                                           | `plugins.md`                     | node tests in each plugin package; test-runner, whiteboard, recorder and try-it mount the app from their own package; page, terminal, tanstack and ios journeys go under `apps/conciv/src` as `page.dom.test.tsx` and the like, agreed with the app lanes through the orchestrator |
| 7    | plugins3                                 | Plugin SDK and host, unplugin, embed, mascot, grab, client, connection machine    | `sdk-embed.md`                   | node tests beside the sources; components are stories                                                                                                                                                                                                                              |
| 8    | plugins-p (after the vitest config plan) | `e2e/` apps: the built bundle in a host page, real harness CLIs, browser controls | the `e2e` rows of all four lists | Playwright Test under `e2e/`, with the `e2e-utils` helpers `kit-plan.md` lists                                                                                                                                                                                                     |

A package gets its test setup (kit devDependency, `conciv()` in its one `vite.config.ts`, the `test` script) from the lane that owns it, in its first commit there. Packages below the kits (`core`, `chat`, `ai`, `db`, `serve`, `protocol`, `contract`) cannot use the kit: their node tests call the product function directly, and Task 5 starts by stating which plain vitest setup they use and stops for a ruling if none exists.

Order inside an area: the flows most used first (the ones a user meets in the first minute), then errors and edges.

---

## Blocked today (goes to the ledger, not written)

Each needs a ruling or a piece that is not built:

- Journeys that need a failed, held or dropped engine answer (not a model reply): ruled not in the kit. They are `e2e` rows or stay untested until ruled otherwise.
- Journeys across time (the "Yesterday" header, timers): the clock is not built.
- Servers mode and the connect screen; an engine started the way the dev server starts it; two engines on one home.
- The outside-agent call (`engine.mcp`), and a wait for "this session has a page tab".
- Browser-side hard-coded timers (whiteboard binding wait, page attach retries, recorder waits, ios pick limit).
- Reduced motion, offline, downloads, the pop-out window, the host page's shadow root: `e2e/` rows (Task 8).

## Done means

Every row of every feature list is in a ledger as a test, `blocked`, `e2e` or `story`; every committed file was run by the orchestrator; CI on the PR is green except rows that are blocked.
