# plugins-p: RESEARCH test layers 1-2 + testkit (report before code)

Main @ 476a97995. Read only: no edits, no commits. Evidence with file:line for every claim is in three files (scratchpad 04756fe3…/scratchpad/):

- research-storybook-tl.md (Storybook, testing-library, library docs)
- research-testkits.md (every testkit, its exports, importers, what it boots)
- research-repetition.md (157 test files / 102,821 lines scanned: what repeats; the two example sources verbatim)
  This report gives the numbers and the proposal; follow the cited files for line refs.

## (a) Storybook today: layer 1 already exists and runs as tests

- One Storybook for the repo, in apps/storybook. Config is src/storybook/main.ts; there is no .storybook folder. Versions: storybook 10.6.5, storybook-solidjs-vite 10.7.4, vitest 5.1.0.
- **@storybook/addon-vitest is wired** (main.ts:22). apps/storybook/vitest.config.ts:17-35 runs every story as a vitest browser test (Playwright Chromium, maxWorkers 2, isolate false).
- Counts: 140 stories files, about 460 story exports, 320 `play` functions in 107 files. Largest: ui-kit-chat 44 files / 130 exports, ui-kit-system 36 / 79, builtin-plugins 14 / 62.
- CI job "Storybook browser tests" (ci.yml:329-362), baseline run: 137 files, 445 tests, vitest 39.7 s, job wall 2 m 43 s, 3 red. It is already the fastest UI layer we have.
- Gaps:
  - a11y is `test: 'todo'` (preview.tsx:11), so violations never fail.
  - 4 stories under apps/conciv/src match no glob in main.ts:5-19, so they are never built or run.
  - 7 plays use `fn()` spies (composer, composer-actions, action-row). That breaks the no-mocks law; they should assert on what the user sees.
- Browser tests a story + play replaces:
  - **Already duplicated by an existing play (delete the test):** ui-kit-system clipboard (:206-242 = Copied/CopyFailed), dialog (:491, :549 = Parts/Stacked), truncated text (:1219, :1229 = Rows), JSON tree (:1335, :1343 = PageSnapshot), TextArea autosize (:868-889), chat-tools "no matches" (:121 = NoMatches).
  - **Story exists, needs a play or a missing state (move the test into the story): about 15,** including chat-tools card-body floor and catalog card, the composer chip tooltips (composer.browser:476-512), thread now-line and status visuals, the cards collapsible/permission/fallback/title tooltip, model-selector and the brand lockup blink.
  - **Stay browser tests:** shadow-root focus return, picture-in-picture, streamdown node identity, mascot leak checks, all of conciv.browser (app shell).

## (b) testing-library today

- @solidjs/testing-library 0.8.10 (catalog pnpm-workspace.yaml:95) is imported in 19 files, for `render` (and `cleanup`) only. Cleanup runs globally from vitest-config/src/solid-cleanup-setup.ts.
- Everything else in those files comes from `vitest/browser`: expect.element ×3223, getByRole ×1610, userEvent.keyboard ×398.
- Not used anywhere: screen, @testing-library/user-event, jest-dom, vitest-browser-solid, `test.extend` fixtures, composeStories/setProjectAnnotations.
- Browser mode (Playwright provider, Chromium) is configured in 14 packages' vitest configs. builtin-plugins also runs Firefox; the app's perf project runs Chromium and Firefox.
- So layer 2's shape is already right (render with @solidjs/testing-library, query and act through vitest/browser `page`, `expect.element`). What is missing is fixtures: every file wires providers, fakes and cleanup by hand.

## (c) testkits today: 6 kits, overlapping, no single front door

- **@conciv/harness-testkit** (published). `createTestkit` (create-testkit.ts:113) serves the app's fetch on a real loopback server, with a temp state root and an rpc-over-ws client, all in one process; it also offers the scripted fake harness (`script.hold/release`) and `until`. About 7 exports have no consumer outside the package (autoApprove, withAutoApproval, makeApprovingCallTool, makeApprovingRegistryCall, harnessModes, approvalIds, until's failWhen). Its audit asks for 1,016 lines down to about 500 plus a clock (test-audit-harness-testkit.md:113).
- **@conciv/plugin-testkit** (published). `bootCoreKit` (core-kit.ts:44) = harness-testkit + the real makeApp + plugins; 13 files use it. `openPluginWidget` / `widgetComponentSuite` (widget-suite.ts:105,132) add a static host server and Chromium on the prebuilt bundle; 9 files use them. Five subpaths have one consumer each (chat-wire, rpc-wire, connect-handshake, chat-fault, host/grab).
- **@conciv/browser-fixture** (published): one Chromium per test file.
- **@conciv/plugin-page-testkit** (private, source only, no build or test script).
- **@conciv/vitest-config**: CI reporters, coverage, Solid cleanup, shards, and pack/install for 8 e2e files. shards.ts:18,24 still list packages/extensions and extension-design.
- **@conciv/e2e-utils** (private, for e2e apps). @conciv/ai/testkit is a subpath of a product package (27 importers, 10 of them stories).
- **Done twice or more:**
  - the makeApp adapter ×4 (core-kit.ts:85, core/test/helpers.ts:158-215, cli/test/helpers.ts:51, client/test/helpers.ts:8), and 5 plugin node tests re-wrap bootCoreKit with the same 4 lines;
  - host page + static server ×3 (widget-suite.ts:39-77, embed/test/helpers.ts:74/118, apps/conciv/test/helpers.node.ts:64);
  - proxyTo ×2;
  - fault injection ×2 (plugin-testkit rpc-fault and apps/conciv core-control.ts:483-711);
  - raw chromium.launch ×4 in unplugin plugin.it.
- **Gaps:** no widget driver (it lives only in embed/test/helpers.ts:292-452 and apps/conciv helpers.browser.tsx); no clock for scripted pacing; no shared dead-port helper.
- **Old extension system:** no live testkit imports it.

## (d) What every test file repeats (157 files)

| repeated job                                                                                                                                                               | count                                                                                                                                                                                                                                                                                          | belongs in                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| mounting UI                                                                                                                                                                | 6 different ways. render() ×128 in 19 files. mountView defined twice (ui-kit-chat/test/helpers.tsx:41, ui-kit-chat-tools/test/helpers.tsx:7). createShellHarness ×38 (30 followed by afterEach dispose). createSession(coreRpc()) ×106, mountPane ×35. 3 host-page builders, 3 static servers. | `component`, `pane`, `widget` fixtures                                                    |
| engine boot (makeApp + fake harness + temp home + env + cleanup)                                                                                                           | 4 copies of the adapter + 5 re-wraps + raw makeApp ×10                                                                                                                                                                                                                                         | `engine` fixture                                                                          |
| temp dirs / env                                                                                                                                                            | tempDir shared (41 files) but tmpdir() ×47 in 15 files, recursive rm ×82 in 27, env mutation ×53 in 9                                                                                                                                                                                          | `engine.home` / `tmp` fixture                                                             |
| fake CLI on PATH                                                                                                                                                           | about 7 hand-written copies (cli, core-api.it, harness)                                                                                                                                                                                                                                        | `engine({fakeCli})` option                                                                |
| db open/close                                                                                                                                                              | same body in 4 files                                                                                                                                                                                                                                                                           | `db` fixture                                                                              |
| plugin tool calls (useTool, call, failure readers)                                                                                                                         | 4 plugin node files                                                                                                                                                                                                                                                                            | `plugin` fixture                                                                          |
| widget steps (openChat/openPanel ×5 definitions + 10 inline; sendMessage written 3 ways; composer-textbox locator ×32 in conciv.browser, its name string ×106 in 13 files) | —                                                                                                                                                                                                                                                                                              | `widget` driver                                                                           |
| waits                                                                                                                                                                      | expect.poll 42, vi.waitFor 46, until 43; inline `timeout:` ×936 in 28 files (446 in conciv.browser); fixed sleeps: setTimeout ×11 in 8 files, wait/sleep(N) ×28 in 6 files, 5 sleep helpers                                                                                                    | config defaults once; sleeps removed (scripted harness hold/release, Deferred, TestClock) |
| cleanup                                                                                                                                                                    | onTestFinished ×253 in 23 files, afterEach ×114 in 19; embed.it about 25 describes each boot and tear down their own engine + host page (about 350 lines)                                                                                                                                      | fixture teardown (`use()` then dispose)                                                   |

Stays local: plugin-specific fakes (fakeSimctl, fakeSpawner, fakeHot), state-machine replay tables, plugin-host opencode fixtures, the site/unplugin dev servers, mascot/brand DOM readers (but de-duplicate the two identical pairs), e2e apps (already on e2e-utils).
The audits already name this repetition (test-audit-embed-it.md:100, test-audit-conciv-browser.md:382, test-audit-core-api-it.md:342, test-audit-unplugin-it.md:138). test-rewrite-after-port.md plans no fixture layer: that is the gap this proposal fills.

## (e) Proposal: ONE testkit, three entry points, all fixtures via the runner's own `test.extend`

Package `@conciv/testkit`. It replaces harness-testkit, plugin-testkit, browser-fixture and plugin-page-testkit, and absorbs the duplicated helpers above; the published names re-export from it for one release only if npm users exist (v0: none, so delete). Entries:

| entry                     | runner                       | fixtures (scope)                                                                                                                                                                                                                                                                                                                                                      | layer          |
| ------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `@conciv/testkit/node`    | vitest `test.extend`         | `engine` (test; options: plugins, files, harness script, fakeCli, env), `plugin` (= engine with this package's plugin + `tool(name)`, `call`, typed failure reader), `db` (test), `tmp` (test)                                                                                                                                                                        | 4 node, 5 unit |
| `@conciv/testkit/browser` | vitest browser `test.extend` | `component` (render any JSX inside the real providers: ChatProvider over `createChat(storyConnection(...))`, the kit Theme, Toast/Dialog layers), `pane` (the app shell over a core started through browser commands: session created, pane mounted, disposed on teardown), `chat` (the script handle: `reply(text)`, `hold()`/`release()`, all released at teardown) | 2 component    |
| `@conciv/testkit/flow`    | Playwright `test.extend`     | `engine` (worker scope: one engine per worker, reset per test through rpc), `host` (worker: one static host page server), `widget` (test: a page logged in through the magic link, with a driver: `openNewSession()`, `composer`, `send(text)`, `log`, `panel`, `reload()`), `draft(sessionId)` (reads the engine row)                                                | 3 flow         |

Rules baked in:

- Teardown is the fixture's code after `await use(value)`. Tests never write afterEach/onTestFinished for kit resources.
- Holds are always released in teardown.
- Timeouts come from the config once (expect.element / expect.poll / Playwright expect). No inline `timeout:` and no sleeps. Waiting goes through auto-retrying asserts, `expect.poll` on an engine read, or the scripted harness's hold/release.
- Locators are by role and name only. The driver owns the 106 repeated name strings in one place.
- No mocks: the fake harness is the scripted real harness interface (fake service, not a mock).
- Layer 1 stays Storybook + addon-vitest: plays assert on what the user sees, a11y is switched from `todo` to `error`, the 4 orphan stories are wired, the 7 `fn()` spies become visible-outcome asserts. Hand-written layer-2 tests may reuse a story's args through `composeStories` (storybook/preview-api) instead of rebuilding a host.

Sketch of /browser (library way: vitest docs, Test Context > extend):

```ts
// @conciv/testkit/browser
import {test as base} from 'vitest'
import {render} from '@solidjs/testing-library'

export const test = base.extend<{component: Mount; chat: ScriptedChat}>({
  chat: async ({}, use) => {
    const chat = scriptedChat()
    await use(chat)
    chat.releaseAll()
  },
  component: async ({chat}, use) => {
    await use((view) => render(() => <KitProviders chat={chat.client}>{view()}</KitProviders>))
  },
})
```

Sketch of /flow (library way: Playwright docs, Fixtures, worker-scoped):

```ts
// @conciv/testkit/flow
import {test as base} from '@playwright/test'

export const test = base.extend<{widget: Widget}, {engine: Engine; host: Host}>({
  engine: [
    async ({}, use) => {
      const engine = await startEngine()
      await use(engine)
      await engine.stop()
    },
    {scope: 'worker'},
  ],
  host: [
    async ({engine}, use) => {
      const host = await serveHost(engine)
      await use(host)
      await host.close()
    },
    {scope: 'worker'},
  ],
  widget: async ({page, engine, host}, use) => {
    await engine.reset()
    await use(await openWidget(page, engine, host))
    engine.chat.releaseAll()
  },
})
```

### Example A rewritten (packages/ui-kit-chat/test/composer.browser.test.tsx:420-474, today 55 lines in 2 tests, own ThreadHost + mountView + inline timeouts)

```tsx
import {expect} from 'vitest'
import {page} from 'vitest/browser'
import {test} from '@conciv/testkit/browser'

const GIF = 'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='

test('a sent image shows in its user turn, and a data URL image is named image, never by its data', async ({
  component,
  chat,
}) => {
  component(() => <Thread />)

  await chat.send([
    {type: 'text', content: 'what color is this'},
    {type: 'image', source: {type: 'data', value: GIF, mimeType: 'image/gif'}},
  ])
  await expect.element(page.getByText('what color is this')).toBeVisible()
  await expect.element(page.getByRole('img', {name: 'image-1'})).toBeVisible()

  await chat.send([
    {type: 'text', content: 'what is in this'},
    {type: 'image', source: {type: 'url', value: `data:image/gif;base64,${GIF}`}},
  ])
  await expect.element(page.getByRole('img', {name: 'image', exact: true})).toBeVisible()
  await expect.element(page.getByRole('button', {name: /base64/})).not.toBeInTheDocument()
})
```

The ThreadHost component, the fake "send" button, createChat/storyConnection/ChatProvider wiring, mountView and both timeouts go into the fixture.

### Example B rewritten (packages/embed/test/e2e/embed.it.test.ts:582-656, today 75 lines + 5 helpers, test.setTimeout(240_000) ×2, timeout 30_000 ×8, try/finally release)

```ts
import {expect} from '@playwright/test'
import {test} from '@conciv/testkit/flow'

test('a sent message never comes back as a draft, and a follow-up typed behind a queued send stays the draft across a reload', async ({
  widget,
  engine,
}) => {
  const session = await widget.openNewSession()

  await widget.composer.fill('a message sent right before the reload')
  await widget.send()
  await expect(widget.log.getByText(engine.chat.reply)).toBeVisible()
  await widget.reload()
  await expect(widget.composer).toHaveText('')
  await expect(widget.log.getByText('a message sent right before the reload')).toHaveCount(1)
  await expect.poll(() => engine.draft(session)).toMatchObject({text: ''})

  engine.chat.hold()
  await widget.send('a run that keeps going')
  await widget.send('sent while the run goes')
  await expect(widget.queued('sent while the run goes')).toBeVisible()
  await widget.composer.pressSequentially('typed after the queued send')
  await expect.poll(() => engine.draft(session)).toMatchObject({text: 'typed after the queued send'})

  engine.chat.release()
  await expect(widget.queued('sent while the run goes')).toBeHidden()
  await widget.reload()
  await expect(widget.composer).toHaveText('typed after the queued send')
})
```

Two describes, two tests and the setupWidgetSuite / openPanelOnNewSession / untilPanelDraft / chatBox / chatLog helpers become one journey. Engine boot, host page, login, release-on-teardown and timeouts sit in the fixtures.

## Questions for the maintainer (before any code)

1. Is ONE package `@conciv/testkit` with /node, /browser, /flow entries right? The alternative keeps 3 packages behind one shared fixture core. My recommendation: one package, since v0 has no external users.
2. Flow fixtures: engine per worker, reset per test through rpc (fast), or engine per test (isolated, about 1-2 s each)? My recommendation: per worker plus reset, with per-test as an option.
3. Storybook a11y: switch `test: 'todo'` to `'error'` now, which fails today's violations (count unknown until run), or after the rewrite?
4. The ~8 browser tests already duplicated by plays: delete them in the rewrite's first wave?
