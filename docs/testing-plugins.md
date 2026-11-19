# How to test a conciv plugin

One way in: `@conciv/plugin-testkit`. It boots the real engine with a fake model, loads the plugin, and
opens the real widget in a real browser. Only the model and the agent CLIs are faked.

- `bootCoreKit({id, plugins, files, stateRoot})` from `@conciv/plugin-testkit/core-kit` starts an engine.
  `plugins` is the same list as the `plugins` config option (a package path, or `[path, options]`);
  `stateRoot` is the project folder, so a `conciv/plugins` folder in it loads as it would in an app.
- `openPluginWidget(browser, {id, plugins, widgetBundle, files, stateRoot, body})` from
  `@conciv/plugin-testkit/widget-suite` boots the same engine, serves a page with the widget bundle
  (`@conciv/embed`'s `conciv-widget.global.js`) and opens it. It returns `{page, kit, close}`.

```ts
const widget = await openPluginWidget(browser, {
  id: 'fake',
  plugins: [PACKAGE_DIR],
  widgetBundle: WIDGET_BUNDLE,
  files: {...fixtureFiles(), 'gate.test.ts': GATED_VITEST_TEST},
  stateRoot: realpathSync(tempDir('conciv-test-runner-panel-')),
})
```

The reference test is `packages/plugins/test-runner/test/test-runner.browser.test.ts`.

Everything below is non-negotiable.

## Drive the UI as a user: accessibility locators ONLY

Use `getByRole`, `getByText`, `getByLabel`. The plugin owns a11y-labelled controls; click those.

```ts
// GOOD
const testsTab = page.getByRole('tab', {name: 'Tests', exact: true})
const panel = page.getByRole('tabpanel', {name: 'Tests'})
await page.getByRole('button', {name: 'Open conciv chat'}).click({timeout: 30_000})
await testsTab.click()
await expect(panel.getByRole('status')).toHaveText('No test run yet')
```

```ts
// BANNED, never
page.locator('.tests-panel')                      // class selector
page.locator('canvas')                            // tag selector
page.locator('[aria-label="Reply"]')              // attribute selector
page.locator('meta[name="conciv-api-base"]')      // reaching for config in the DOM
document.querySelector(...)                       // anywhere, incl. inside page.evaluate
```

If a control can't be reached by role, text or label, that is an accessibility gap to fix in the
plugin, not a reason to fall back to a selector. Playwright pierces open shadow roots, so the
widget's controls are reachable by `getByRole`.

## Never reach into the page

No `page.evaluate(() => window.something())`. No injected globals. No `data-testid` or test hooks in
production code. No reading `localStorage` to discover state. The test already has what it needs:
`widget.kit` carries the engine's `base`, `origin`, `token` and `stateRoot`. Drive behavior through
the plugin's real controls and through its tools.

## The agent path goes through tools

Calling the plugin's tools, as the agent does, is a real external seam:

- `kit.callTool(name, input)` runs a tool through code mode, the way the agent does. Pass the name
  without `external_`: `kit.callTool('deploy_run', {branch: 'fix-header'})`.
- A direct tool is on the engine's `/api/mcp`: connect an MCP client to `${kit.base}/api/mcp` and call
  it by name, as the test runner's browser test does with `test_runner_run`.
- `kit.rpc.plugin.list()` lists every loaded plugin with its `state`: `{status: 'active'}`, or
  `{status: 'failed', error}`.
- `kit.writeProjectFile(path, content)` changes the project the plugin sees.

## Watch and break the RPC socket

The widget talks to the engine over one socket. Observe or fault it; never swap the transport:

- `rpcObserverFor(page)` (`@conciv/plugin-testkit/rpc-observer`) counts and awaits calls.
- `rpcSocketFor(page)` (`@conciv/plugin-testkit/rpc-socket`): await `installed` before the page loads
  the widget, then reload.
- `failRpcCalls`, `abortRpcCalls`, `garbleRpcReplies`, `holdRpcCalls`, `gateRpcCalls`
  (`@conciv/plugin-testkit/rpc-fault`) break calls, and each returns an injector to `repair()` or
  `dispose()`.

## No mocks, no stubs, no fakes. Ever

Real spawned engine, real Chromium, real widget, real MCP. Do not mock a client, stub a tool result,
or fake a session. If something can't be exercised for real, that is a design problem to raise; never
paper over it with a fake.

## Assertions

`toBeVisible()`, `toHaveText()`, `getByText(...)`. Never `expect(querySelector(...)).toBe(true)` and
never `toBe(true)`/`toBe(false)` derived from DOM. Assert what the user sees.

## Two Playwright gotchas

- `browser.newPage()`, NOT `newContext()` (leaked contexts spike CPU/memory).
- `goto(url, {waitUntil: 'domcontentloaded'})`, NOT `networkidle` (the widget's socket never idles).

## Build before you run

The testkit loads the plugin's BUILT `dist`, and the widget from `@conciv/embed`'s `dist`. After ANY
edit to the plugin's `src`, run `pnpm turbo run build --filter=@conciv/plugin-<name>` before running
tests, or you are testing stale code and RED/GREEN is meaningless.

## TDD

Failing test first. RUN it. Watch it fail for the right reason. Then write the code. Never patch the
code and add a test after; a test that passes immediately proves nothing.
