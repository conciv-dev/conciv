# How to test a mandarax extension

One way in: `getExtensionTestApi(extension)` from `@mandarax/extension-testkit`. It boots the real
server, mounts the extension in a real browser through the real framework, and hands back the only
seams a test may touch:

```ts
const {page, callTool, session, apiBase, dispose} = await getExtensionTestApi(whiteboard)
```

Everything below is non-negotiable. The old whiteboard tests broke every one of these rules and
rotted; that is why they were deleted.

## Drive the UI as a user — accessibility locators ONLY

Use `getByRole`, `getByText`, `getByLabel`. The extension owns a11y-labelled controls; click those.

```ts
// GOOD
await page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
await page.getByRole('radio', {name: 'Rectangle'}).click()
await expect(page.getByRole('button', {name: 'Delete'})).toBeVisible()
await page.getByLabel('Reply').fill('on it')
await page.getByRole('button', {name: 'Send reply'}).click()
await expect(page.getByText('on it')).toBeVisible()
```

```ts
// BANNED — never
page.locator('.excalidraw')                      // class selector
page.locator('canvas')                            // tag selector
page.locator('[aria-label="Reply"]')              // attribute selector
page.locator('[role="dialog"][aria-label="…"]')   // attribute selector
page.locator('meta[name="pw-api-base"]')          // reaching for config in the DOM
document.querySelector(...)                        // anywhere, incl. inside page.evaluate
```

If a control can't be reached by role/text/label, that is an accessibility gap to fix in the
extension, not a reason to fall back to a selector. (Playwright pierces open shadow roots, so the
effects-shadow pins/comments are reachable by `getByText`/`getByLabel`.)

## Canvas gestures use viewport coordinates, not a canvas locator

The canvas Portal is fixed and fills the viewport, so you never need to locate it:

```ts
const vp = page.viewportSize() ?? {width: 1280, height: 720}
const cx = vp.width / 2,
  cy = vp.height / 2
await page.mouse.move(cx - 100, cy - 70)
await page.mouse.down()
await page.mouse.move(cx + 100, cy + 70, {steps: 10})
await page.mouse.up()
```

## Never reach into the page

No `page.evaluate(() => window.something())`. No injected globals (`window.commentOnElement`,
`window.setSession`, `window.__ready`). No `data-testid` / test hooks in production code. No reading
`localStorage` to discover state. The test already KNOWS what it needs: `session` and `apiBase` come
back from `getExtensionTestApi`. Drive behavior through the extension's real buttons and through
`callTool`.

## The agent / MCP path goes through `callTool`

Invoking the extension's tools (what the AI agent does) is a real external HTTP seam — allowed and
correct:

```ts
await callTool('canvas.diagram', {mermaid: 'flowchart TD\n A-->B'})
const read = (await callTool('canvas.read', {})) as {elements: {version: number}[]}
```

This is NOT reaching into the page — it's the same `/api/mcp` the harness uses. Use it for AI-draw,
agent comments, and for reading server state to assert against (e.g. element versions).

## No mocks, no stubs, no fakes — ever

Real spawned server (real Jazz), real Chromium, real `grab`, real MCP. Do not mock a client, stub a
tool result, or fake a session. If something can't be exercised for real, that is a design problem to
raise — never paper over it with a fake.

## Assertions

`toBeVisible()`, `toHaveText()`, `getByText(...)`. Never `expect(querySelector(...)).toBe(true)` and
never `toBe(true)`/`toBe(false)` derived from DOM. Assert what the user sees.

## Two Playwright gotchas

- `browser.newPage()`, NOT `newContext()` (leaked contexts spike CPU/memory).
- `goto(url, {waitUntil: 'domcontentloaded'})`, NOT `networkidle` (the live widget's SSE never idles).

## Build before you run

The testkit mounts the extension's BUILT `dist`. After ANY edit to the extension's `src`, run
`npx turbo build --filter=@mandarax/extension-<name>` before running tests, or you are testing stale
code and RED/GREEN is meaningless.

## TDD

Failing test first. RUN it. Watch it fail for the right reason. Then write the code. Never patch the
code and add a test after — a test that passes immediately proves nothing.
