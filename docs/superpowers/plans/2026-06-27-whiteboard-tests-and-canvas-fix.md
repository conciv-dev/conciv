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
  plan's `getExtensionTestApi({server: whiteboard, clientEntry: '@mandarax/extension-whiteboard/client'})` was based on a wrong assumption.

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
- Test helper: a thin local `boot()` that uses `getExtensionTestApi({server: whiteboard, clientEntry: '@mandarax/extension-whiteboard/client'})` and uses only `{callTool, session, apiBase, dispose}` (ignores `page`) — server/tool behavior needs no browser interaction.

**Interfaces:**

- Consumes: `getExtensionTestApi` from `@mandarax/extension-testkit`, `whiteboard` default export.
- Produces: per-file ITs that exercise the real tools over MCP.

- [ ] **Step 1: Failing test (canvas-tools)** — drive the real canvas tools and assert via `callTool('canvas.read')`:
  ```ts
  const {callTool, dispose} = await getExtensionTestApi({
    server: whiteboard,
    clientEntry: '@mandarax/extension-whiteboard/client',
  })
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
    const api = await getExtensionTestApi({server: whiteboard, clientEntry: '@mandarax/extension-whiteboard/client'})
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

**5-AGENT REVIEW VERDICT (TDD lens, HIGH): a fresh SINGLE-client room CONVERGES on the buggy code** (a lone client has no foreign `versionNonce` to reconcile against → Excalidraw does not bump the echoed element → the version-keyed filter at `island.tsx:106` matches → no re-write → quiet). A single-client test therefore passes GREEN on the broken code — a FALSE GREEN. Two clients on the same room ping-pong unbounded (each side's Excalidraw bumps the incoming element to win the nonce conflict → re-writes → the other bumps again). **So two-client is PRIMARY here, not a fallback.** This depends on the testkit `secondClient()` helper — see "Plan-1 testkit additions" at the bottom; implement that first.

Also two VACUOUS-PASS traps the review found, which the assertions must close:

- `canvas.read` returns `row.data` (the element JSON), NOT the `version` column, so `maxVersion` must read `element.version` from inside each `data` object. If `canvas.read` is empty (drain unfinished, or browser room ≠ callTool room), `Math.max(...[])` = `-Infinity` and `-Infinity === -Infinity` passes for the wrong reason. The `maxVersion` helper MUST throw on an empty read, never default to `0`/`-Infinity`.
- Prove the scene is live and the rooms match BEFORE the idle sample: capture `baseline` before the drag and assert `afterDrag > baseline`. A drag that never moved the version (empty/wrong room) must fail loudly, not look like convergence.

- [ ] **Step 1: Write the failing test** — drain a multi-element scene, open a SECOND client on the same `api.session` (`const b = await api.secondClient()`), drag one element on `api.page`, then assert the binding goes quiet WHILE IDLE using only `callTool('canvas.read')`:

  ```ts
  import {expect} from '@playwright/test'

  // Throws on empty so an empty/wrong-room read can never pass vacuously.
  const maxVersion = async (api): Promise<number> => {
    const {elements} = (await api.callTool('canvas.read', {})) as {elements: {version: number}[]}
    if (elements.length === 0) throw new Error('canvas.read returned no elements — drain unfinished or room mismatch')
    return Math.max(...elements.map((element) => element.version))
  }

  const api = await getExtensionTestApi({server: whiteboard, clientEntry: '@mandarax/extension-whiteboard/client'})
  await api.page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()
  await api.callTool('canvas.diagram', {mermaid: 'flowchart TD\n A-->B\n B-->C\n C-->A'})
  await expect
    .poll(async () => ((await api.callTool('canvas.read', {})) as {elements: unknown[]}).elements.length)
    .toBeGreaterThan(0)
  const b = await api.secondClient() // SECOND client on the same room — the real CRDT echo condition
  await b.page.getByRole('button', {name: 'Open the whiteboard canvas'}).click()

  const baseline = await maxVersion(api)
  // drag one element with the real mouse on api.page (select-all, grab a known viewport point on the cluster)
  const afterDrag = await maxVersion(api)
  expect(afterDrag, 'the drag registered and both clients see the same room').toBeGreaterThan(baseline)

  // now sample twice, 6s apart, with ZERO input on either page:
  const first = await maxVersion(api)
  await api.page.waitForTimeout(6_000)
  const second = await maxVersion(api)
  expect(second, 'element versions stop advancing once idle (no echo loop)').toBe(first)
  await b.close()
  await api.dispose()
  ```

- [ ] **Step 2: Run it and CONFIRM RED** — `npx turbo build --filter=@mandarax/extension-whiteboard` then `npx vitest run test/drag-settle.it.test.ts`. Expected: FAIL — `second > first` (the version keeps climbing while idle, two clients ping-ponging the nonce). The `afterDrag > baseline` guard must PASS (proving the scene is live) before the idle assertion fails.
      **If `second === first` (no climb) even with two clients:** STOP — do not proceed to Task 8. Verify (a) the `secondClient()` page actually opened the SAME room (`b` drove the same `api.session`), (b) Excalidraw's reconcile is bumping the version on the nonce conflict (watch the first sample climb during the drag), (c) more elements / a drag during continuous cursor movement. Do NOT weaken `toBe(first)` to a tolerance — a correct fix yields exact equality.
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
    // CRITICAL (5-agent review, correctness lens): the !api buffer guard MUST come first. If we
    // populate `applied`/`rowIds` before mount, the first-mount buffered flush then sees
    // remoteChanged === false and never calls updateScene → the persisted/initial scene never
    // renders (breaks persist + ai-draw). `applied` must mean "what Excalidraw currently displays",
    // so only populate it once `api` exists.
    if (!api) {
      bufferedScene = rows
      return
    }
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
- [ ] **Step 5: Verify NO regression** — `npx vitest run` for the whole whiteboard package (draw, persist, ai-draw, comment, tools, units). All green. **MUST explicitly re-run `persist.it.test.ts` AND `ai-draw.it.test.ts`** (5-agent review: the buffered-flush bug only surfaces there — a fresh empty room hides it, so passing `drag-settle` alone is NOT sufficient to declare GREEN). Confirm `grep -rnE 'createEffect|useEffect' packages/extensions/whiteboard/src` → none, and no leftover `console.log`.
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

---

## 5-Agent review — RECONCILED amendments (2026-06-28, DONE; this section is authoritative over anything above it)

All five lenses ran against the IMPLEMENTED testkit. Reconciled outcome:

### A. Critical correctness (inlined above)

1. **Task 8 `applyRemote` guard order (correctness lens, HIGH)** — the `if (!api) {bufferedScene = rows; return}` MUST be the FIRST statement, before `applied`/`rowIds` are populated. Otherwise the first-mount buffered flush sees `remoteChanged === false` and never renders the persisted/initial scene → breaks persist + ai-draw. **Fixed inline in Task 8 Step 2.**
2. **Task 7 single-client false GREEN (TDD lens, HIGH)** — a fresh single-client room converges on the buggy code. Two-client is now PRIMARY; `maxVersion` reads `data[].version` and throws on empty; `baseline`→`afterDrag>baseline` proves the room match. **Rewritten inline in Task 7.**
3. **Task 8 Step 5** must explicitly re-run `persist` + `ai-draw` (the buffer bug only shows there). **Fixed inline.**

### B. Plan-1 (testkit) additions REQUIRED before the dependent tasks (implement at point of need, TDD)

1. **`secondClient(): Promise<{page, close}>`** on `ExtensionTestApi` — opens `api.page.context().newPage()` and navigates to the SAME served-host origin (NOT `apiBase`, which serves no HTML), so the second page re-reads the same injected session `<meta>` → same room. Needed by Task 7 (primary), the new B2 two-client de-dup task, and presence. Add to `get-extension-test-api.ts` (capture the served `host.origin`, expose a `secondClient` that reuses it).
2. **Surface stylesheet + Wind4 `@property` injection** in `host-runtime.tsx ensureSurface` — the widget's `page/client-api.ts` injects `styles.css?inline` into the shadow root and calls `registerWind4Properties()` + sets `aria-hidden="true"` on the host; the testkit surface currently does none, so whiteboard's pin/comment/compose/thread overlay (UnoCSS utilities) renders UNSTYLED. `getByText`/`getByLabel` still match (Playwright pierces open shadow), but `toBeVisible()` can fail for elements whose box depends on the missing CSS. Implement only IF Task 6 actually fails for a styling reason (run it first); the injected styles must be the EXTENSION's styles, not necessarily the widget's — resolve during Task 6. This is a TESTKIT gap, never an overlay a11y fix.
   - Corollary: the real widget sets `aria-hidden="true"` on the overlay host, so `getByRole` inside the overlay would pass in the testkit but FAIL in the real widget. **Task 6 assertions on the overlay MUST use `getByText`/`getByLabel`, not `getByRole`.**

### C. Coverage amendments (coverage lens) — apply to the listed tasks

- **Task 1:** MOVE `anchor-resolve.it.test.ts` OUT of Task 1 (it needs `bootStack`+`callTool`, it is NOT a pure module test) INTO Task 2. ADD `room.test.ts` (the `roomId` join + empty→`local:local` fallback). Keep the rest of T1 as pure units.
- **Task 2:** ADD `comment.delete` → list-gone. STRENGTHEN `pin.setState`/`comment.move` to assert x/y/elementId preserved + locked→offset (port the old `pin-move.it`). RESTORE enrich `floating-unenriched` + `incremental-delta` cases (M4). ADD approval-metadata unit assertions (`canvasDelete`/`canvasClear`/`comment.delete`/`comment.resolve` carry `approval:'ask'`). ADD the `anchor.resolve` fresh/orphaned/moved drift cases moved from T1.
- **Task 3:** ADD a `callTool('canvas.read')` assertion that the drawn rectangle is in `canvasElements` (type `rectangle`), not only the UI Delete button.
- **Task 5:** STRENGTHEN mermaid to assert element count ≥3 via `canvas.read`; ADD a `canvas.connect` drain case (currently never drained anywhere).
- **Task 6:** Use `getByLabel('Comment')` (real `aria-label`) not `getByRole('textbox')`; assert the post-submit comment text via the thread `getByText(...)` (dialog `aria-label="Comment thread"`). ADD the reverse direction (agent `comment.create` → UI pin renders) AND a UI reply round-trip (fill `Reply`, `Send reply`, then `comment.read` sees the text). Overlay assertions via `getByText`/`getByLabel` only (see B2 corollary).
- **NEW Task (B3 local-delete, HIGH):** draw a rect via real mouse → select → press `Delete` → poll `callTool('canvas.read')` until the element is GONE. This is the ONLY test that exercises Task 8's removal / missing-key branch; without it the fix's delete path is unverified.
- **NEW Task (B2 two-client de-dup, HIGH):** with `secondClient()`, AI-draw once, assert `canvas.read` rectangle count `=== 1` across both pages (no duplicate drain). This is the same echo family the fix targets.
- **Presence cursors (E.4):** also needs `secondClient()`. Restore as a task if time permits (assert peer cursor visibility via `getByText`/`getByLabel`); LOWER priority than B2/B3.

### D. Accepted coverage losses (with rationale — do NOT add test-only prod code)

- **Pending-table enqueue / room-isolation / clear-clears-pending** (`canvasPending`): the old tests read the backend `db` directly (`ctx.db.all(canvasPending)`); the testkit deliberately exposes no backend-`db` seam, and adding one would be test-only prod surface (forbidden, `no-tool-registry-self-describe` / `no-test-ids-in-code`). The OBSERVABLE behavior (AI draw appears in the live scene) is covered end-to-end by Task 5 (drain) + B2 (de-dup). The `canvasPending` staging is an internal detail; its loss is accepted.
- **Raw two-connection CRDT sync proof / `startJazzRunner` reachable** (`jazz-sync.it`, `jazz-runner.it`): now testkit-internal infrastructure, exercised implicitly by every IT that boots. Accepted.

### E. Confirmed FITS (no action — recorded so the executor doesn't re-investigate)

- Whiteboard mounts cleanly: its client `Component` reads `toggle`/`comment` (from its own `.client()` value) + `grab` (from the host bag); host-runtime provides everything `ClientApi`/the bag require. (testkit-fit lens, traced.)
- Jazz boots with NO extra testkit config: memory driver is on the client (`jazz-client.tsx`), server uses a writable tmpdir `dataDir`. `/config` + cross-origin `/api/ext/whiteboard/*` pass CORS (loopback origin). (testkit-fit lens.)
- Session survives `page.reload()`: `serve.ts` re-injects the session `<meta>` every request; browser room == callTool header room. (testkit-fit lens.)
- The fix's echo-skip, deletion handling (`isDeleted` not volatile + missing-key branch), version persistence, and `VOLATILE_KEYS` completeness are all correct; cursors/heartbeat touch only collaborators, never element versions (so no timer-driven false-RED). (correctness + TDD lenses.)
- All comment/pin a11y labels exist (compose `role=dialog "New comment"`, `aria-label="Comment"`/`"Add comment"`, pin `"<author> comment, <status>"`, thread `"Comment thread"`/`"Reply"`/`"Send reply"`). No a11y gap; no selector temptation. (anti-hack lens.)

### F. Execution order with the amendments

T1 (units, minus anchor-resolve, plus room.test) → T2 (tools, + anchor-resolve + comment.delete + geometry + enrich + approval) → T3 (draw + canvas.read) → T4 (persist) → T5 (ai-draw count≥3 + connect) → **Plan-1: add `secondClient()`** → T6 (comment-on-element, overlay via getByText/getByLabel; add surface styling only if it fails) → B3 (local-delete) → B2 (two-client de-dup) → T7 (RED, two-client) → T8 (fix, guard-order corrected) → presence (if time).
