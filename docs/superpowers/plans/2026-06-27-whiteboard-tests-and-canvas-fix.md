# Whiteboard Tests on the TestKit + Canvas Binding Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **DEPENDENCY:** This plan REQUIRES `@mandarax/extension-testkit` (`getExtensionTestApi`) from `docs/superpowers/plans/2026-06-27-extension-testkit.md` to be implemented and green first.
>
> **REVIEW GATE:** Before executing Task 1, dispatch 5 independent review agents (Opus) against THIS plan (see "Pre-execution review" at the bottom), incorporate their findings, and only then start.

**Goal:** Rebuild the whiteboard package's test suite — all deleted — on the real testkit (a11y-driven, no hacks), then fix the canvas binding's echo/lag bug, proven RED→GREEN by those tests.

**Architecture:** Pure unit tests stay plain. Server/tool behavior is driven through the testkit's real server + `callTool` (MCP over HTTP). UI behavior is driven through `getExtensionTestApi(...)` — real browser, real framework mount, `getByRole`/`getByText` only. The binding bug is reproduced by a failing drag/idle test before any production edit, then fixed in `island.tsx`.

**Tech Stack:** vitest (node runner), `@mandarax/extension-testkit`, `@playwright/test` `expect` (for locator assertions), the whiteboard's real MCP tools.

## IMPLEMENTED TESTKIT — real API (this plan must use it verbatim)

The testkit shipped (Plan 1, green) takes the extension as its **two real halves**, because a built-in
extension is genuinely two builder objects sharing one `name`: the server half (`server.ts`, default
export — tools + `.server()`, node-safe, NO `Component`) and the client half (`/client` entry — `Component`

- `.client()`, browser, NO `.server()`). There is no single combined `whiteboard` object; the original
  plan's `getExtensionTestApi(whiteboard)` was based on a wrong assumption.

```ts
import {expect} from '@playwright/test'
import whiteboard from '@mandarax/extension-whiteboard' // SERVER half (start() mounts this)
import {getExtensionTestApi} from '@mandarax/extension-testkit'

const boot = () => getExtensionTestApi({server: whiteboard, clientEntry: '@mandarax/extension-whiteboard/client'})
// → {page, callTool, session, apiBase, dispose}
```

- `node` test files import the SERVER default (`@mandarax/extension-whiteboard`) — node-safe, no Solid/JSX.
- The browser host imports the CLIENT entry (`/client`) itself, by specifier; tests never import it into node.
- The testkit ALSO renders one source-mapped fixture element (`aria-label="Comment target"`) for `grab`.
  Whiteboard's own grab/comment flow still drives whiteboard's real overlay; the fixture is the pick target.
- The testkit OWNS the session (`api.session`); tests never read localStorage for the room.
- Open testkit-fit risks the 5-agent review must check: T4 assumes the session survives `page.reload()`
  (the injected `<meta>` is static in the served HTML, so it does — confirm); T7 may need a second client
  on the same `api.session`, which the testkit does NOT yet provide as a helper (a test can open a second
  page via `playwright` against `api.apiBase` with the same session meta — but that is testkit-internal
  knowledge; if T7 needs it, add a `secondClient()` to Plan 1, do not hand-roll in the whiteboard test).

## Global Constraints

- TDD, no exceptions: failing test first, RUN it, watch it FAIL for the right reason, THEN write production code. Never patch code then add the test.
- No mocks, no stubs, no fakes (incl. build config). Real server, real browser, real grab. (`no-stubs-or-mocks`)
- No `window.*` hooks, no test-ids / `data-testid`, no `page.evaluate` reaching into the page. (`no-test-ids-in-code`)
- Assert via `getByRole`/`getByText`/`getByLabel` + ARIA only. Never `querySelector`, class/attribute selectors, or `toBe(true)` on DOM. (`test-assertions-native`)
- No whiteboard tests in the example app. They live in `packages/extensions/whiteboard/test/`. (user rule)
- No `createEffect`/`useEffect` in whiteboard src; sync via events + reactive bindings. Mutations + `updateScene` only in event/subscription callbacks, never a reactive scope. (session hard rule)
- Production code: zero narration comments, functions not classes, no `any`/casts beyond the existing `as unknown as` bridge helpers, no IIFE, no `else`, no `x!`. (`code-style-hard-rules`, `no-non-null-assertion`)
- **After ANY edit to `packages/extensions/whiteboard/src/**`, run `npx turbo build --filter=@mandarax/extension-whiteboard`** — the testkit (and the example app) mount BUILT dist; stale dist makes RED/GREEN meaningless. (session gotcha, `use-turbo-build`)
- Work only from the worktree. Use `newPage()` not `newContext()`. Use `domcontentloaded` not `networkidle`. (`worktree-stay-in-worktree`, `widget-it-newpage-not-newcontext`, `playwright-networkidle-hangs-live-widget`)

## Starting state

`packages/extensions/whiteboard/src/canvas/island.tsx` is intentionally left at the BUGGY baseline so Task 7 reproduces RED:

- `writeLocal` filters changed elements by `versions.get(id) !== element.version` (version-keyed echo).
- `applyRemote` always calls `updateScene` with all rows (re-pushes the scene on every change, incl. our own echoes).
- pending subscription already uses `{all}` (correct — keep).

`packages/extensions/whiteboard/test/` is EMPTY. `vitest.config.ts` survives (node env, serial, `test/**/*.it.test.ts`).

---

## Task 1: Restore pure unit tests

**Files:**

- Create: `packages/extensions/whiteboard/test/schema.test.ts`, `confine.test.ts`, `oxc-capture.test.ts`, `resolver.it.test.ts`, `anchor-resolve.it.test.ts`, `git-track.it.test.ts`
- Source under test: `src/shared/schema.ts`, `src/anchor/*.ts` (`confine`, `oxc-capture`, `resolver`, `git-track`).

**Interfaces:** none new — these import the real modules directly and assert pure outputs. No testkit, no browser.

- [ ] **Step 1:** Read each source module's exports (`src/anchor/resolver.ts`, `oxc-capture.ts`, `git-track.ts`, `src/shared/schema.ts`) to learn real signatures.
- [ ] **Step 2:** For each, write focused failing-then-passing unit tests for the real behavior (e.g. `confine` clamps a line into a range; `oxc-capture` extracts a symbol at a position; `schema` validates a row). Real inputs, real assertions — no DOM, no mocks. (Write one test file at a time; run it; commit it. Do not batch all six into one step.)
- [ ] **Step 3:** Run `npx vitest run test/<file>` per file, green. **Commit per file**: `test(whiteboard): restore <name> unit tests`.

---

## Task 2: Restore server/tool ITs via the testkit

**Files:**

- Create: `packages/extensions/whiteboard/test/canvas-tools.it.test.ts`, `comment-tools.it.test.ts`, `element-reference.it.test.ts`, `server-config.it.test.ts`, `enrich-worker.it.test.ts`
- Test helper: a thin local `boot()` that uses `getExtensionTestApi(whiteboard)` and uses only `{callTool, session, apiBase, dispose}` (ignores `page`) — server/tool behavior needs no browser interaction.

**Interfaces:**

- Consumes: `getExtensionTestApi` from `@mandarax/extension-testkit`, `whiteboard` default export.
- Produces: per-file ITs that exercise the real tools over MCP.

- [ ] **Step 1: Failing test (canvas-tools)** — drive the real canvas tools and assert via `callTool('canvas.read')`:
  ```ts
  const {callTool, dispose} = await getExtensionTestApi(whiteboard)
  await callTool('canvas.diagram', {mermaid: 'flowchart TD\n A-->B'})
  const read = (await callTool('canvas.read', {})) as {elements: unknown[]}
  expect(read.elements.length).toBeGreaterThan(0)
  await dispose()
  ```
  NOTE: `canvas.diagram`/`canvas.draw` only enqueue a pending row; draining happens in the BROWSER. For a server-only test, assert pending enqueue + the tool result, OR keep the browser (use the full api and wait for drain via `page`). Decide per tool: `canvas.update`/`canvas.delete`/`canvas.read`/`canvas.clear`/`canvas.export` are server-side and assertable via `callTool` alone; `canvas.draw`/`canvas.diagram`/`canvas.connect` need the browser drain (cover those in Task 5).
- [ ] **Step 2:** Verify fail, implement nothing (tools already exist) — these tests fail only if wiring is wrong; if they pass immediately, that's acceptable for restoration of EXISTING server behavior (note it; these are characterization tests of shipped tools, not new code).
- [ ] **Step 3:** comment-tools: `comment.create` → `comment.read`/`comment.list` returns it; `comment.reply` appends; `comment.resolve` flips status; `comment.move`/`pin.setState` update the pin. All via `callTool`.
- [ ] **Step 4:** element-reference, server-config, enrich-worker: port the real behaviors (element.reference resolves a ref; server-config exposes `/config`; enrich-worker enriches a comment anchor). Use `callTool` and/or `fetch(apiBase + '/api/ext/whiteboard/...')`.
- [ ] **Step 5:** Run each, green. **Commit per file**: `test(whiteboard): restore <name> tool IT on the testkit`.

---

## Task 3: UI IT — draw a rectangle

**Files:**

- Create: `packages/extensions/whiteboard/test/draw.it.test.ts`

**Interfaces:** Consumes `getExtensionTestApi`. Uses `@playwright/test` `expect` for locator assertions.

- [ ] **Step 1: Failing test**

  ```ts
  import {expect} from '@playwright/test'
  import whiteboard from '@mandarax/extension-whiteboard'
  import {getExtensionTestApi} from '@mandarax/extension-testkit'

  test('drawing a rectangle creates a selectable shape', async () => {
    const api = await getExtensionTestApi(whiteboard)
    await api.page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
    await api.page.getByRole('radio', {name: 'Rectangle'}).click()
    const vp = api.page.viewportSize() ?? {width: 1280, height: 720}
    const cx = vp.width / 2,
      cy = vp.height / 2
    await api.page.mouse.move(cx - 100, cy - 70)
    await api.page.mouse.down()
    await api.page.mouse.move(cx + 100, cy + 70, {steps: 10})
    await api.page.mouse.up()
    await expect(api.page.getByRole('button', {name: 'Delete'})).toBeVisible({timeout: 10_000})
    await api.dispose()
  })
  ```

- [ ] **Step 2:** Verify it passes (feature already works) — this is the first real a11y UI IT; if the toolbar role names differ, fix the locators against the real Excalidraw a11y (inspect with `page.getByRole` enumeration during dev). Use viewport coordinates — the canvas Portal is fixed full-viewport, so NO canvas selector is needed.
- [ ] **Step 3:** Build dist if any src changed, run, green. **Commit** `test(whiteboard): draw a rectangle (a11y, testkit)`.

---

## Task 4: UI IT — persistence across reload

**Files:**

- Create: `packages/extensions/whiteboard/test/persist.it.test.ts`

- [ ] **Step 1: Failing test** — draw a rectangle (as Task 3), then `api.page.reload()`, re-open the canvas, select-all (`Meta+a`/`Control+a` by platform), assert `getByRole('button', {name: 'Delete'})` visible (the element re-synced from the server). The room is stable because the testkit owns `api.session` across the reload (same page, same injected session meta).
- [ ] **Step 2:** Verify pass (memory-driver browser + persistent server already round-trips). Adjust if the reload drops the session — if so, that's a testkit gap; the session meta must survive reload (raise to the testkit plan).
- [ ] **Step 3:** Build, run, green. **Commit** `test(whiteboard): rectangle survives reload`.

---

## Task 5: UI IT — AI draw drains into the live scene

**Files:**

- Create: `packages/extensions/whiteboard/test/ai-draw.it.test.ts`

- [ ] **Step 1: Failing test** — open canvas, then `await api.callTool('canvas.diagram', {mermaid: 'flowchart TD\n A[Start]-->B[Mid]\n B-->C[End]'})`, then assert the drained elements are real and selectable: select-all and expect `getByRole('button', {name: 'Delete'})` visible (poll with `expect.toPass` up to ~40s for the drain + sync). This exercises `subscribeAll(canvasPending)` → `drainPending` → `convertToExcalidrawElements` (browser-only) → write-back → `applyRemote`.
- [ ] **Step 2:** Verify pass. If the diagram never appears, the `{all}` pending drain or the room targeting is wrong — debug against the real drain, do not stub.
- [ ] **Step 3:** Build, run, green. **Commit** `test(whiteboard): AI canvas.diagram drains into the scene`.

---

## Task 6: UI IT — comment on a picked element (real grab)

**Files:**

- Create: `packages/extensions/whiteboard/test/comment-on-element.it.test.ts`

- [ ] **Step 1: Failing test** — click `getByRole('button', {name: 'Comment on an element'})`; the testkit's real grab activates; click the testkit's real source-mapped fixture element (`getByRole`/`getByText` for its label, e.g. `getByLabel('Comment target')`); then a comment compose appears (`getByRole('textbox')` / `getByRole('button', {name: 'Add comment'})`), fill + submit, and assert the pin/thread is visible via `getByRole`/`getByText` (e.g. the comment text). All a11y, no `[aria-label]` CSS, no window hooks.
- [ ] **Step 2:** Verify pass. If the pin/comment UI lives in the effects shadow root and `getByRole` cannot reach it, prefer `getByText`/`getByLabel` (Playwright pierces open shadow roots; confirm). If genuinely unreachable, that's a real a11y gap to fix in the overlay, not a reason to use a CSS selector.
- [ ] **Step 3:** Build, run, green. **Commit** `test(whiteboard): comment on a picked element via real grab`.

---

## Task 7: UI IT — RED reproduction of the drag/echo loop

**Files:**

- Create: `packages/extensions/whiteboard/test/drag-settle.it.test.ts`

**This is the bug-reproduction task. The test MUST be RED on the current buggy `island.tsx` before Task 8 touches production code.**

- [ ] **Step 1: Write the failing test** — build a small multi-element scene, drag one element, then assert the binding goes quiet WHILE IDLE (no echo loop) using only the external `callTool('canvas.read')` seam (versions are real data, not a page internal):
  ```ts
  import {expect} from '@playwright/test'
  // helper: maxVersion = max element.version from callTool('canvas.read', {})
  const api = await getExtensionTestApi(whiteboard)
  await api.page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await api.callTool('canvas.diagram', {mermaid: 'flowchart TD\n A-->B\n B-->C\n C-->A'})
  // wait for drain (poll canvas.read until elements > 0)
  // drag one element with the real mouse (select-all, grab a known viewport point on the cluster)
  // release, then sample maxVersion twice, 6s apart, with ZERO input between:
  const first = await maxVersion(api)
  await api.page.waitForTimeout(6_000)
  const second = await maxVersion(api)
  expect(second, 'element versions stop advancing once idle (no echo loop)').toBe(first)
  await api.dispose()
  ```
- [ ] **Step 2: Run it and CONFIRM RED** — `npx turbo build --filter=@mandarax/extension-whiteboard` then `npx vitest run test/drag-settle.it.test.ts`. Expected: FAIL — `second > first` (the version keeps climbing while idle).
      **If it does NOT go RED (converges on the buggy code):** STOP. The fresh-room single-client scene may converge — the real loop needed sustained conditions. Escalate the reproduction before any fix: try (a) a second client on the same `api.session` (open a second page against `api.apiBase` with the same injected session — the classic CRDT two-client echo), or (b) more elements / a real drag DURING continuous cursor movement. Do NOT proceed to Task 8 until this test reproduces RED. Do NOT weaken the assertion to make it pass.
- [ ] **Step 3:** Once RED is confirmed, **commit the failing test** on its own (so the regression is recorded): `test(whiteboard): reproduce canvas echo loop on drag (RED)`. (Committing a known-RED test is intentional here; Task 8 turns it green in the next commit.)

---

## Task 8: Fix the canvas binding (GREEN)

**Files:**

- Modify: `packages/extensions/whiteboard/src/canvas/island.tsx` (`applyRemote`, `writeLocal`, + a module-level `contentKey`)

**Interfaces:** internal to the Island binding; no public surface change.

- [ ] **Step 1: Add a content key** (module level) that ignores Excalidraw's volatile re-version fields:
  ```ts
  const VOLATILE_KEYS = new Set(['version', 'versionNonce', 'updated'])
  const contentKey = (value: unknown): string =>
    value === null || typeof value !== 'object'
      ? JSON.stringify(value ?? null)
      : Array.isArray(value)
        ? `[${value.map(contentKey).join(',')}]`
        : `{${Object.keys(value as Record<string, unknown>)
            .filter((key) => !VOLATILE_KEYS.has(key))
            .sort()
            .map((key) => `${key}:${contentKey((value as Record<string, unknown>)[key])}`)
            .join(',')}}`
  ```
- [ ] **Step 2: Replace the `versions` map with an `applied` content-key map and make `applyRemote` skip pure echoes** (do NOT call `updateScene` when the incoming rows match what we already applied — this is the drag-lag fix):

  ```ts
  const applied = new Map<string, string>()
  const rowIds = new Map<string, string>()

  const applyRemote = (rows: readonly ElementRow[]): void => {
    const incoming = new Set(rows.map((row) => row.elementId))
    const remoteChanged =
      rows.some((row) => applied.get(row.elementId) !== contentKey(row.data)) ||
      [...applied.keys()].some((elementId) => !incoming.has(elementId))
    rowIds.clear()
    applied.clear()
    rows.forEach((row) => {
      rowIds.set(row.elementId, row.id)
      applied.set(row.elementId, contentKey(row.data))
    })
    if (!api) {
      bufferedScene = rows
      return
    }
    if (!remoteChanged) return
    guard.applyingRemote = true
    api.updateScene({elements: rows.map((row) => asScene(row.data)), captureUpdate: CAPTURE_NEVER})
    guard.applyingRemote = false
  }
  ```

- [ ] **Step 3: Make `writeLocal` key the echo test off CONTENT, not version:**
  ```ts
  const writeLocal = (next: readonly SceneElement[]): void => {
    if (guard.applyingRemote) return
    const changed = next
      .map((element) => ({element, key: contentKey(asJson(element))}))
      .filter(({element, key}) => applied.get(element.id) !== key)
    if (!changed.length) return
    changed.forEach(({element, key}) => {
      const rowId = rowIds.get(element.id)
      applied.set(element.id, key)
      if (!rowId) {
        const {value} = db().insert(app.canvasElements, {
          room: props.room,
          elementId: element.id,
          data: asJson(element),
          version: element.version,
        })
        rowIds.set(element.id, value.id)
        return
      }
      db().update(app.canvasElements, rowId, {data: asJson(element), version: element.version})
    })
  }
  ```
  (Keep writing `version: element.version` to the row — the schema + `canvas.update` tool use it. Only the ECHO TEST changes from version to content.)
- [ ] **Step 4: Build + verify Task 7 goes GREEN** — `npx turbo build --filter=@mandarax/extension-whiteboard`, then `npx vitest run test/drag-settle.it.test.ts`. Expected: PASS (`second === first`).
- [ ] **Step 5: Verify NO regression** — `npx vitest run` for the whole whiteboard package (draw, persist, ai-draw, comment, tools, units). All green. Confirm `grep -rnE 'createEffect|useEffect' packages/extensions/whiteboard/src` → none, and no leftover `console.log`.
- [ ] **Step 6: Commit** `fix(whiteboard): content-keyed echo + applyRemote skips own echoes (kills drag loop)`.

---

## Self-Review notes (addressed)

- **Coverage:** units (T1), tools (T2), draw (T3), persist (T4), AI-draw (T5), comment-on-element+grab (T6), the bug RED (T7) + fix GREEN (T8).
- **Biggest risk — T7 may not reproduce RED in a fresh single-client room** (observed this session: synthetic scenes converged). T7 Step 2 makes this an explicit STOP/escalate gate (two-client, more elements) rather than a silent pass. The 5-agent review must scrutinize T7's reproduction strategy hardest.
- **Shadow-root a11y (T6):** comment/pin UI is in the effects shadow root; `getByRole` should pierce open shadow roots, but confirm — fall back to `getByText`/`getByLabel`, never a CSS selector.
- **No placeholders:** T8 carries the full real implementation. T1/T2 reference real modules to read; the executor writes concrete assertions against real signatures (named, not "add tests").

---

## Pre-execution review (REQUIRED — 5 agents)

Before Task 1, and only AFTER the testkit is implemented and green, dispatch **5 independent Opus review agents** in parallel, each given this plan + the spec, with distinct lenses:

1. **TDD/RED-reproduction lens** — does Task 7 actually reproduce the bug RED on the buggy `island.tsx`? Is the escalation path (two-client / multi-element) sound? Could the assertion pass vacuously (e.g. `canvas.read` empty)?
2. **Anti-hack/contract lens** — any `window.*`, `page.evaluate`, test-id, CSS/`[aria-label]` selector, stub, or mock sneaking in? Is every seam real?
3. **Correctness-of-fix lens** — is the content-key + applyRemote-skip fix actually correct (deletes via `isDeleted`, removals via the missing-key branch, no lost remote updates, no dropped genuine local edits)? Edge cases?
4. **Coverage/gaps lens** — what whiteboard behavior is untested after this plan (presence/cursors, drag-prompt, anchor enrichment, multi-client)? Is anything from the deleted suite lost?
5. **Testkit-fit lens** — do these tests only use the documented `getExtensionTestApi` surface? Any reliance on testkit internals or behavior the testkit plan didn't promise (e.g. session-survives-reload in T4, two-client in T7)? Flag testkit requirements back to plan 1.

Collect all five reports, reconcile conflicts, update THIS plan inline for every confirmed finding, then begin Task 1.
