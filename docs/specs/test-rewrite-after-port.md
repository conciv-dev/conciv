# Test rewrite after the plugin port

Status: plan, rewritten 2026-11-20 to the maintainer's rulings of 2026-11-20. It replaces the 2026-11-19 version
(five layers, Playwright for every browser test, `/flow`, `chat`/`component`/`pane` fixtures, `./testing` exports per
plugin), which is overruled. The rulings themselves are listed in `docs/specs/orchestrator-handoff-2026-11-20.md`.

## Where the old tests are

Every old test and test helper is deleted. The last commit that still has all of them is `9d4f4834f`. Read an old file
with `git show 9d4f4834f:<path>`; list them with `git ls-tree -r --name-only 9d4f4834f | grep -E '\.test\.|\.spec\.'`.

Kept, not rewritten: the `e2e/` suites (only `e2e/nextjs/packed-closure.spec.ts` went), the tanstack-start demo
tests, the Swift tests (`.github/workflows/swift.yml`), `.claude/hooks/*.test.sh`, the Storybook stories, the lint
rule test `packages/oxlint-plugin/src/playwright-test-in-e2e.test.ts`, and the sample
`packages/plugins/test-runner/src/test-runner.dom.test.tsx`.

The plan is `docs/specs/test-split/`: every old test has one row with its destination and its journey group (`M-*`),
and `worth-it.md` is the pass that dropped duplicates. It is updated in place to the 2026-11-20 rulings (see "How the
rewrite runs", step 3). Background: `docs/specs/test-audit/` and `docs/specs/test-research/`.

## Goal

Every user-facing behaviour is proven once, by a journey that does what a user does: clicks, types, reads what is on
screen. A test is never written per old test or per spec line. Each journey lists the old tests whose behaviour it now
covers, so git history proves that nothing was lost.

## Where a test runs

The file name picks the runner. `conciv()` (`@conciv/unplugin`) sets the three vitest projects when vite's mode is
`test`; each package has one `vite.config.ts` and no `vitest*.config` file.

| file                                      | runner                                | what it proves                                                                                                         | kit                                      |
| ----------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `src/x.test.ts`, next to `src/x.ts`       | vitest, node                          | engine, CLI, db, harness, plugin tools and rpc, over real processes and real files; pure functions as `it.each` tables | `createEngine`, `createHarnessEngine`    |
| `src/x.dom.test.tsx`, next to `src/x.tsx` | vitest, happy-dom                     | the whole app with its plugins, as the user sees and uses it, with no layout                                           | `createEngine` + `mount`                 |
| `src/<package>.browser.test.tsx`          | vitest browser mode, Chromium         | only what happy-dom cannot: layout, scrolling and the virtual list, canvas (whiteboard, terminal), real focus          | `createEngine` + `mount`, `pageErrors()` |
| `e2e/<app>/test/*.spec.ts`                | Playwright Test (only under `e2e/`)   | the built bundle in real host apps: framework wrappers, packed install, bundler plugins                                | `e2e-utils`                              |
| `src/**/*.stories.tsx` with `play`        | Storybook (`@storybook/addon-vitest`) | one kit component in each of its states, a11y                                                                          | none                                     |

A behaviour lives in the cheapest place that can prove it, and only there: node before happy-dom, happy-dom before
browser mode, browser mode before e2e. A more expensive place never proves it again; it proves the wiring.

e2e per framework, ruled 2026-11-22 by the maintainer: "A framework app under e2e/ holds ONE test: the user signs in
and the widget opens with no error in that framework. It gets a second test only for something that broke in that
framework, and the test title or its ledger row names what broke. Behaviour that needs the real built widget in a real
browser but is not about a framework (reload, real windows and downloads, the file chooser, focus between the host
page and the widget, real CLIs, the CLI binary) is tested once, in one host app, never per framework."

Who may mount the app, ruled 2026-11-20, as opencode (`_ref/opencode/packages/gui-plugins/AGENTS.md`, Tests: "UI
behavior is proven by the app e2e keeper suites"; its plugin packages hold only machine, tool and rpc tests):

- A package the app is made of (it is a dependency of `apps/conciv`: the page plugin, the terminal and tanstack
  plugins, the plugin SDK, the ui kits, the mascot) never mounts the app. It keeps node tests of its machines, models,
  tools and rpc, and stories of its components. Its on-screen journeys live in the app's tests, `apps/conciv/src`.
- The app, and a plugin the app does not contain (test-runner, whiteboard, recorder, try-it), mount the app from their
  own package with the kit.
- A package that runs kit tests lists the kit in its own `devDependencies`. The kits are leaves: they depend on no
  workspace package and name what they need as `peerDependencies` (`docs/specs/kit-build-cycle.md`).

Budgets: test files next to code, never more test files than source files in a package; one browser-mode file per
package; every file at most 1,000 lines (exceptions only with the maintainer's yes). The app is the one exception, as
opencode's keeper suites (`_ref/opencode/packages/app/e2e/regression/`, one suite per product area): `apps/conciv` has
one browser-mode file per product area, `src/<area>.browser.test.tsx`, each at most 1,000 lines.

## The kits

Two kits, one export per entry:

- `@conciv/plugin-testkit/node`: `createEngine({plugins, harness, replies, settings, files, permission, log})`.
  Starts the real engine with the scripted chat; stops it when the test ends.
- `@conciv/plugin-testkit/browser`: `mount({engine, seed: {storage}, route})`. Opens the app on that engine (happy-dom
  and browser mode). Returns nothing; the test drives only the UI with Testing Library and user-event.
- `@conciv/harness-testkit`: `createHarnessEngine({harness, files, settings, replies, config, log})`, for harness
  authors; `createEngine` is built on it.

```tsx
test('a user asks the agent, then opens the tests panel', async () => {
  const engine = await createEngine({plugins: ['@conciv/plugin-test-runner'], replies: ['done']})
  await mount({engine})
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', {name: 'Open conciv chat'}))
  await user.type(await screen.findByRole('textbox'), 'run the tests{Enter}')
  await expect(screen.findByText('done')).resolves.toBeDefined()
  await user.click(await screen.findByRole('tab', {name: 'Tests'}))
  await expect(screen.findByText('No test run yet')).resolves.toBeDefined()
})
```

`replies` takes the reply shapes of opencode's test model (`_ref/opencode/packages/ai/src/testing.ts`), ruled
2026-11-20: text, a tool call, a reply that fails part-way, a reply that never ends (the turn stays running), and a
reply held until the test releases it. The exact shape is in `docs/specs/kit-replies.md`. Two additions, ruled 2026-11-20: the kits
export the `TestLLM` reply helpers, and the engine has `gate()` for a held reply. Connection faults stay out of the kit.

`harness`, ruled 2026-11-20: `createEngine` passes it to `createHarnessEngine`, which already takes it and scripts only
its chat. It is how a test says which models, slash commands and terminal the engine offers, as an opencode test's
setup does (`_ref/opencode/packages/app/e2e/utils/mock-server.ts:154`, `:173`, `core/test/session-runner.test.ts:138`).
The quick harness is the kit's own (ruled 2026-11-20): the scripted harness of `@conciv/harness-testkit` offers a
model list, slash commands and a terminal that is a plain shell, so no test needs a CLI or writes a harness by hand.
The real adapters (claude, codex, gemini, opencode) are proven in `e2e/`. The engine still runs one harness.

A past chat is made with real turns (`engine.session.send`), never by writing rows. Drafts come from
`Platform.draftStore`; `mount` passes an in-memory store. No connection faults in the kit. Page errors as opencode:
`pageErrors()` in browser mode, opt-in, no auto-fail; happy-dom collects nothing. The engine logs through
`log: {level, emit}` as opencode's SDK. Nothing else is exported; a new export needs the maintainer's yes.

## Rules for every test

1. User behaviour only: queries by role, label and text; `user-event`, never `fireEvent` (one allowance:
   `fireEvent.keyDown` with `isComposing` for the composer IME guard).
2. No mocks: no `vi.mock`, `vi.fn`, `vi.spyOn`, `vi.stubGlobal`, `vi.stubEnv`. Fakes are real implementations the
   product accepts (the scripted harness, an in-memory draft store). Config goes through Effect `ConfigProvider`, never
   env writes.
3. No sleeps and no per-call timeouts. Timeouts are set once per runner. A product timer a test must cross becomes an
   option the product reads, default unchanged; fake timers are allowed.
4. No DOM, CSS or geometry reads, no test ids, no class or id locators.
5. Journeys: one `describe` per user flow, consecutive steps in one test. Inputs as `it.each` tables.
6. Tests never write app state outside their temp dirs.
7. No `afterEach`/`onTestFinished` for kit resources; the kit cleans up.

## How the rewrite runs

1. **Delete.** Done: every old test and helper is gone (`7a1b72870`, `ff5941975`, `14f2196a6`, `a28b2de5f`,
   `d32e1cf0f`).
2. **Prove the kit.** One test per place on a real plugin, timed: node, happy-dom (done: the test-runner sample) and
   browser mode. Nothing is planned on a place that has not run.
3. **Plan.** `docs/specs/test-split/`, updated in place by the orchestrator, one area file at a time, seen by the
   maintainer before any writer starts on that area: old layer names to today's runners (L2 happy-dom, L3-BROWSER and
   the browser part of flow vitest browser mode, the built-bundle part of flow e2e), every row that leans on something
   since ruled out (connection faults, held socket calls, fake-indexeddb, the `/flow` and `chat`/`component` fixtures)
   given a new place or a reason it is not carried, and line numbers moved to `9d4f4834f`.
4. **Write.** The package `test` scripts are removed and the hook refuses vitest and playwright for writers, so writers
   cannot run tests. At most 5 writers, one area each, writing exactly what the area's plan says. A writer that cannot
   write a row as planned stops at that row and reports it; the maintainer rules on every deviation.
5. **Make green.** New agents, not the writers, run each area's files and make them pass by fixing the test or the
   product bug it found, never by weakening what the plan row proves. The orchestrator reads every test against its
   plan row and checks the area's coverage list against the old tests at `9d4f4834f`.
6. **One PR** with the kit and all the new tests, from `test/plugin-testkit-mounts`.
7. **Runners back.** The `test` scripts return per package and CI runs them.

## Rulings carried from 2026-11-19 that still hold

- Leak guards (mascot effects and wrappers) are kept and asserted through GSAP's public API after work stops and after
  unmount; listener-count and layout-read-count tests are deleted; reduced motion is kept (happy-dom with reduced
  motion set, plus one browser-mode check of the real media query).
- Real-CLI tests are opt-in by env, as opencode's.
- API kept alive only by its tests is deleted with them; published kit API with no caller is kept (`Suggestion` stays).
- Storybook a11y goes from `todo` to `error`, and today's violations are fixed then.
