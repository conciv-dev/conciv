# Grab As Attachment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a staged element grab a first-class attachment so its visual snapshot survives a panel reload, renders as a card in sent messages instead of raw HTML text, and stops needing a grab-specific persistence channel.

**Architecture:** A grab becomes a `File` named `Grabbed element` with mime `application/vnd.conciv.grab+json`, carrying `{text, snippet, source, rect, preview}`. For a DOM grab the preview is the `outerHTML` of the self-contained clone `packages/page/src/react-grab/capture-element.ts` already builds, rendered inside a scripts-disabled sandboxed iframe. The attachment kind is declared by the **always-on page extension** through `defineAttachment().card().server()`: its card renders in the composer and the transcript (both dispatch through `AttachmentByMime`), and its server expander turns the payload into `modelOnly` grounding text. The persisted `DraftRow.grabs: string[]` channel is replaced by `DraftRow.attachments`, which also fixes reload for images and recordings.

**Composer attachments are the single source of truth for staged grabs.** `PaneGrabStore` is deleted, not shrunk: `GrabApi.stage/staged/clear` operate on composer attachments of the grab mime, so a grab has exactly one representation whether it was staged from the composer, from an extension, or restored from a draft.

**Tech Stack:** TypeScript (strict, NodeNext), Solid, oRPC + zod contracts, drizzle/libSQL, vitest (browser mode via Playwright/Chromium), turbo, pnpm.

**Spec:** GitHub issue [#487](https://github.com/conciv-dev/conciv/issues/487) — read the whole issue before starting; its "Design: a grab is an attachment" section is the spec this plan implements.

**Review history:** two codex (`gpt-5.6-sol`) review rounds, every finding verified against the repo before acceptance.

- Round 1 — 8 HIGH / 4 MEDIUM / 2 LOW, all fixed in v2. Two were design decisions resolved by the repo owner: snapshots render in a **contained sandbox** (scripts-disabled iframe + CSP, not the rrweb/`ElementPreview` model), and grab staging is an **optimistic update** (attach immediately, replace the payload once grounding resolves).
- Round 2 — 6 HIGH / 5 MEDIUM / 1 LOW, all fixed in v3, plus one owner decision: **delete `PaneGrabStore`** rather than sync it. One round-2 finding was rejected: it claimed `page.frameLocator` does not exist in vitest-browser; it does (`@vitest/browser@4.1.10` `context.d.ts:868`, playwright provider only). The real defect was the argument type — it takes a `Locator`, not a string — and that is corrected.
- v5 also relocates the attachment kind from a hand-seeded built-in into the page extension, at the owner's direction — see "Why the page extension and not a built-in" in Task 3.
- Round 4 — 3 HIGH / 4 MEDIUM, all fixed in v5: a `connect`/`disconnect` composer port (the previous `deps.composer()` was never reachable), one per-grab workflow so a pre-composer grab keeps its grounding, code-point-safe truncation with a final minimal-payload fallback, id-matched selection of the replacement attachment, adapter cleanup when an async-generator adapter throws mid-add, a liveness re-check before hydrating a decoded payload, and `pnpm typecheck` on every commit gate.
- Round 3 — 4 HIGH / 4 MEDIUM / 1 LOW, fixed in v4: the `AttachmentState` type name, the pre-composer pending path, a genuinely atomic `replaceAttachment`, budget truncation by binary search over the serialized payload, a reactive and self-pruning payload cache, a multi-waiter `nextDraftWrite`, and a terminal test that goes through `makePaneGrabApi`. One round-3 finding was rejected: it claimed `getByText('Hero at …')` cannot match `↳ in Hero at …`; vitest-browser's `LocatorOptions.exact` defaults to **false** (`context.d.ts:435-440`), so substring matching applies.

## Global Constraints

- **Zero code comments** in TS/TSX. The `conciv/no-comments` lint rule autofix-DELETES them. Write self-explanatory code.
- **Functions, not classes. No IIFEs. No `else`.**
- **No `any`, no `as`, no `@ts-ignore`, no non-null assertion.** Narrow with `instanceof` or a zod parse. `noUncheckedIndexedAccess` and `verbatimModuleSyntax` are on.
- **oxfmt:** no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120. Run `pnpm format` before committing.
- **Local imports carry the `.js` extension** even from `.ts`/`.tsx` sources (NodeNext).
- **No jsdom.** Widget UI is tested in a real browser (`*.browser.test.tsx`). Every Solid package's `vitest.config.ts` pins `test: {environment: 'node'}` — do not change that.
- **No `expect.poll`, no sleeps, no `querySelector`/`getBoundingClientRect` assertions in tests.** Use `await expect.element(...)` with `vitest/browser` `page` locators and `@solidjs/testing-library` `render`.
- **No test-ids in product code.** Locate by role, label, or text.
- **Package gates filter bare:** `pnpm turbo run test --filter=@conciv/page`. A TRAILING `@conciv/page...` means "and all its dependencies" and is blocked by a hook.
- **Mime is exactly** `application/vnd.conciv.grab+json`. **Attachment file name is exactly** `Grabbed element` — `Attachment.Remove` derives its accessible name as `Remove ${attachment.name}` (`packages/ui-kit-chat/src/primitives/attachment/attachment.tsx:42`), so the file name is user-visible copy.
- **New UnoCSS utility classes need an embed rebuild to appear**, and a new `.css` file in a ui-kit package is a review blocker. Reuse classes already present in `apps/conciv/src`.
- **v0, pre-release, no external users:** reshape internal APIs freely and update all call sites. No back-compat shims.
- Before the final commit: `pnpm exec fallow audit --changed-since main --format json` must report nothing INTRODUCED.

---

## Task Breakdown

The task bodies below carry the implementation detail. This section is the contract: what each unit must satisfy before it counts as done, what it depends on, and where work stops for review. Two bodies are too large to run as one unit (Task 3 at ~11 files, Task 6 at ~14), so each is split into lettered units with their own commits. The letters reference step ranges in the body — the body is not renumbered.

| Unit   | Body steps                 | Size | Depends on | Files |
| ------ | -------------------------- | ---- | ---------- | ----- |
| 1      | Task 1, all                | M    | —          | 6     |
| 2      | Task 2, all                | L    | —          | 9     |
| 3a     | Task 3 steps 1-5, 13       | M    | 1          | 5     |
| 3a-fit | Risks section, unit 3a-fit | S    | 3a         | 2     |
| 3b     | Task 3 steps 6-8           | S    | 3a         | 2     |
| 3c     | Task 3 steps 9-12, 14-15   | M    | 3b         | 5     |
| 4      | Task 4, all                | S    | 3a         | 3     |
| 5      | Task 5, all                | M    | —          | 6     |
| 6a     | Task 6 step 5              | M    | 3a, 5      | 2     |
| 6b     | Task 6 steps 6-8, 10       | L    | 6a, 3c     | 7     |
| 6c     | Task 6 steps 1-4, 9, 11    | M    | 6b         | 5     |
| 7      | Task 7, all                | L    | 6c         | 12    |

### Phase 1 — Foundation (units 1, 2, 3a, 3a-fit)

Serializable preview, the persisted attachments column, and the payload codec. Nothing user-visible changes yet.

**Unit 1 — grab preview is markup**

- [ ] `DomPreview` carries `html`, and no consumer references `preview.node` anywhere in the repo
- [ ] A captured preview rebuilds into a detached element and still shows the grabbed text and its inlined styles
- [ ] Verify: `pnpm turbo run test --filter=@conciv/page --filter=@conciv/grab --filter=@conciv/app --filter=@conciv/extension-testkit && pnpm typecheck`

**Unit 2 — drafts persist attachments**

- [ ] `DraftRow.attachments` round-trips through `rpc.drafts.set` → `drafts.get` → composer restore
- [ ] The generated migration adds the column with a `'[]'` default and applies to a populated `drafts` table
- [ ] Every existing `DraftRow` literal in the repo compiles unchanged in meaning
- [ ] Verify: `pnpm turbo run test --filter=@conciv/app --filter=@conciv/contract --filter=@conciv/db --filter=@conciv/core && pnpm typecheck`

**Unit 3a — payload codec**

- [ ] A dom grab, an image grab and a preview-less grab all round-trip through `grabToFile`/`parseGrabPayload`
- [ ] An over-budget payload degrades — preview dropped first, then text truncated — and the emitted file is always within the persistence budget
- [ ] `@conciv/grab/grab-attachment` resolves from dist (tsdown entry + exports map + `zod` dependency), and `sourceLabel` has moved into `@conciv/grab`
- [ ] Verify: `pnpm turbo run test --filter=@conciv/grab && pnpm typecheck`

### Checkpoint: Foundation

- [ ] `pnpm typecheck && pnpm lint && pnpm format:check` clean
- [ ] Grabs still stage and render through the old strip — no user-visible change yet
- [ ] Review before proceeding

### Phase 2 — The card (units 3b, 3c, 4)

The grab becomes a real attachment kind on the page extension, visible in the composer and the transcript, expanded for the agent.

**Unit 3b — sandboxed snapshot frame**

- [ ] Markup renders inside the frame and is readable
- [ ] An inline `onerror` handler in captured markup cannot reach the parent window
- [ ] The frame's layout box equals its rendered size at `scale` 1 and 2, and the iframe does not take pointer events
- [ ] Verify: `pnpm turbo run test --filter=@conciv/extension-page`

**Unit 3c — the card and its registration**

- [ ] The card shows the snapshot, the `↳ in <Component>` line, and falls back to agent text when there is no preview
- [ ] Clicking opens the dialog; the dialog's toggle reveals the exact agent-facing string
- [ ] With the page extension installed, `paneAttachments` reports the grab mime in both `cards` and `adapter.accept`; with no extensions it does not
- [ ] Verify: `pnpm turbo run test --filter=@conciv/grab --filter=@conciv/extension-page --filter=@conciv/app && pnpm typecheck`

**Unit 4 — server expansion**

- [ ] A grab document part expands to exactly one text part carrying the payload's `text`
- [ ] An undecodable payload expands to nothing and does not throw
- [ ] `packages/core/src/app.ts` is untouched and `@conciv/core` gained no dependency
- [ ] Verify: `pnpm turbo run test --filter=@conciv/extension-page --filter=@conciv/core && pnpm typecheck`

### Checkpoint: Card

- [ ] A grab attachment constructed by hand renders as a card in a real browser
- [ ] Nothing stages one yet — the composer path is still the old strip
- [ ] Review before proceeding

### Phase 3 — Staging (units 5, 6a, 6b, 6c)

Grabs start flowing through attachments; the parallel grab lane is deleted. **This is where the bug is fixed.**

**Unit 5 — composer attachment operations**

- [ ] `addAttachment` resolves the created id; `hasAttachment` reflects live state
- [ ] `replaceAttachment` swaps payload in place, keeps row position, releases the displaced attachment through the adapter, and no-ops once the id is gone
- [ ] The in-flight attachment never appears in `attachments()` before the swap
- [ ] Verify: `pnpm turbo run test --filter=@conciv/ui-kit-chat && pnpm typecheck`

**Unit 6a — staging module**

- [ ] `stage` attaches optimistically and replaces after grounding, in either completion order
- [ ] A grab staged before `connect` is attached on connect and still receives its grounded payload
- [ ] `staged()` is reactive, `clear()` removes only grab-mime attachments, `reconcile` prunes dead ids and hydrates restored ones
- [ ] Verify: `pnpm turbo run test --filter=@conciv/app && pnpm typecheck`

**Unit 6b — wire the pane, delete the store**

- [ ] `PaneGrabStore`, `GrabStrip`, `GrabReference`, `stageTexts`, `stageAll` and `StagedGrab` are gone from the repo
- [ ] Both surfaces compile: `chat-pane.tsx` and `panel.$sessionId.$view.tsx`
- [ ] `use-pane-messaging.ts` has no grab branch and no post-send clearing hook was added
- [ ] Verify: `pnpm turbo run test --filter=@conciv/app && pnpm typecheck`

**Unit 6c — prove the bug is fixed**

- [ ] Staging through the real composer grab button, then disposing and remounting against the same fake core, still shows the snapshot and the source label — **this is issue #487's regression test**
- [ ] The `GrabApi` an extension receives can `stage`, `staged` and `clear`, with the terminal extension unmodified
- [ ] Every behaviour pinned by #478 still holds on the attachment lifecycle
- [ ] Verify: `pnpm turbo run test --filter=@conciv/app && pnpm typecheck`

### Checkpoint: Bug fixed

- [ ] The reload test fails on `main` and passes here
- [ ] Manual check in a real browser: stage, reload, snapshot and source label survive
- [ ] Review before proceeding

### Phase 4 — Cleanup (unit 7)

**Unit 7 — remove the grabs channel**

- [ ] `grabs` is gone from `DraftRow`, the `drafts` table, `ComposerDraft`, and both draft-storage schemas
- [ ] `composeUserContent` is deleted and no user message carries a grab text prefix
- [ ] A changeset exists naming a `@conciv/*` package
- [ ] Verify: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`, embed rebuilt before its integration tests, and `pnpm exec fallow audit --changed-since main --format json` reports nothing INTRODUCED

### Checkpoint: Complete

- [ ] Full Verification Checklist at the end of this document, in the user's own browser
- [ ] Ready for PR

## Parallelization

Sequential by dependency, with two exceptions: **unit 5 has no dependency on units 1-4** and can run alongside Phase 1 or 2; **unit 4 is independent of 3b/3c** once 3a lands. Everything in Phase 3 after 6a is strictly sequential — it is one refactor of one file set. Do not parallelize units 6b and 6c: 6c's tests only mean something once 6b's wiring exists.

## Risks Eliminated

Every risk this plan originally carried was either answerable from the code or removable by a decision. Each is recorded with what replaced it, so a reader can tell the difference between "we thought about it" and "it cannot happen".

| Was a risk                                                                                      | Now                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration must alter a populated `drafts` table                                                 | **Gone by design.** The column is nullable, matching every prior `ALTER TABLE ... ADD` in `packages/db/drizzle/`. The contract turns `null` into `[]`, so nullability never escapes the schema layer                                                                    |
| `addAdapterAttachment` might not permit the atomic-replace trick                                | **Gone by verification.** `composer.tsx:121-138` read in full; the contract supports it exactly as written (see Task 5 Step 3)                                                                                                                                          |
| Mounting the page extension in `pane-harness` could break unrelated pane tests                  | **Gone by design.** Extensions are opt-in per test, default `[]`; existing tests mount what they mount today                                                                                                                                                            |
| New UnoCSS classes might generate no CSS                                                        | **Gone by verification.** `packages/embed/uno.config.ts:17` already scans `../extensions/page/src/**/*.{ts,tsx}`, so the card's classes are seen. What remains is a build step, not a hazard: rebuild `@conciv/embed` before judging any visual (already Task 7 Step 5) |
| A stale `dist`/turbo cache could produce a false green                                          | **Gone by process.** The final gate runs with `--force`; `TS7016` on a `@conciv/*` import means purge buildinfo and `.turbo/cache` first                                                                                                                                |
| A native iOS screenshot `dataUrl` could exceed the payload budget and silently drop the preview | **Gone by design** — see unit 3a-fit below. Image previews are refitted to the budget instead of discarded                                                                                                                                                              |

### Unit 3a-fit — image previews are fitted, never dropped

Discovered while resolving the questions below: **every iOS grab is an image preview**, so "drop the preview when over budget" would ship #487's exact symptom to the entire native experience. Dropping is not an acceptable degradation for images, and unlike markup an image can simply be made smaller.

**Files:** create `packages/page/src/grab-fit.ts`; modify the staging call site to run it before `grabToFile`.

- [ ] `fitImagePreview(preview: ImagePreview, maxBytes: number): ImagePreview` re-encodes to webp at progressively smaller scale until the `dataUrl` fits, reusing the canvas/`toDataURL` pattern already in `packages/page/src/element-capture.ts:96-111`
- [ ] An oversized image preview survives a persist/restore round-trip as a smaller image, never as `preview: null`
- [ ] A preview already within budget is returned untouched, byte-identical
- [ ] Verify: `pnpm turbo run test --filter=@conciv/page --filter=@conciv/grab && pnpm typecheck`

It lives in `@conciv/page` (browser, already owns capture and webp re-encoding), not `@conciv/grab` (pure codec, no DOM). Measure a real iOS grab payload while implementing and record the number in the PR.

## Accepted, Bounded

One residual, stated plainly rather than hidden in a risk table: **a DOM snapshot larger than the budget still degrades to agent text.** Markup cannot be re-encoded smaller the way an image can, and the alternative — rasterizing it — is explicitly out of scope. The fallback is bounded (the card renders the grounding text, never an empty frame), deterministic (a byte budget, not a guess), and rare (a styles-inlined clone of a typical element is tens of KB against a 750,000-byte budget). If it turns out not to be rare, the fix is the same one images get: rasterize at capture and persist a fitted image.

## Resolved Questions

Both questions this plan opened were answerable from the code.

- **Does any live path produce an `ImagePreview` grab?** Yes, and it is not an edge case: **every iOS grab is an image preview.** `packages/extensions/ios/src/shared/bridge.ts:28-33` defines `GrabImagePreviewSchema` as the only preview shape the native bridge sends, `bridge-client.ts:82` passes it through, and `makeNativeGrabProvider` (`ios/src/client.tsx:110`) is wired as the grab provider for the native build at `packages/embed/src/native-entry.ts:20`. So the image arm is the entire iOS grab experience, not testkit-only scaffolding — which is what promotes the payload-budget concern above into a real risk row.
- **Does the CSP need `blob:` alongside `data:`?** No. `capture-element.ts` clones nodes verbatim, so a page's `src="blob:…"` is copied into the snapshot — but a `srcdoc` iframe with `sandbox=""` has an opaque origin, and a blob URL is only fetchable from the origin that minted it. Adding `blob:` to the CSP would change nothing; those images render broken exactly like remote ones. No capture-time stripping needed.

---

### Task 1: Make the grab preview serializable

The grab preview holds a live `HTMLElement`, which cannot go into a `File`. `capture-element.ts` already builds a clone that depends on nothing from the origin page (every computed style inlined, pseudo rules in a bundled `<style>`, ids stripped), so its `outerHTML` is a complete snapshot. Size is _not_ capped here — the cap belongs on the serialized payload in Task 3, where the persistence budget is known.

**Files:**

- Modify: `packages/grab/src/grab.ts:14-19`
- Modify: `packages/page/src/react-grab/capture-element.ts:1-26`
- Modify: `packages/page/src/react-grab/adapter.ts:58-63`
- Modify: `packages/extension-testkit/src/host/grab.ts:29-37`
- Modify: `apps/conciv/src/pane/grab-reference.tsx:33-49`
- Test: `packages/page/test/capture-element.browser.test.ts`
- Test: `apps/conciv/test/grab-reference.browser.test.tsx:16-24`

**Interfaces:**

- Consumes: nothing.
- Produces: `type DomPreview = {kind: 'dom'; html: string; width: number; height: number}` from `@conciv/grab`. `captureElement(el: Element): Promise<DomPreview>` keeps its existing signature and never returns null.

- [ ] **Step 1: Write the failing test**

Read `packages/page/test/capture-element.browser.test.ts` first and keep its existing fixture helpers; only the `preview.node` assertions change. Assert on the markup string rather than querying a rebuilt DOM:

```ts
test('the captured preview is markup carrying the inlined styles', async () => {
  const element = mountFixture('<section><span>Payroll Deposit</span></section>')

  const preview = await captureElement(element)

  expect(preview.html).toContain('Payroll Deposit')
  expect(preview.html).toContain('display:')
  expect(preview.html.startsWith('<div')).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/page`
Expected: FAIL — `preview.html` is `undefined`.

- [ ] **Step 3: Change the type**

In `packages/grab/src/grab.ts`, replace the `DomPreview` declaration:

```ts
export type DomPreview = {
  kind: 'dom'
  html: string
  width: number
  height: number
}
```

- [ ] **Step 4: Emit markup**

In `packages/page/src/react-grab/capture-element.ts`, change only `captureSync`'s return; everything from `SKIP_PROPS` down stays byte-identical.

```ts
function captureSync(el: Element): DomPreview {
  const rect = el.getBoundingClientRect()
  const clone = el.cloneNode(true)
  const rules: string[] = []
  if (!(clone instanceof HTMLElement)) return {kind: 'dom', html: '', width: rect.width, height: rect.height}
  inlineComputedStyles(el, clone, rules)
  neutralizeLayout(clone)

  clone.removeAttribute('id')
  clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'))
  const node = document.createElement('div')
  if (rules.length > 0) {
    const style = document.createElement('style')
    style.textContent = rules.join('')
    node.appendChild(style)
  }
  node.appendChild(clone)
  return {kind: 'dom', html: node.outerHTML, width: rect.width, height: rect.height}
}
```

`packages/page/src/react-grab/adapter.ts:58-63` needs no change — `captureElement` still resolves a `DomPreview`.

- [ ] **Step 5: Update the testkit host grab**

In `packages/extension-testkit/src/host/grab.ts`, inside `toGrab`, replace the preview line without an `as` assertion:

```ts
const clone = element.cloneNode(true)
const html = clone instanceof HTMLElement ? clone.outerHTML : ''
```

and use `preview: {kind: 'dom', html, width: box.width, height: box.height},`.

- [ ] **Step 6: Update the existing card renderer**

`apps/conciv/src/pane/grab-reference.tsx` is deleted in Task 5 but must compile and pass now. In `ScaledSnapshot`'s dom arm, replace the `ref` callback with an `innerHTML` binding:

```tsx
<div
  class="pointer-events-none"
  data-pw-grab-scale
  style={{width: `${preview().width}px`, height: `${preview().height}px`}}
  innerHTML={preview().html}
/>
```

Update the `domGrab` fixture in `apps/conciv/test/grab-reference.browser.test.tsx:16-24` to `preview: {kind: 'dom', html: '<div>Payroll Deposit clone</div>', width: size.width, height: size.height}`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm turbo run test --filter=@conciv/page --filter=@conciv/grab --filter=@conciv/app --filter=@conciv/extension-testkit && pnpm typecheck`
Expected: PASS. The workspace typecheck is part of every commit gate in this plan — turbo test alone does not prove strict TypeScript correctness across packages.

- [ ] **Step 8: Commit**

```bash
git add packages/grab/src/grab.ts packages/page/src packages/page/test packages/extension-testkit/src/host/grab.ts apps/conciv/src/pane/grab-reference.tsx apps/conciv/test/grab-reference.browser.test.tsx
git commit -m "refactor(grab): #487 carry the dom preview as markup instead of a live node"
```

---

### Task 2: Persist composer attachments in the server-backed draft

`writeComposerDraft` already base64-encodes attachment files, but the panel's draft row has nowhere to put them, so `apps/conciv/src/pane/draft-storage.ts:50` seeds `attachments: []` on every restore. This task adds the field end to end. `grabs` stays until Task 6.

**Files:**

- Modify: `packages/contract/src/rows.ts:22-28`
- Modify: `packages/db/src/schema.ts:27-34`
- Create: `packages/db/drizzle/<generated>/` (via the generator — the migrations directory is `packages/db/drizzle`, NOT `src/migrations`)
- Modify: `apps/conciv/src/pane/draft-storage.ts:9-12,36-46,48-66`
- Modify: `packages/contract/test/rows.test.ts`, `packages/core/test/rpc/wire.it.test.ts`, `apps/conciv/test/helpers/fake-core.ts`, `apps/conciv/test/draft-storage.test.ts`, and every `DraftRow` literal under `packages/embed/tests/e2e/`
- Test: `apps/conciv/test/draft-storage.test.ts`

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces: `PersistedAttachmentSchema` from `@conciv/contract` — `{id: string; type: string; name: string; contentType: string; data: string}` — and `DraftRow.attachments: PersistedAttachment[]`.

- [ ] **Step 1: Find every DraftRow construction site**

Run and keep the list; every hit must compile after Step 3:

```bash
grep -rn "grabs:" --include="*.ts" --include="*.tsx" packages apps | grep -v dist
```

- [ ] **Step 2: Write the failing test**

Add to `apps/conciv/test/draft-storage.test.ts`, reusing its existing `installServer`/`draftRow`/`settleWrites` helpers (widen `draftRow` to accept attachments):

```ts
const PERSISTED = {
  id: 'a1',
  type: 'document',
  name: 'Grabbed element',
  contentType: 'application/vnd.conciv.grab+json',
  data: 'eyJ4IjoxfQ==',
}

test('an attachment written to the draft comes back on the next mount', async () => {
  vi.useFakeTimers()
  const server: Server = {row: null, writes: [], failReads: false}
  installServer(server)
  const first = await makeDraftStorage(makeRpcClient(BASE), SESSION)
  first.storage.setItem(
    SESSION,
    JSON.stringify({text: 'look at this', quote: null, grabs: [], attachments: [PERSISTED]}),
  )
  await settleWrites()

  expect(server.writes.at(-1)).toMatchObject({attachments: [{id: 'a1', data: 'eyJ4IjoxfQ=='}]})

  server.row = {...draftRow('look at this', []), attachments: [PERSISTED]}
  const second = await makeDraftStorage(makeRpcClient(BASE), SESSION)

  expect(JSON.parse(second.storage.getItem(SESSION) ?? '{}')).toMatchObject({attachments: [{id: 'a1'}]})
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/app`
Expected: FAIL — the written payload has no `attachments`, and the restored cache seeds `attachments: []`.

- [ ] **Step 4: Add the field to the contract**

In `packages/contract/src/rows.ts`, above `DraftRowSchema`:

```ts
export const PersistedAttachmentSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  contentType: z.string(),
  data: z.string(),
})
export type PersistedAttachment = z.infer<typeof PersistedAttachmentSchema>
```

and add `attachments: z.array(PersistedAttachmentSchema).nullable().default([]).transform((value) => value ?? []),` to `DraftRowSchema` directly after `grabs`. The column is nullable in SQLite for migration safety; the contract is where that becomes an always-present array, so no consumer handles `null`.

- [ ] **Step 5: Add the column with a default and generate the migration**

`drafts` is a populated table, so a bare `notNull()` column has no value for existing rows. In `packages/db/src/schema.ts`, declare it with a SQL default:

```ts
attachments: text('attachments', {mode: 'json'}).$type<PersistedAttachment[]>(),
```

**Nullable on purpose.** Every column ever added to a populated table in this repo is nullable — `packages/db/drizzle/20260730123834_transcript_cwd/migration.sql:1-3`, `20260803083012_tombstone_native_key/migration.sql:1`, `20260719075458_nasty_skrulls/migration.sql:1` are all plain `ALTER TABLE ... ADD <name> <type>;`. Matching that precedent means the migration cannot fail on an existing `drafts` table, and no default expression has to be trusted. Rows written before this change read back as `null`; the contract turns that into `[]` (next step), so nothing downstream sees a nullable field.

Add `sql` to the existing `drizzle-orm` import. `@conciv/db` must not gain a dependency on `@conciv/contract` for this — declare the row type locally in `schema.ts`:

```ts
type PersistedAttachment = {id: string; type: string; name: string; contentType: string; data: string}
```

Then run `pnpm --filter @conciv/db gen-migrations` and commit exactly what it writes under `packages/db/drizzle/` plus the regenerated `packages/db/src/migrations.gen.ts`. Do not hand-edit either. Open the generated SQL and confirm it carries the `'[]'` default; if it does not, the table has to be rebuilt rather than altered — stop and report instead of improvising.

- [ ] **Step 6: Round-trip attachments in the pane draft storage**

In `apps/conciv/src/pane/draft-storage.ts`, extend the schema:

```ts
const PersistedAttachmentSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  contentType: z.string(),
  data: z.string(),
})

const PersistedDraftSchema = z.object({
  text: z.string().catch(''),
  grabs: z.array(z.string()).catch([]),
  attachments: z.array(PersistedAttachmentSchema).catch([]),
})
```

Seed the cache from the row:

```ts
let cache = row ? JSON.stringify({text: row.text, quote: null, grabs: row.grabs, attachments: row.attachments}) : null
```

Add `attachments: draft.attachments,` to the `rpc.drafts.set({...})` call inside `write`, and `attachments: row?.attachments ?? [],` to the one in `appendDraft`.

- [ ] **Step 7: Update every construction site from Step 1**

Add `attachments: []` to each `DraftRow` literal found in Step 1 — at minimum `packages/contract/test/rows.test.ts`, `packages/core/test/rpc/wire.it.test.ts`, `apps/conciv/test/helpers/fake-core.ts`, `apps/conciv/test/chat-pane.browser.test.tsx`'s `draftWithGrab`, and the `packages/embed/tests/e2e/` fixtures. `packages/core/src/api/rpc/router.ts:117-126` needs no change: it inserts the validated input row wholesale.

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm turbo run test --filter=@conciv/app --filter=@conciv/contract --filter=@conciv/db --filter=@conciv/core && pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/contract packages/db apps/conciv/src/pane/draft-storage.ts apps/conciv/test packages/core/test packages/embed/tests
git commit -m "feat(drafts): #487 persist composer attachments in the session draft row"
```

---

### Task 3: The grab attachment payload and its sandboxed card

Payload codec and card, both in isolation. Nothing stages a grab attachment yet — that is Task 5.

The card renders captured page markup, so it renders it inside an iframe with `sandbox=""` (no `allow-scripts`, no `allow-same-origin`) and a CSP meta that permits only `data:` subresources. That neutralises inline handlers and blocks network fetches without adopting the rrweb/`ElementPreview` model.

**Files:**

- Create: `packages/grab/src/grab-attachment.ts`
- Modify: `packages/grab/package.json` (exports map + `zod` dependency), `packages/grab/tsdown.config.ts:3`
- Create: `packages/extensions/page/src/shared/grab-attachment.ts`
- Create: `packages/extensions/page/src/client/cards/grab-card.tsx`
- Create: `packages/extensions/page/src/client/cards/grab-snapshot-frame.tsx`
- Modify: `packages/extensions/page/src/client.tsx:1-9`
- Modify: `packages/extensions/page/package.json` (add `@conciv/grab`)
- Test: `packages/grab/test/grab-attachment.test.ts`
- Test: `packages/extensions/page/test/grab-card.solid.browser.test.tsx`
- Test: `packages/extensions/page/test/grab-snapshot-frame.solid.browser.test.tsx`
- Test: `packages/extensions/page/test/fixtures/attachment-harness.tsx` (create)
- Test: `apps/conciv/test/pane-attachments.browser.test.ts`

**Why the page extension and not a built-in:** the page extension is not user-configured — `packages/embed/src/mount-impl.tsx:222` prepends `pageExtension` to whatever the host supplies, and `packages/core/src/app.ts:268` does the same with `pageServerExtension`. It is always on, it already owns page/DOM concerns (`capture-element.ts`, `react-grab/`, `grab-api.ts` all live in `@conciv/page`), and `defineAttachment().card().server()` is the API built for exactly this. Registering built-in instead would mean hand-seeding `core/src/app.ts` and `pane-attachments.ts` — a second always-on mechanism beside an always-on extension.

**Interfaces:**

- Consumes: `DomPreview`, `ImagePreview`, `GrabPreview`, `Grab` from Task 1.
- Produces, from `@conciv/grab/grab-attachment`:
  - `const GRAB_MIME = 'application/vnd.conciv.grab+json'`
  - `const GRAB_FILE_NAME = 'Grabbed element'`
  - `type GrabPayload = {text: string; snippet?: string; source: ElementSource | null; rect: ElementRect | null; preview: GrabPreview | null}`
  - `function grabToFile(grab: Grab): File`
  - `function parseGrabPayload(raw: string): GrabPayload | null`
- Produces, from `packages/extensions/page/src/shared/grab-attachment.ts`: `export const grabAttachment = defineAttachment({mime: GRAB_MIME})` — the shared builder both `client.tsx` and `server.ts` decorate, mirroring `packages/extensions/recorder/src/shared/attachment.ts:5`.
- Produces, from `packages/extensions/page/src/client/cards/grab-card.tsx`: `export function GrabCard(props: AttachmentCardProps): JSX.Element` — `AttachmentCardProps` is imported from `@conciv/extension` (it is NOT exported by `@conciv/ui-kit-chat`, whose index exports only `AttachmentCardSlot`).
- Produces, from `packages/extensions/page/src/client/cards/grab-snapshot-frame.tsx`: `export function GrabSnapshotFrame(props: {html: string; width: number; height: number; scale: number}): JSX.Element`.

- [ ] **Step 1: Write the failing codec test**

Create `packages/grab/test/grab-attachment.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {GRAB_FILE_NAME, GRAB_MIME, grabToFile, parseGrabPayload} from '../src/grab-attachment.js'
import type {Grab} from '../src/grab.js'

const GRAB: Grab = {
  text: '<h1 class="title">Start simple</h1> at src/routes/index.tsx:12:9',
  snippet: '<h1 class="title">Start simple</h1>',
  preview: {kind: 'dom', html: '<div><h1>Start simple</h1></div>', width: 320, height: 48},
  source: {componentName: 'Hero', filePath: 'src/routes/index.tsx', lineNumber: 12},
  rect: {x: 0, y: 0, width: 320, height: 48},
}

describe('grab attachment payload', () => {
  it('round-trips a dom grab through a file body', async () => {
    const file = grabToFile(GRAB)

    expect(file.type).toBe(GRAB_MIME)
    expect(file.name).toBe(GRAB_FILE_NAME)
    expect(parseGrabPayload(await file.text())).toEqual({
      text: GRAB.text,
      snippet: GRAB.snippet,
      source: GRAB.source,
      rect: GRAB.rect,
      preview: {kind: 'dom', html: '<div><h1>Start simple</h1></div>', width: 320, height: 48},
    })
  })

  it('keeps an image preview instead of discarding it', async () => {
    const imageGrab: Grab = {
      ...GRAB,
      preview: {kind: 'image', dataUrl: 'data:image/png;base64,AAA', width: 10, height: 10},
    }

    const payload = parseGrabPayload(await grabToFile(imageGrab).text())

    expect(payload?.preview).toEqual({kind: 'image', dataUrl: 'data:image/png;base64,AAA', width: 10, height: 10})
  })

  it('drops the preview when the payload would exceed the persistence budget', async () => {
    const huge: Grab = {...GRAB, preview: {kind: 'dom', html: '<p>é</p>'.repeat(200_000), width: 10, height: 10}}

    const payload = parseGrabPayload(await grabToFile(huge).text())

    expect(payload?.preview).toBeNull()
    expect(payload?.text).toBe(GRAB.text)
  })

  it('truncates the text when even the preview-less payload is over budget', async () => {
    const wordy: Grab = {...GRAB, text: 'é'.repeat(500_000), snippet: 'é'.repeat(500_000), preview: GRAB.preview}

    const file = grabToFile(wordy)
    const payload = parseGrabPayload(await file.text())

    expect(payload?.preview).toBeNull()
    expect(payload?.snippet).toBeUndefined()
    expect(new TextEncoder().encode(await file.text()).length).toBeLessThanOrEqual(750_000)
    expect(payload?.text.endsWith('…')).toBe(true)
  })

  it('returns null for a body that is not a grab payload', () => {
    expect(parseGrabPayload('{"nope":true}')).toBeNull()
    expect(parseGrabPayload('not json at all')).toBeNull()
  })
})
```

The third test is the codex finding about units: the budget is counted in **UTF-8 bytes of the serialized payload**, then in its base64 cost, not in UTF-16 characters. `'<p>é</p>'.repeat(200_000)` is ~1.6M UTF-8 bytes from 1.4M UTF-16 characters.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/grab`
Expected: FAIL — `src/grab-attachment.js` does not exist.

- [ ] **Step 3: Write the codec**

Create `packages/grab/src/grab-attachment.ts`:

```ts
import {z} from 'zod'
import type {Grab, GrabPreview} from './grab.js'

export const GRAB_MIME = 'application/vnd.conciv.grab+json'

export const GRAB_FILE_NAME = 'Grabbed element'

const MAX_PERSISTED_BASE64_CHARACTERS = 1_000_000

const BASE64_BYTES_PER_CHARACTER = 3 / 4

const MAX_PAYLOAD_BYTES = Math.floor(MAX_PERSISTED_BASE64_CHARACTERS * BASE64_BYTES_PER_CHARACTER)

const ElementSourceSchema = z.object({
  componentName: z.string().nullable(),
  filePath: z.string(),
  lineNumber: z.number().nullable(),
})

const ElementRectSchema = z.object({x: z.number(), y: z.number(), width: z.number(), height: z.number()})

const GrabPreviewSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('dom'), html: z.string(), width: z.number(), height: z.number()}),
  z.object({kind: z.literal('image'), dataUrl: z.string(), width: z.number(), height: z.number()}),
])

const GrabPayloadSchema = z.object({
  text: z.string(),
  snippet: z.string().optional(),
  source: ElementSourceSchema.nullable(),
  rect: ElementRectSchema.nullable(),
  preview: GrabPreviewSchema.nullable(),
})

export type GrabPayload = z.infer<typeof GrabPayloadSchema>

function payloadOf(grab: Grab, preview: GrabPreview | null): GrabPayload {
  return {
    text: grab.text,
    ...(grab.snippet === undefined ? {} : {snippet: grab.snippet}),
    source: grab.source,
    rect: grab.rect,
    preview,
  }
}

function payloadBytes(payload: GrabPayload): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length
}

function withinBudget(payload: GrabPayload): boolean {
  return payloadBytes(payload) <= MAX_PAYLOAD_BYTES
}

function truncatedTo(payload: GrabPayload, codePoints: readonly string[], length: number): GrabPayload {
  return {...payload, text: `${codePoints.slice(0, length).join('')}…`}
}

function shrunkToBudget(payload: GrabPayload): GrabPayload {
  const codePoints = Array.from(payload.text)
  let low = 0
  let high = codePoints.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    const fits = withinBudget(truncatedTo(payload, codePoints, middle))
    if (fits) low = middle
    if (!fits) high = middle - 1
  }
  return truncatedTo(payload, codePoints, low)
}

export function grabToPayload(grab: Grab): GrabPayload {
  const full = payloadOf(grab, grab.preview)
  if (withinBudget(full)) return full
  const withoutPreview = payloadOf({...grab, snippet: undefined}, null)
  if (withinBudget(withoutPreview)) return withoutPreview
  const shrunk = shrunkToBudget(withoutPreview)
  if (withinBudget(shrunk)) return shrunk
  return {text: shrunk.text, source: null, rect: null, preview: null}
}

export function grabToFile(grab: Grab): File {
  return new File([JSON.stringify(grabToPayload(grab))], GRAB_FILE_NAME, {type: GRAB_MIME})
}

export function parseGrabPayload(raw: string): GrabPayload | null {
  try {
    const parsed = GrabPayloadSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
```

`MAX_PERSISTED_BASE64_CHARACTERS` mirrors `MAX_PERSISTED_ATTACHMENT_CHARACTERS` in `packages/ui-kit-chat/src/behaviors/composer-draft-storage.ts:6`. `@conciv/grab` must not depend on `@conciv/ui-kit-chat`, so the constant is duplicated deliberately — if you change one, change both.

- [ ] **Step 4: Make the new entry resolvable**

`packages/grab/tsdown.config.ts:3` builds only `src/grab.ts` and the manifest exports only `.`, so a second module is invisible to dist consumers. Add the entry:

```ts
entry: ['src/grab.ts', 'src/grab-attachment.ts'],
```

and in `packages/grab/package.json` add the export plus the dependency (`@conciv/grab` currently declares no dependencies at all):

```json
"exports": {
  ".": {"types": "./dist/grab.d.ts", "import": "./dist/grab.js"},
  "./grab-attachment": {"types": "./dist/grab-attachment.d.ts", "import": "./dist/grab-attachment.js"}
},
"dependencies": {"zod": "catalog:"}
```

Use whatever specifier the repo's other packages use for zod (check a sibling manifest — if they pin a version instead of `catalog:`, match that). Then run `pnpm install`.

- [ ] **Step 5: Run the codec test to verify it passes**

Run: `pnpm turbo run test --filter=@conciv/grab`
Expected: PASS.

- [ ] **Step 6: Write the failing sandbox test**

Create `packages/extensions/page/test/grab-snapshot-frame.solid.browser.test.tsx`. The `.solid.browser.` infix is load-bearing: `packages/extensions/page/vitest.config.ts` routes those files to the `browser-solid` project with `vite-plugin-solid`; a plain `.browser.test.tsx` lands in the React-JSX project and will not compile a Solid component.

`page.frameLocator` exists in `@vitest/browser@4.1.10` (`context.d.ts:868`) and is supported only by the playwright provider, which this suite uses. It takes a **`Locator`, not a string** — pass the iframe's title locator.

```tsx
import {render} from '@solidjs/testing-library'
import {expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {GrabSnapshotFrame} from '../src/client/cards/grab-snapshot-frame.js'

const frame = () => page.frameLocator(page.getByTitle('Grabbed element snapshot'))

test('the snapshot frame renders the markup', async () => {
  render(() => <GrabSnapshotFrame html="<p>Payroll Deposit clone</p>" width={200} height={40} scale={1} />)

  await expect.element(frame().getByText('Payroll Deposit clone')).toBeVisible()
})

test('hostile markup in a snapshot cannot run inside the widget', async () => {
  render(() => (
    <GrabSnapshotFrame
      html={'<img src="x" onerror="window.parent.__grabEscaped = true">'}
      width={200}
      height={40}
      scale={1}
    />
  ))

  await expect.element(frame().getByRole('img')).toBeAttached()
  expect(Reflect.get(window, '__grabEscaped')).toBeUndefined()
})
```

This proves script containment (`sandbox=""` withholds `allow-scripts`), **not** network containment — `sandbox=""` alone still permits image, style and font requests, which is what the CSP is for. Do not claim otherwise in the PR. Network containment is verified by hand from the Verification Checklist; if you want it automated, that needs a fixture server counting requests, which is out of scope here.

- [ ] **Step 7: Run it to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/app`
Expected: FAIL — `src/pane/grab-snapshot-frame.js` does not exist.

- [ ] **Step 8: Write the sandboxed frame**

Create `packages/extensions/page/src/client/cards/grab-snapshot-frame.tsx`:

```tsx
import type {JSX} from 'solid-js'

const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline' data:; font-src data:"

const WRAPPER = 'block overflow-hidden max-w-full'

const FRAME = 'block border-0 bg-transparent pointer-events-none'

function documentFor(html: string): string {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${CSP}"><style>html,body{margin:0;background:transparent}</style></head><body>${html}</body></html>`
}

export function GrabSnapshotFrame(props: {html: string; width: number; height: number; scale: number}): JSX.Element {
  return (
    <div class={WRAPPER} style={{width: `${props.width * props.scale}px`, height: `${props.height * props.scale}px`}}>
      <iframe
        class={FRAME}
        title="Grabbed element snapshot"
        sandbox=""
        referrerpolicy="no-referrer"
        loading="lazy"
        scrolling="no"
        tabindex={-1}
        style={{
          width: `${props.width}px`,
          height: `${props.height}px`,
          transform: `scale(${props.scale})`,
          'transform-origin': '0 0',
        }}
        srcdoc={documentFor(props.html)}
      />
    </div>
  )
}
```

Three things this shape gets right, each of which was a defect in v2:

- The **wrapper owns the scaled layout box** while the iframe keeps its natural box and is transformed. Setting scaled `width`/`height` attributes on an element whose CSS box is unscaled leaves the layout wrong at any `scale !== 1` — clipping in the card, bad scrolling in the dialog.
- The iframe is **`pointer-events-none`**. Pointer events do not cross into a nested browsing context, so without this the visible snapshot would swallow clicks meant for the card's open control.
- `sandbox=""` withholds `allow-scripts` and `allow-same-origin`, so inline handlers never run and the frame cannot reach the widget document. The CSP is what stops captured URLs from loading.

- [ ] **Step 9: Write the failing card test**

Create `packages/extensions/page/test/fixtures/attachment-harness.tsx` exporting `mountAttachment(file: File, children: () => JSX.Element): JSX.Element`, which wraps `children()` in `AttachmentProvider` (from `@conciv/ui-kit-chat`) with a `PendingAttachment`: `{id: 'grab-1', type: 'document', name: file.name, contentType: file.type, file, status: {type: 'requires-action', reason: 'composer-send'}}`. Mirror how `packages/ui-kit-chat/test/element-preview.browser.test.tsx` mounts its subject.

Create `packages/extensions/page/test/grab-card.solid.browser.test.tsx`:

```tsx
import {render} from '@solidjs/testing-library'
import {expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {GRAB_FILE_NAME, GRAB_MIME} from '@conciv/grab/grab-attachment'
import {GrabCard} from '../src/client/cards/grab-card.js'
import {mountAttachment} from './fixtures/attachment-harness.js'

const PAYLOAD = JSON.stringify({
  text: '<h1 class="title">Start simple</h1> at src/routes/index.tsx:12:9',
  snippet: '<h1 class="title">Start simple</h1>',
  source: {componentName: 'Hero', filePath: 'src/routes/index.tsx', lineNumber: 12},
  rect: {x: 0, y: 0, width: 320, height: 48},
  preview: {kind: 'dom', html: '<h1>Start simple</h1>', width: 320, height: 48},
})

function mount(payload: string = PAYLOAD) {
  return render(() => mountAttachment(new File([payload], GRAB_FILE_NAME, {type: GRAB_MIME}), () => <GrabCard />))
}

test('the card shows the snapshot and its source label', async () => {
  mount()

  await expect
    .element(page.frameLocator(page.getByTitle('Grabbed element snapshot')).getByText('Start simple'))
    .toBeVisible()
  await expect.element(page.getByText('Hero at src/routes/index.tsx:12')).toBeVisible()
})

test('clicking the card opens a dialog that can reveal the agent text', async () => {
  mount()

  await userEvent.click(page.getByRole('button', {name: 'Open grabbed element'}))
  await expect.element(page.getByRole('dialog', {name: 'Grabbed element'})).toBeVisible()

  await userEvent.click(page.getByRole('button', {name: 'What the agent sees'}))

  await expect.element(page.getByText('<h1 class="title">Start simple</h1> at src/routes/index.tsx:12:9')).toBeVisible()
})

test('a payload with no preview falls back to the agent text', async () => {
  mount(JSON.stringify({text: 'grabbed thing at a.tsx:1:1', source: null, rect: null, preview: null}))

  await expect.element(page.getByText('grabbed thing at a.tsx:1:1')).toBeVisible()
})
```

- [ ] **Step 10: Run it to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/app`
Expected: FAIL — `src/pane/grab-card.js` does not exist.

- [ ] **Step 11: Write the card**

Create `packages/extensions/page/src/client/cards/grab-card.tsx`. A content part's `value` is base64 of the file's **UTF-8 bytes** (`packages/ui-kit-chat/src/primitives/attachment/attachment-adapter.ts:85-103`), so decode through `TextDecoder` — a bare `atob` mangles non-ASCII markup.

```tsx
import {createResource, createSignal, Show, type JSX} from 'solid-js'
import {useAttachment} from '@conciv/ui-kit-chat'
import {Dialog} from '@conciv/ui-kit-system'
import type {AttachmentCardProps} from '@conciv/extension'
import {parseGrabPayload, type GrabPayload} from '@conciv/grab/grab-attachment'
import {sourceLabel} from '@conciv/grab'
import {GrabSnapshotFrame} from './grab-snapshot-frame.js'

type AttachmentState = ReturnType<typeof useAttachment>

const CARD =
  'text-[0.6875rem] font-pw-mono p-3 border border-pw-line rounded-pw-md bg-pw-fill flex flex-col gap-2.5 items-start relative'
const PREVIEW_SLOT = 'relative max-w-full'
const OPEN_BUTTON = 'absolute inset-0 cursor-pointer [border:none] bg-transparent p-0'
const SOURCE_LINE = 'text-pw-text-2 flex gap-1.5 [word-break:break-all] items-center'
const AGENT_TEXT = 'text-pw-text-2 font-pw-mono text-xs whitespace-pre-wrap [word-break:break-all] m-0'
const TOGGLE = 'text-pw-text-2 cursor-pointer [border:none] bg-transparent underline'

function decodeBase64Utf8(value: string): string | null {
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

async function resolvePayload(attachment: AttachmentState): Promise<GrabPayload | null> {
  if ('content' in attachment)
    for (const part of attachment.content)
      if (part.type === 'document' && part.source.type === 'data') {
        const body = decodeBase64Utf8(part.source.value)
        return body === null ? null : parseGrabPayload(body)
      }
  if (attachment.file) return parseGrabPayload(await attachment.file.text())
  return null
}

function Preview(props: {payload: GrabPayload; scale: number}): JSX.Element {
  const preview = () => props.payload.preview
  return (
    <Show when={preview()} fallback={<pre class={AGENT_TEXT}>{props.payload.text}</pre>}>
      {(value) => (
        <Show
          when={value().kind === 'image' ? value() : null}
          fallback={
            <Show when={value().kind === 'dom' ? value() : null}>
              {(dom) => (
                <GrabSnapshotFrame
                  html={dom().kind === 'dom' ? dom().html : ''}
                  width={dom().width}
                  height={dom().height}
                  scale={props.scale}
                />
              )}
            </Show>
          }
        >
          {(image) => (
            <img
              class="block w-auto h-auto max-w-full"
              src={image().kind === 'image' ? image().dataUrl : ''}
              width={image().width * props.scale}
              height={image().height * props.scale}
              alt=""
            />
          )}
        </Show>
      )}
    </Show>
  )
}

export function GrabCard(props: AttachmentCardProps): JSX.Element {
  const attachment = useAttachment()
  const [payload] = createResource(() => resolvePayload(attachment))
  const [open, setOpen] = createSignal(false)
  const [showAgentText, setShowAgentText] = createSignal(false)
  return (
    <Show when={payload()}>
      {(value) => (
        <div class={CARD} data-pw-grab>
          {props.remove}
          <Show when={value().preview} fallback={<pre class={AGENT_TEXT}>{value().text}</pre>}>
            <div class={PREVIEW_SLOT}>
              <Preview payload={value()} scale={1} />
              <button
                type="button"
                class={OPEN_BUTTON}
                aria-label="Open grabbed element"
                onClick={() => setOpen(true)}
              />
            </div>
          </Show>
          <Show when={value().source}>
            {(source) => (
              <Show when={sourceLabel(source())}>
                {(label) => (
                  <span class={SOURCE_LINE}>
                    <span class="text-pw-accent" aria-hidden="true">
                      ↳
                    </span>{' '}
                    in {label()}
                  </span>
                )}
              </Show>
            )}
          </Show>
          <Dialog
            open={open()}
            onOpenChange={setOpen}
            title="Grabbed element"
            size="xl"
            dismissable
            footer={
              <button type="button" class={TOGGLE} onClick={() => setShowAgentText((shown) => !shown)}>
                {showAgentText() ? 'Show snapshot' : 'What the agent sees'}
              </button>
            }
          >
            <Show when={!showAgentText()} fallback={<pre class={AGENT_TEXT}>{value().text}</pre>}>
              <Preview payload={value()} scale={2} />
            </Show>
          </Dialog>
        </div>
      )}
    </Show>
  )
}
```

If the nested `Show` narrowing above fights the discriminated union, extract two components (`DomPreviewFrame`, `ImagePreviewFigure`) taking already-narrowed props rather than reaching for `as`.

Every class name must already exist in the widget's UnoCSS output — the scanner only sees literal strings. If a token here is not already used in `apps/conciv/src`, swap it for one that is.

- [ ] **Step 12: Declare the attachment on the page extension**

Create `packages/extensions/page/src/shared/grab-attachment.ts`, mirroring `packages/extensions/recorder/src/shared/attachment.ts`:

```ts
import {defineAttachment} from '@conciv/extension'
import {GRAB_MIME} from '@conciv/grab/grab-attachment'
import type {PageServerContext} from '../server.js'

export const grabAttachment = defineAttachment<PageServerContext>({mime: GRAB_MIME})
```

The `import type` erases at build time, so this creates no client→server edge — `packages/extensions/recorder/src/shared/attachment.ts:2` does exactly this with `RecorderRuntime`. Verified alongside: `defineExtension` accepts `attachments` on both the client and server declaration (`packages/extension/src/define-extension.ts:38,63,157`); the extension compiler already knows the builder (`packages/extension-compiler/src/split-extension.ts:14` — browser strips `.server`, node strips `.card`); and `packages/extensions/page/vite.config.ts` externalizes `/^@conciv\//` in the client build, so adding `@conciv/grab` cannot double-bundle into the widget.

In `packages/extensions/page/src/client.tsx`, register the card and the attachment:

```tsx
import {grabAttachment} from './shared/grab-attachment.js'
import {GrabCard} from './client/cards/grab-card.js'

grabAttachment.card(GrabCard)

export const page = defineExtension({
  name: PAGE_EXTENSION_NAME,
  tools: PAGE_CLIENT_TOOLS,
  attachments: [grabAttachment],
}).client(() => ({value: {}}))
```

`apps/conciv/src/pane/pane-attachments.ts` needs **no change at all**: `collectAttachmentCards` picks the card up, and `createDocumentAttachmentAdapter` is already created per collected card, so the grab mime becomes acceptable automatically.

Add to `apps/conciv/test/pane-attachments.browser.test.ts`:

```ts
it('accepts grab attachments when the page extension is installed', () => {
  const {cards, adapter} = paneAttachments([pageExtension], false)

  expect(cards.some((entry) => entry.mime === 'application/vnd.conciv.grab+json')).toBe(true)
  expect(adapter.accept).toContain('application/vnd.conciv.grab+json')
})
```

with `import pageExtension from '@conciv/extension-page/client'`.

- [ ] **Step 13: Move `sourceLabel` next to the payload**

The card needs `sourceLabel`, which today lives at `apps/conciv/src/pane/grab-source-label.ts` and (after Task 6 deletes `grab-reference.tsx`) has no other consumer. Move it verbatim into `packages/grab/src/grab.ts` and export it from `@conciv/grab`; delete the app-side file and update imports. It is a pure function over `ElementSource`, so it belongs with the type it formats.

- [ ] **Step 14: Run tests to verify they pass**

Run: `pnpm turbo run test --filter=@conciv/grab --filter=@conciv/extension-page --filter=@conciv/app && pnpm typecheck`
Expected: PASS.

- [ ] **Step 15: Commit**

```bash
git add packages/grab packages/extensions/page apps/conciv pnpm-lock.yaml
git commit -m "feat(page): #487 grab attachment payload and sandboxed card"
```

---

### Task 4: Expand a grab attachment into agent-facing text

The agent must keep receiving `snippet at file:line:col`. Today that is a prefix glued onto the user message; here it is a `modelOnly` part produced by the page extension's attachment expander — the mechanism the recorder already uses (`packages/extensions/recorder/src/server/attachment.ts:5`).

Because the expander rides the extension, **`packages/core/src/app.ts` is not touched at all** and `@conciv/core` gains no new dependency: `buildAttachmentExpanders` (`app.ts:141-149`) already collects `__expand` from every mounted extension, and `pageServerExtension` is always mounted (`app.ts:268`).

**Files:**

- Create: `packages/extensions/page/src/server/grab-attachment.ts`
- Modify: `packages/extensions/page/src/server.ts:23-27`
- Test: `packages/extensions/page/test/grab-expander.test.ts`

**Interfaces:**

- Consumes: `GRAB_MIME`, `parseGrabPayload` (Task 3), `grabAttachment` (Task 3).
- Produces: `grabAttachment.server(expand)` registered through `attachments: [grabAttachment]` on the server extension.

- [ ] **Step 1: Write the failing test**

Read `packages/core/test/expand-attachments.test.ts` first (that is the real filename — there is no `expand-attachments.it.test.ts`) to see the expander contract, then create `packages/extensions/page/test/grab-expander.test.ts` as a plain unit test (no `.browser.` infix — it belongs in the `unit` project):

```ts
import {expect, test} from 'vitest'
import {grabAttachment} from '../src/server/grab-attachment.js'

const PAYLOAD = {text: '<h1>Start simple</h1> at src/routes/index.tsx:12:9', source: null, rect: null, preview: null}

function grabPart(body: string) {
  return {
    type: 'document' as const,
    source: {type: 'data' as const, mimeType: grabAttachment.mime, value: Buffer.from(body, 'utf8').toString('base64')},
  }
}

test('a grab attachment expands into grounding text', async () => {
  const expand = grabAttachment.__expand
  if (!expand) throw new Error('expected the grab attachment to declare a server expander')

  expect(await expand(grabPart(JSON.stringify(PAYLOAD)), {})).toEqual([{type: 'text', content: PAYLOAD.text}])
})

test('an unreadable grab payload expands to nothing rather than throwing', async () => {
  const expand = grabAttachment.__expand
  if (!expand) throw new Error('expected the grab attachment to declare a server expander')

  expect(await expand(grabPart('nope'), {})).toEqual([])
})
```

`__expand` is the builder's own field (`packages/extension/src/define-attachment.ts:13`), not a test-only backdoor. If reaching it here reads as poking internals, assert through `makeApp`'s composed `attachmentExpanders` instead — but do not add a dunder accessor of your own.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/extension-page`
Expected: FAIL — `src/server/grab-attachment.js` does not exist.

- [ ] **Step 3: Write the expander**

Create `packages/extensions/page/src/server/grab-attachment.ts`:

```ts
import {parseGrabPayload} from '@conciv/grab/grab-attachment'
import {grabAttachment} from '../shared/grab-attachment.js'

function decodeBody(value: string): string | null {
  try {
    return Buffer.from(value, 'base64').toString('utf8')
  } catch {
    return null
  }
}

grabAttachment.server(async (part) => {
  const body = decodeBody(part.source.value)
  const payload = body === null ? null : parseGrabPayload(body)
  if (!payload || payload.text === '') return []
  return [{type: 'text', content: payload.text}]
})

export {grabAttachment}
```

Core marks the result `modelOnly` on the way out (`packages/core/src/chat/run.ts:420-433`), so the expander returns a plain text part.

- [ ] **Step 4: Register it on the server extension**

In `packages/extensions/page/src/server.ts`, import from `./server/grab-attachment.js` (the module with the side-effecting `.server()` call, exactly as the recorder does at `src/server.ts:20`) and add `attachments: [grabAttachment]` to the `defineExtension({name: PAGE_EXTENSION_NAME, tools: declarations})` call.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm turbo run test --filter=@conciv/extension-page --filter=@conciv/core && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/extensions/page
git commit -m "feat(page): #487 expand grab attachments into grounding text"
```

---

### Task 5: Atomic attachment operations in the composer

Optimistic staging needs three things the composer does not expose yet: the id of a newly added attachment, an existence check, and an **atomic** replace. Doing the replace as `remove` then `add` is a race — a send landing between the two drops the grab, and `requireAttachment` throws if the id vanished after the check.

**Files:**

- Modify: `packages/ui-kit-chat/src/primitives/composer/composer.tsx:196-230,290-305`
- Modify: `packages/ui-kit-chat/src/primitives/composer/composer-context.tsx:6-23`
- Modify: `packages/ui-kit-chat/src/primitives/attachment/attachment.stories.tsx:36`, `packages/ui-kit-chat/src/styled/attachment-dispatch.stories.tsx:45`, `packages/ui-kit-chat/src/styled/attachment-ui.stories.tsx:38`
- Test: `packages/ui-kit-chat/test/composer-attachment-ops.browser.test.tsx` (create)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces, on `ComposerContextValue`:
  - `addAttachment: (file: File) => Promise<string | null>` — resolves the new attachment id, `null` when the adapter refused it.
  - `hasAttachment: (id: string) => boolean`
  - `replaceAttachment: (id: string, file: File) => Promise<string | null>` — swaps the payload in place, keeping the row position. Resolves `null` and changes nothing when `id` is no longer present.

- [ ] **Step 1: Write the failing test**

Create `packages/ui-kit-chat/test/composer-attachment-ops.browser.test.tsx`. Mount a composer the way `packages/ui-kit-chat/test/composer-completion.browser.test.tsx` does (read it first and reuse its harness and adapter fixture):

```tsx
test('replaceAttachment swaps the payload in place and keeps its position', async () => {
  const composer = mountComposer()
  const first = await composer.context.addAttachment(new File(['one'], 'one.txt', {type: 'text/plain'}))
  const second = await composer.context.addAttachment(new File(['two'], 'two.txt', {type: 'text/plain'}))
  if (!first || !second) throw new Error('expected both attachments to be added')

  const replaced = await composer.context.replaceAttachment(first, new File(['uno'], 'uno.txt', {type: 'text/plain'}))

  expect(replaced).not.toBeNull()
  expect(composer.context.attachments().map((entry) => entry.name)).toEqual(['uno.txt', 'two.txt'])
})

test('replaceAttachment is a no-op once the attachment is gone', async () => {
  const composer = mountComposer()
  const id = await composer.context.addAttachment(new File(['one'], 'one.txt', {type: 'text/plain'}))
  if (!id) throw new Error('expected the attachment to be added')
  await composer.context.removeAttachment(id)

  expect(await composer.context.replaceAttachment(id, new File(['uno'], 'uno.txt', {type: 'text/plain'}))).toBeNull()
  expect(composer.context.attachments()).toHaveLength(0)
})

test('replaceAttachment releases the displaced attachment through the adapter', async () => {
  const removed: string[] = []
  const composer = mountComposer({onAdapterRemove: (attachment) => removed.push(attachment.name)})
  const id = await composer.context.addAttachment(new File(['one'], 'one.txt', {type: 'text/plain'}))
  if (!id) throw new Error('expected the attachment to be added')

  await composer.context.replaceAttachment(id, new File(['uno'], 'uno.txt', {type: 'text/plain'}))

  expect(removed).toEqual(['one.txt'])
  expect(composer.context.attachments()).toHaveLength(1)
})

test('addAttachment resolves the id of the attachment it created', async () => {
  const composer = mountComposer()

  const id = await composer.context.addAttachment(new File(['one'], 'one.txt', {type: 'text/plain'}))

  expect(id).not.toBeNull()
  expect(composer.context.hasAttachment(id ?? '')).toBe(true)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/ui-kit-chat`
Expected: FAIL — `replaceAttachment` and `hasAttachment` are not on the context, and `addAttachment` resolves `void`.

- [ ] **Step 3: Implement the operations**

In `packages/ui-kit-chat/src/primitives/composer/composer.tsx`, `addAttachment` already computes `id` internally (line 209-213). Return it, and add the two new operations beside it. `upsertAttachment` (line 200-207) already replaces by index when the id matches, which is what keeps the position stable:

```ts
const addAttachment = async (file: File): Promise<string | null> => {
  const adapter = requireAttachmentAdapter(attachmentAdapter())
  assertAcceptedFile(file, adapter)
  const id = await addAdapterAttachment(adapter, file, upsertAttachment)
  if (id) removedIds.delete(id)
  return id ?? null
}

const hasAttachment = (id: string): boolean => attachments().some((entry) => entry.id === id)

const replaceAttachment = async (id: string, file: File): Promise<string | null> => {
  if (!hasAttachment(id)) return null
  const adapter = requireAttachmentAdapter(attachmentAdapter())
  assertAcceptedFile(file, adapter)
  const staged: AttachmentState[] = []
  const collect = (attachment: AttachmentState): void => {
    const index = staged.findIndex((entry) => entry.id === attachment.id)
    if (index < 0) staged.push(attachment)
    if (index >= 0) staged.splice(index, 1, attachment)
  }
  const added = await addAdapterAttachment(adapter, file, collect).catch(async (error: unknown) => {
    const orphan = staged.at(-1)
    if (orphan) await removeAdapterAttachment(adapter, orphan).catch(() => {})
    throw error
  })
  const replacement = staged.find((entry) => entry.id === added)
  if (!added || !replacement) return null
  const displaced = attachments().find((entry) => entry.id === id)
  if (!displaced) {
    await removeAdapterAttachment(adapter, replacement).catch(() => {})
    return null
  }
  setState('attachments', (current) => {
    const position = current.findIndex((entry) => entry.id === id)
    if (position < 0) return current
    return current.toSpliced(position, 1, replacement)
  })
  removedIds.add(id)
  await removeAdapterAttachment(adapter, displaced).catch(() => {})
  return added
}
```

Three properties this shape has that a `remove`-then-`add` does not:

- **The replacement never appears in composer state until the swap.** `addAdapterAttachment` takes the upsert callback as its third argument, so passing a local collector instead of `upsertAttachment` keeps the in-flight attachment out of `attachments()` — a send during `adapter.add()` cannot snapshot both copies. `AttachmentAdapter.add` may return an `AsyncGenerator`, so the collector can be called repeatedly and with more than one id: pick the entry whose id equals the returned `added`, never `staged.at(-1)`. If the generator yields and then throws, the entry it already produced is released through the adapter before the error propagates — otherwise it stays owned by `composeAttachmentAdapters` forever.
- **The old attachment is never absent.** The single `setState` splices new over old at the same index, so there is no window where a send would omit the grab, and the row position is preserved.
- **The displaced attachment is released through the adapter.** `removeAdapterAttachment` is what frees adapter-owned resources; skipping it leaks one entry per grounding.

If the original disappeared while the new file was being added (a send, or the user dismissing the card), the newcomer is rolled back through the adapter and `null` is returned — no ghost row.

Read the real `setState`, `upsertAttachment`, `addAdapterAttachment`, `removeAdapterAttachment` and `removedIds` helpers in that file before writing this and match their exact shapes. The above states the required behaviour; it is not a licence to invent store APIs. Verified against the real helper: `addAdapterAttachment` (`composer.tsx:121-138`) takes the upsert callback as its third argument, tracks `latest` internally, returns `latest?.id`, and on error calls `upsert(failedAttachment(latest, error))` before rethrowing. So the local collector receives every emission including the failed one, nothing reaches composer state, and the catch clause has the orphan in hand to release.

Expose all three in the context value (around line 290-305) and widen `ComposerContextValue` in `composer-context.tsx`.

- [ ] **Step 4: Update every explicit context provider**

Three story files construct a `ComposerContextValue` by hand with `addAttachment: async () => {}`, which no longer typechecks: `attachment.stories.tsx:36`, `attachment-dispatch.stories.tsx:45`, `attachment-ui.stories.tsx:38`. Give each `addAttachment: async () => null`, `hasAttachment: () => false`, `replaceAttachment: async () => null`. Then confirm no other hand-built providers exist:

```bash
grep -rn "addAttachment:" --include="*.ts" --include="*.tsx" packages apps | grep -v dist
```

- [ ] **Step 5: Run tests and typecheck to verify they pass**

Run: `pnpm turbo run test --filter=@conciv/ui-kit-chat && pnpm typecheck`
Expected: PASS. The typecheck is not optional here — the signature change ripples beyond this package's own tests.

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit-chat
git commit -m "feat(ui-kit-chat): #487 atomic composer attachment replace with stable position"
```

---

### Task 6: Stage grabs as attachments and delete the grab store

The task that closes the bug. `PaneGrabStore` is deleted; `GrabApi.stage/staged/clear` operate on composer attachments, so every staging path — the composer button, the terminal extension, a restored draft — produces the same thing.

`packages/extensions/terminal/src/client/terminal-actions.tsx:110` calls `grab.stage(picked)` and `terminal-panel-view.tsx:111-115` reads `grab.staged()` then `grab.clear()`. Those must keep working through the new implementation without touching the terminal extension.

**Files:**

- Create: `apps/conciv/src/pane/grab-staging.ts`
- Modify: `apps/conciv/src/app/pane-context.ts:1-27,29-55`
- Modify: `apps/conciv/src/extension/pane-grab.ts`
- Modify: `apps/conciv/src/pane/chat-pane.tsx:37-52,98-117,223-252,335-341`
- Modify: `apps/conciv/src/routes/panel.$sessionId.$view.tsx:8-11,48,63-68`
- Modify: `apps/conciv/src/pane/use-pane-messaging.ts:31-44,83-100`
- Modify: `apps/conciv/test/helpers/fake-core.ts:180-181`, `apps/conciv/test/helpers/pane-harness.tsx:60-72`
- Modify: `apps/conciv/test/chat-pane.browser.test.tsx:20-120`
- Delete: `apps/conciv/src/pane/grab-reference.tsx`, `apps/conciv/src/pane/grab-strip.tsx`, `apps/conciv/test/grab-reference.browser.test.tsx`

**Interfaces:**

- Consumes: `grabToFile`, `parseGrabPayload`, `GRAB_MIME` (Task 3); `addAttachment`/`hasAttachment`/`replaceAttachment` (Task 5); persisted draft attachments (Task 2).
- Produces `apps/conciv/src/pane/grab-staging.ts`:
  - `type GrabStaging = {stage: (grab: Grab) => void; staged: () => readonly Grab[]; clear: () => void; reconcile: (attachments: readonly AttachmentState[]) => void; connect: (port: ComposerGrabPort) => void; disconnect: () => void}`
  - `function makeGrabStaging(deps: {ground: (grab: Grab) => Promise<Grab | null>}): GrabStaging`
  - `type ComposerGrabPort = {attachments: () => readonly AttachmentState[]; addAttachment: (file: File) => Promise<string | null>; replaceAttachment: (id: string, file: File) => Promise<string | null>; removeAttachment: (id: string) => Promise<void>; hasAttachment: (id: string) => boolean}`
  - The attachment state type is exported from `@conciv/ui-kit-chat` as **`AttachmentState`** (`src/index.tsx:109`). `Attachment` is the component, not the type — importing it as a type does not compile.
- `PaneContextValue.grabStore` becomes `PaneContextValue.grabStaging: GrabStaging`. `makeGrabStore` and `StagedGrab` are deleted.

- [ ] **Step 1: Make the fake core store drafts and expose a write signal**

`apps/conciv/test/helpers/fake-core.ts:180-181` replies to `drafts/set` without recording, and `core.idle()` resolves after `QUIET_MS` (60ms) — shorter than the 300ms draft debounce, so a test that stages and immediately calls `idle()` disposes before the write ever happens. Add both the store and an explicit write signal:

```ts
let draftRow: DraftRow | null = config.draft ?? null
const draftWaiters: ((row: DraftRow) => void)[] = []

'/rpc/drafts/get': () => reply(draftRow),
'/rpc/drafts/set': (body) => {
  const parsed = DraftRowSchema.omit({updatedAt: true}).safeParse(body)
  if (!parsed.success) return reply({ok: true})
  draftRow = {...parsed.data, updatedAt: 1}
  const settled = draftRow
  draftWaiters.splice(0).forEach((resolve) => resolve(settled))
  return reply({ok: true})
},
```

and expose on `FakeCore`:

```ts
nextDraftWrite: () => new Promise<DraftRow>((resolve) => draftWaiters.push(resolve)),
```

Two details that matter: waiters queue (several tests may await concurrently, and a single-slot callback silently drops all but the last), and the promise resolves **only after a write that actually parsed and stored** — resolving on a rejected or unrelated body would let a test proceed believing it persisted something it did not. Returning the stored row lets the test assert on it directly. Read how the other routes unwrap their body in this file and match it exactly.

- [ ] **Step 2: Let the harness mount extensions and supply a grab provider**

`apps/conciv/test/helpers/pane-harness.tsx:60-72` hardcodes `grabProvider: undefined` and `instances: []`. With the grab card living on the page extension, an empty instance list means no card is registered and the reload test cannot see a snapshot. Widen the harness:

```tsx
export function mountPane(
  view: (pane: PaneContextValue) => JSX.Element,
  options: {grabProvider?: GrabProvider; extensions?: AnyExtension[]} = {},
): PaneMount
```

setting `grabProvider: options.grabProvider` on the `pane` object and `instances: createInstances(options.extensions ?? [])` on the app context. **Default to `[]`, not to the page extension** — every existing pane test keeps mounting exactly what it mounts today, so this change cannot ripple. The grab tests opt in explicitly with `{extensions: [pageExtension]}` (`import pageExtension from '@conciv/extension-page/client'`), which is also the honest thing to assert: the card is registered _by the extension_, and a test that mounts it proves that wiring.

`createInstances` is currently a private function in `apps/conciv/src/router.tsx:52-70`. Move it verbatim to `apps/conciv/src/extension/create-instances.ts`, export it, and import it from both `router.tsx` and the harness. Do **not** reach for `extension.__client?.()` in test code to build an instance by hand — dunder surfaces are not a testing API.

- [ ] **Step 3: Write the failing reload test**

Add to `apps/conciv/test/chat-pane.browser.test.tsx`. It drives the **real** staging path — the composer's grab button through a provider — because staging through an internal store would prove nothing about persistence:

```tsx
const GRAB: Grab = {
  text: '<h1 class="title">Payroll Deposit</h1> at src/routes/index.tsx:12:9',
  snippet: '<h1 class="title">Payroll Deposit</h1>',
  preview: {kind: 'dom', html: '<p>Payroll Deposit clone</p>', width: 200, height: 40},
  source: {componentName: 'Hero', filePath: 'src/routes/index.tsx', lineNumber: 12},
  rect: {x: 0, y: 0, width: 200, height: 40},
}

function fixedGrabProvider(): GrabProvider {
  return () => ({
    pick: async () => GRAB,
    comment: async () => GRAB,
    cancel: () => {},
    isActive: () => false,
  })
}

const grabButton = () => page.getByRole('button', {name: 'Select an element from the page'})
const snapshot = () => page.frameLocator(page.getByTitle('Grabbed element snapshot')).getByText('Payroll Deposit clone')

test('a staged grab keeps its snapshot and source label across a panel reload', async () => {
  core = installFakeCore({sessions: [sessionRow({id: PANE_SESSION})]})
  const written = core.nextDraftWrite()
  const first = mountPane(() => <ChatPane sessionId={PANE_SESSION} />, {grabProvider: fixedGrabProvider()})
  await expect.element(input()).toBeVisible()

  await userEvent.click(grabButton())
  await expect.element(snapshot()).toBeVisible()
  await expect.element(page.getByText('Hero at src/routes/index.tsx:12')).toBeVisible()
  await written
  first.dispose()

  mountPane(() => <ChatPane sessionId={PANE_SESSION} />)

  await expect.element(snapshot()).toBeVisible()
  await expect.element(page.getByText('Hero at src/routes/index.tsx:12')).toBeVisible()
})
```

Awaiting `nextDraftWrite()` is what makes this deterministic without a sleep or `expect.poll`.

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/app`
Expected: FAIL after remount — the grab is gone or renders as text. If it fails at `grabButton()` instead, the provider wiring in Step 2 is wrong; fix that before continuing, otherwise the test is not proving the bug.

- [ ] **Step 5: Write the staging module**

Create `apps/conciv/src/pane/grab-staging.ts`. It owns an id→payload cache so `staged()` can stay synchronous (`GrabApi.staged()` is sync, and `terminal-panel-view.tsx:111` calls it during a keydown handler). The cache is derived state, not a second store: an entry is only ever reachable while the composer still holds an attachment with that id.

```ts
import {createSignal} from 'solid-js'
import {GRAB_MIME, grabToFile, grabToPayload, parseGrabPayload, type GrabPayload} from '@conciv/grab/grab-attachment'
import type {Grab} from '@conciv/grab'
import type {AttachmentState} from '@conciv/ui-kit-chat'

export type ComposerGrabPort = {
  attachments: () => readonly AttachmentState[]
  addAttachment: (file: File) => Promise<string | null>
  replaceAttachment: (id: string, file: File) => Promise<string | null>
  removeAttachment: (id: string) => Promise<void>
  hasAttachment: (id: string) => boolean
}

export type GrabStaging = {
  stage: (grab: Grab) => void
  staged: () => readonly Grab[]
  clear: () => void
  reconcile: (attachments: readonly AttachmentState[]) => void
  connect: (port: ComposerGrabPort) => void
  disconnect: () => void
}

type Deps = {
  ground: (grab: Grab) => Promise<Grab | null>
}

type StagedEntry = {grab: Grab; id: string | null; grounded: Grab | null}

function toGrab(payload: GrabPayload): Grab {
  return {
    text: payload.text,
    ...(payload.snippet === undefined ? {} : {snippet: payload.snippet}),
    preview: payload.preview ?? {kind: 'dom', html: '', width: 0, height: 0},
    source: payload.source,
    rect: payload.rect,
  }
}

function isGrabAttachment(attachment: AttachmentState): boolean {
  return attachment.contentType === GRAB_MIME
}

export function makeGrabStaging(deps: Deps): GrabStaging {
  const [payloads, setPayloads] = createSignal<ReadonlyMap<string, GrabPayload>>(new Map())
  const [pending, setPending] = createSignal<readonly StagedEntry[]>([])
  const [port, setPort] = createSignal<ComposerGrabPort | null>(null)

  const remember = (id: string, payload: GrabPayload): void => {
    setPayloads((current) => new Map(current).set(id, payload))
  }

  const forget = (id: string): void => {
    setPayloads((current) => new Map([...current].filter(([known]) => known !== id)))
  }

  const drop = (entry: StagedEntry): void => {
    setPending((current) => current.filter((candidate) => candidate !== entry))
  }

  const settle = async (entry: StagedEntry): Promise<void> => {
    const composer = port()
    if (!composer || entry.id === null || entry.grounded === null) return
    const replaced = await composer.replaceAttachment(entry.id, grabToFile(entry.grounded))
    forget(entry.id)
    if (replaced) remember(replaced, grabToPayload(entry.grounded))
    drop(entry)
  }

  const attach = async (entry: StagedEntry): Promise<void> => {
    const composer = port()
    if (!composer || entry.id !== null) return
    const id = await composer.addAttachment(grabToFile(entry.grounded ?? entry.grab))
    entry.id = id
    if (id) remember(id, grabToPayload(entry.grounded ?? entry.grab))
    if (entry.grounded === null) return
    drop(entry)
  }

  return {
    stage: (grab) => {
      const entry: StagedEntry = {grab, id: null, grounded: null}
      setPending((current) => [...current, entry])
      void attach(entry).then(async () => {
        entry.grounded = await deps.ground(grab)
        if (entry.grounded === null) {
          drop(entry)
          return
        }
        await settle(entry)
      })
    },
    staged: () => {
      const composer = port()
      const known = payloads()
      const attached = (composer?.attachments() ?? []).filter(isGrabAttachment).flatMap((attachment) => {
        const payload = known.get(attachment.id)
        return payload ? [toGrab(payload)] : []
      })
      const unattached = pending().filter((entry) => entry.id === null)
      return [...attached, ...unattached.map((entry) => entry.grounded ?? entry.grab)]
    },
    clear: () => {
      setPending([])
      const composer = port()
      if (!composer) return
      for (const attachment of composer.attachments().filter(isGrabAttachment))
        void composer.removeAttachment(attachment.id)
    },
    reconcile: (attachments) => {
      const grabs = attachments.filter(isGrabAttachment)
      const live = new Set(grabs.map((attachment) => attachment.id))
      setPayloads((current) => new Map([...current].filter(([id]) => live.has(id))))
      for (const attachment of grabs) {
        if (payloads().has(attachment.id) || !attachment.file) continue
        void attachment.file.text().then((body) => {
          const payload = parseGrabPayload(body)
          const stillLive = (port()?.attachments() ?? []).some((entry) => entry.id === attachment.id)
          if (payload && stillLive) remember(attachment.id, payload)
        })
      }
    },
    connect: (next) => {
      setPort(() => next)
      for (const entry of pending().filter((candidate) => candidate.id === null)) void attach(entry)
    },
    disconnect: () => setPort(null),
  }
}
```

Four properties worth stating, because each was a defect in the previous draft:

- **`staged()` is reactive.** The payload cache is a signal holding an immutable `Map`, not a plain `Map` — Solid consumers re-run when a payload lands. A plain `Map` would have made restored grabs invisible to any reactive reader forever.
- **The cache is pruned in `reconcile`,** which runs on every change to the composer's attachment list. Removal, a successful send, and a failed replacement all drop their payloads; nothing is retained for the life of the pane.
- **One workflow owns a grab from staging to grounding.** Each `stage()` creates a `StagedEntry` that carries the grab, its attachment id once known, and its grounded form once resolved. Attaching and grounding both write into that entry, so it does not matter which finishes first: a grab staged before the composer mounts is attached by `connect()` and still gets its grounded replacement, and a grab whose grounding lands before the composer exists is attached in its grounded form directly. The previous draft dropped grounding entirely in that race.
- **The composer port is pushed in, not pulled.** `connect(port)`/`disconnect()` are called from `ComposerWiring`; the port lives in a signal so `staged()` re-runs when the composer arrives or leaves. There is no ambient lookup — `makeGrabStaging` is constructed before any composer exists, so a read-only `composer()` dependency would have been permanently `null`.
- **Grabs staged before the composer exists are held as `Grab` objects, not opaque queued files.** `staged()` returns them directly, so the terminal's `staged()`/`clear()` contract works from an extension view too. Grab staging does not use `PendingAttachmentQueue` at all — that queue stays for real user files.
- **Hydration re-checks liveness before writing.** `file.text()` can resolve after its attachment was removed; without the `stillLive` check the dead id would be reinserted after the final `reconcile` and never pruned again.
- **`clear()` removes only grab-mime attachments**, never the user's images or documents.

One residual window, documented rather than hidden: after a reload, a restored grab becomes visible to `staged()` only once `reconcile` has decoded its `File`. That decode is a microtask-scale gap, and `staged()` is reactive so the UI catches up, but a synchronous read in that instant returns fewer grabs. It is on the Verification Checklist.

- [ ] **Step 6: Wire it into the pane**

In `apps/conciv/src/app/pane-context.ts`, delete `PaneGrabStore`, `makeGrabStore` and `StagedGrab`; replace the context member with `grabStaging: GrabStaging`. Build it where the pane context is constructed, with `ground` supplied by the caller that has `rpc` in scope.

In `apps/conciv/src/pane/chat-pane.tsx`:

- `ComposerWiring` connects the port on mount and releases it on cleanup — this is the only thing that makes `deps` reachable, so it cannot be skipped:

```tsx
onMount(() => {
  pane.grabStaging.connect({
    attachments: context.attachments,
    addAttachment: context.addAttachment,
    replaceAttachment: context.replaceAttachment,
    removeAttachment: context.removeAttachment,
    hasAttachment: context.hasAttachment,
  })
})
onCleanup(() => pane.grabStaging.disconnect())
```

`connect` also flushes grabs staged before the composer existed. Keep the payload cache in step with a single effect:

```tsx
createEffect(() => pane.grabStaging.reconcile(context.attachments()))
```

That effect is what hydrates restored grab payloads and prunes payloads whose attachment is gone — after a removal, after a send, after a failed replacement. There is no other cache maintenance anywhere.

- Delete `grabTexts` (98-100) and the grab lines in `ComposerWiring` (110-111, 115).
- `stageGrab` becomes `(grab: Grab) => {pane.grabStaging.stage(grab); focusInput()}`; delete `groundGrab`.
- Delete the `GrabStrip`/`GrabReference` block (335-341) and its imports (46-47).

In `apps/conciv/src/extension/pane-grab.ts`, forward all three: `stage: store.stage, staged: store.staged, clear: store.clear` — reading from `grabStaging` now.

- [ ] **Step 7: Strip the grab strip from the extension-view route**

`apps/conciv/src/routes/panel.$sessionId.$view.tsx` imports `GrabReference`/`GrabStrip` at lines 10-11 and renders them at 63-68 over `pane.grabStore.grabs()`/`remove`. That route has no composer, so drop the strip entirely and keep only its `makePaneGrabApi` wiring at line 48. A grab staged from that route queues and appears as a card when the chat pane mounts.

- [ ] **Step 8: Delete the grab branch of send**

In `apps/conciv/src/pane/use-pane-messaging.ts`, drop `grabStore` from `PaneMessagingDeps` and reduce `onSend`:

```ts
const onSend = async (content: string | MultimodalContent): Promise<void> => {
  const verdict = checkSend(content, {
    busy: compacting(),
    connected: deps.chat.connectionStatus() === 'connected',
    reachable: deps.reachability.online(),
  })
  if (!verdict.ok) throw sendRejection(verdict)
  await deps.chat.sendMessage(content)
}
```

and drop the `grabStore` argument at the `chat-pane.tsx` call site. **No post-send clearing hook is needed or should be added** — with `staged()` derived from composer attachments, the composer's own clear-and-restore (`composer.tsx:280-289`) already empties and restores staged grabs.

- [ ] **Step 9: Remap the #478 tests**

`apps/conciv/test/chat-pane.browser.test.tsx:23-120` drives grabs through `draftWithGrab` and `grabStore.stageAll`. Rewrite each to stage through `grabButton()` with the fixed provider and assert on `snapshot()`. The remove control is now named `Remove Grabbed element` (derived from the file name at `attachment.tsx:42`) — update `removeGrab()`. Keep every pinned behaviour: cleared on send, restored when the server refuses, restored when the transport throws, and no cross-restore between a failed send and a queued one. Do not delete a test to make it pass — if one cannot be expressed on the attachment lifecycle, stop and report.

- [ ] **Step 10: Delete the dead files**

```bash
git rm apps/conciv/src/pane/grab-reference.tsx apps/conciv/src/pane/grab-strip.tsx apps/conciv/test/grab-reference.browser.test.tsx
```

Then confirm nothing survives:

```bash
grep -rn "GrabStrip\|GrabReference\|stageTexts\|stageAll\|StagedGrab\|grabStore" --include="*.ts" --include="*.tsx" apps packages | grep -v dist
```

Must return empty. `apps/site` has an unrelated demo component of the same name — leave it alone.

- [ ] **Step 11: Prove the terminal extension still works through the new implementation**

`terminal-actions.tsx:110` and `terminal-panel-view.tsx:111-115` are the only external consumers of `stage`/`staged`/`clear`. Do not modify them. The test must go through the **same object an extension receives** — `makePaneGrabApi`, the thing `HostApiProvider` hands to `useGrab()` — not through `pane.grabStaging` directly, or a broken `pane-grab.ts` wiring passes unnoticed. It must also call `api.stage(...)` rather than clicking the composer button, because `stage` is the entry point the terminal uses.

Create `apps/conciv/test/grab-staging.browser.test.tsx`:

```tsx
test('the grab api an extension receives can stage, read and clear, as the terminal does', async () => {
  core = installFakeCore({sessions: [sessionRow({id: PANE_SESSION})]})
  const mount = mountPane(() => <ChatPane sessionId={PANE_SESSION} />)
  await expect.element(input()).toBeVisible()
  const api = makePaneGrabApi(mount.pane.grabStaging, mount.pane.grabProvider)

  api.stage(GRAB)

  await expect.element(snapshot()).toBeVisible()
  expect(api.staged().map((grab) => grab.text)).toEqual([GRAB.text])

  api.clear()

  await expect.element(page.getByRole('button', {name: 'Remove Grabbed element'})).not.toBeInTheDocument()
  expect(api.staged()).toHaveLength(0)
})
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `pnpm turbo run test --filter=@conciv/app && pnpm typecheck`
Expected: PASS, including the reload test and the terminal-contract test.

- [ ] **Step 13: Commit**

```bash
git add -A apps/conciv
git commit -m "feat(conciv): #487 stage grabs as attachments and delete the grab store"
```

---

### Task 7: Remove the grabs channel and gate the change

Nothing writes `drafts.grabs` any more. Remove it end to end and run the release-grade gates.

**Files:**

- Modify: `packages/core/src/chat/run.ts:454-461,477-482`
- Modify: `packages/contract/src/rows.ts:27`
- Modify: `packages/db/src/schema.ts:32` + regenerated migration under `packages/db/drizzle/`
- Modify: `packages/ui-kit-chat/src/primitives/composer/composer-context.tsx:4,17-18`, `packages/ui-kit-chat/src/primitives/composer/composer.tsx` (state + `snapshotDraft`/`restoreDraft`/`clearDraft`), `packages/ui-kit-chat/src/behaviors/composer-draft-storage.ts:19,69,104`
- Modify: `apps/conciv/src/pane/draft-storage.ts`
- Modify: every remaining `ComposerDraft` construction site (see Step 1)
- Create: `.changeset/grab-as-attachment.md`

**Interfaces:**

- Consumes: everything above.
- Produces: `DraftRow` without `grabs`; `ComposerDraft` without `grabs`; `composeUserContent` deleted.

- [ ] **Step 1: Enumerate the consumers before deleting anything**

```bash
grep -rn "grabs" --include="*.ts" --include="*.tsx" packages apps | grep -v dist
```

Known hits beyond the files listed above: `packages/ui-kit-chat/src/primitives/attachment/attachment.stories.tsx`, `packages/ui-kit-chat/src/styled/attachment-dispatch.stories.tsx`, `packages/ui-kit-chat/src/styled/attachment-ui.stories.tsx`, `packages/ui-kit-chat/src/primitives/composer/composer.stories.tsx`, `packages/ui-kit-chat/src/primitives/message/message.stories.tsx`, `packages/ui-kit-chat/test/composer-completion.browser.test.tsx`, `packages/core/test/rpc/wire.it.test.ts`, `packages/contract/test/rows.test.ts`, `packages/embed/tests/e2e/*`. Every one is updated in this task.

- [ ] **Step 2: Delete the prefix and its caller**

In `packages/core/src/chat/run.ts`, delete `composeUserContent` (454-461) and reduce `prepareLaunchContent`:

```ts
async function prepareLaunchContent(deps: ChatDeps, sessionId: string, content: UserContent): Promise<UserContent> {
  deps.onRunStart?.(sessionId)
  await ensureRow(deps.db, sessionId, deps.harness.id, deps.cwd)
  return expandUserParts(content, deps.attachmentExpanders)
}
```

Remove the `drafts` import if nothing else in the file uses it.

- [ ] **Step 3: Drop the field everywhere**

Remove `grabs` from `DraftRowSchema`; from the `drafts` table (then `pnpm --filter @conciv/db gen-migrations`, commit what it writes under `packages/db/drizzle/`); from `ComposerDraft` and `ComposerContextValue` (`grabs`/`setGrabs`); from composer state and `snapshotDraft`/`restoreDraft`/`clearDraft`; from `PersistedDraftSchema` in both `composer-draft-storage.ts` and `apps/conciv/src/pane/draft-storage.ts`; and from `readComposerDraft`/`writeComposerDraft`. Update every site from Step 1.

- [ ] **Step 4: Run the affected suites**

Run: `pnpm turbo run test --filter=@conciv/core --filter=@conciv/contract --filter=@conciv/db --filter=@conciv/ui-kit-chat --filter=@conciv/app`
Expected: PASS. A test still asserting a grab text prefix in the user message is asserting removed behaviour — rewrite it to assert the `modelOnly` expansion.

- [ ] **Step 5: Rebuild the embed bundle and run its integration tests**

Widget integration tests load the prebuilt bundle, so a stale `dist` tests stale code.

Run: `pnpm turbo run build --filter=@conciv/embed && pnpm turbo run test --filter=@conciv/embed`
Expected: PASS.

- [ ] **Step 6: Write the changeset**

Create `.changeset/grab-as-attachment.md`:

```markdown
---
'@conciv/app': patch
---

Grabs are attachments: the snapshot survives a panel reload, sent grabs render as a card in the transcript instead of raw HTML text, and composer attachments now persist in the session draft.
```

One entry naming any `@conciv/*` package releases the whole fixed set.

- [ ] **Step 7: Run the full gates**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm exec fallow audit --changed-since main --format json
```

Expected: all green, nothing INTRODUCED by the audit. Fix what it flags before committing.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(drafts): #487 remove the grabs channel now that grabs are attachments"
```

---

## Verification Checklist

Run before opening the PR. Each line is a claim the PR makes; check it, don't assume it.

- [ ] Stage a grab in a real browser (`pnpm dev`), reload the panel: the card still shows the snapshot **and** the `↳ in <Component>` line.
- [ ] Stage a grab and reload _immediately_, before symbolication can resolve: the grab is still there (this is what the optimistic attach buys).
- [ ] Stage a grab, dismiss it before grounding resolves: it does not reappear.
- [ ] Send a message with a staged grab: the transcript shows the grab card, and no raw `<h1 …> at file:line` text appears in the user message.
- [ ] Click the card in both the composer and the transcript: the dialog opens, and its toggle reveals the exact agent-facing string.
- [ ] Grab an element containing an `<img>` with a remote `src`: the network panel shows no request from the snapshot frame. This is the only check that covers the CSP — the automated sandbox test proves script containment only.
- [ ] Click directly on the middle of the snapshot (not its border): the dialog opens. The iframe must not swallow the click.
- [ ] Stage a grab from the terminal extension's own grab button, press Enter in the terminal: the grab text pastes and the card disappears — `staged()`/`clear()` still behave for an unmodified extension.
- [ ] Stage a grab from an extension view (no composer mounted), then open the chat pane: the grab arrives as a card.
- [ ] Stage two grabs, ground both, and confirm neither card is lost or duplicated when the replacements land.
- [ ] Reload with a staged grab and press Enter in the terminal straight away: the grab pastes. `staged()` needs its restored payload decoded first, so this is the one place the async hydration window is observable.
- [ ] Drag an image into the composer, reload: the image attachment is still there (the second bug this fixes).
- [ ] The agent still receives the grounding text — the `MESSAGES_SNAPSHOT` contains `"modelOnly":true` beside the grab text.
- [ ] Verify the visual in the user's own browser (Firefox), not only the probe Chromium the tests drive.
