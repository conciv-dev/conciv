# 01 — Phase 0: host-neutral grab contract (`@conciv/grab`)

> **Review fixes (review-02/03/04): grabbable on GrabApi (D9/codex-major).** `GrabApi` itself gains an
> optional `grabbable?: () => boolean` so the capability signal is not erased between the provider and the
> composer (the earlier plan put it only on a `GrabActions` alias that `makePaneGrabApi` dropped). See `05`
> §0/§4 for the end-to-end threading.

**This phase blocks everything native.** Until `Grab` stops carrying a live `HTMLElement`, no non-web
host can produce a grab. It is a small, self-contained, releasable PR with zero behavior change on web.

## Current contract (the problem)

`packages/grab/src/grab.ts` — the whole file today:

```ts
export type ElementSnapshot = {
  node: HTMLElement // <-- DOM leaks into the shared, published contract
  width: number
  height: number
}
export type ElementSource = {componentName: string | null; filePath: string; lineNumber: number | null}
export type ElementRect = {x: number; y: number; width: number; height: number}
export type StagedGrab = {snapshot: ElementSnapshot; source: ElementSource | null; rect: ElementRect | null}
export type Grab = StagedGrab & {text: string}
export type GrabApi = {
  pick: () => Promise<Grab | null>
  comment: () => Promise<Grab | null>
  cancel: () => void
  isActive: () => boolean
  stage: (grab: Grab) => void
  staged: () => readonly Grab[]
  clear: () => void
}
```

`@conciv/grab` is published (in `PUBLIC_PACKAGES` and fallow `publicPackages`) and is the capability
surface shared by the widget **and** the extension contract (`packages/extension/src/host-context.ts`
imports `GrabApi`). A native host cannot construct an `HTMLElement`.

### Every consumer of the DOM node (the complete list — verified by grep)

1. `apps/conciv/src/chat/grab-reference.tsx:29` — **the only renderer**:
   `ref={(el) => el.appendChild(props.snapshot.node.cloneNode(true))}`. Clones the captured DOM into a
   scaled preview box (`ScaledSnapshot`). This is the fidelity we must not lose on web.
2. `packages/page/src/react-grab/capture-element.ts` — web producer: builds a styled clone
   (`captureSync`) and returns `{node, width, height}`.
3. `packages/page/src/react-grab/adapter.ts:39` — web producer: `captureElement(element)` → snapshot.
4. `packages/page/src/grab-api.ts` — web `GrabApi` (`pick`/`comment`/`cancel`/`isActive`).
5. `packages/extension-testkit/src/host/grab.ts:33` — the **test fake**:
   `snapshot: {node: element.cloneNode(true) as HTMLElement, ...}`.

Consumers that use only `.text` / `.rect` / `.source` and need **no** change:
`packages/extensions/terminal/src/client/terminal-actions.tsx:101` (`grab.stage(picked)`) and
`terminal-panel-view.tsx:124` (`grab.staged()` → `entry.text`).

## Target contract

Replace `snapshot: ElementSnapshot` with `preview: GrabPreview`, a discriminated union. The DOM arm is
web-only; native hosts only ever emit the image arm. **No value that crosses the native bridge, and no
value a non-web host must construct, references a DOM type.**

```ts
export type ElementSource = {componentName: string | null; filePath: string; lineNumber: number | null}
export type ElementRect = {x: number; y: number; width: number; height: number}

export type DomPreview = {kind: 'dom'; node: HTMLElement; width: number; height: number}
export type ImagePreview = {kind: 'image'; dataUrl: string; width: number; height: number}
export type GrabPreview = DomPreview | ImagePreview

export type StagedGrab = {
  preview: GrabPreview
  source: ElementSource | null
  rect: ElementRect | null
}
export type Grab = StagedGrab & {text: string}

export type GrabApi = {
  pick: () => Promise<Grab | null>
  comment: () => Promise<Grab | null>
  cancel: () => void
  isActive: () => boolean
  grabbable?: () => boolean // NEW (D9): capability signal the composer reads for disabled state
  stage: (grab: Grab) => void
  staged: () => readonly Grab[]
  clear: () => void
}
```

`grabbable?` is optional and threaded through `makePaneGrabApi` all the way to the composer (`05` §0/§4),
so no provider or host that sets it has the value erased. Web hosts that never set it default to enabled
(unchanged behavior). This is a single additive field on the existing `GrabApi`, not a parallel
`GrabActions` type the adapter would drop.

### Why a discriminated union and not "always an image"

The orchestrator framing was "text, rect, source, image preview; web keeps the node internally." Two
readings; here is the honest tradeoff and the recommendation.

- **Always-image (strictest):** the neutral `Grab` carries only `{dataUrl}`. Web would have to rasterize
  its styled clone to a PNG (SVG `foreignObject` or html-to-image) for every grab. That is heavier, can
  taint on cross-origin images, and can drop web fonts — a fidelity + reliability regression that
  violates the "web grab UX unchanged" acceptance criterion. Web would keep the live node in a
  web-only side channel, and the shared renderer would still need a branch to use it — so the union
  reappears anyway, just less honestly.
- **Discriminated union (recommended):** `HTMLElement` appears in exactly one arm (`dom`), which only
  `@conciv/page` and the testkit fake ever construct and which never crosses the bridge. Native emits
  `image`. Web keeps its cheap, crisp DOM-clone preview with zero rasterization. The renderer branches
  on `preview.kind` — a natural, single branch point at `ScaledSnapshot`.

**Recommendation: ship the discriminated union.** State the acceptance criterion precisely (below) so
"zero DOM types in neutral payload" is judged against _what crosses the bridge_, not against the
existence of a web-only union arm.

## Migration steps

1. **`packages/grab/src/grab.ts`** — replace `ElementSnapshot` with `GrabPreview`/`DomPreview`/
   `ImagePreview`; `StagedGrab.snapshot` → `StagedGrab.preview`. Keep `ElementSource`/`ElementRect`/
   `GrabApi` identical. `HTMLElement` in the `dom` arm is a lib type reference only — it adds no runtime
   dependency (the package stays types-only, `tsdown` build unchanged).
2. **`packages/page/src/react-grab/capture-element.ts`** — return
   `{kind: 'dom', node, width: rect.width, height: rect.height}` from `captureSync`; the function is
   otherwise unchanged. Rename the return type usage accordingly.
3. **`packages/page/src/react-grab/adapter.ts:39`** — `const [preview, info] = await Promise.all([...])`;
   `sink?.({text, preview, source: ..., rect})`.
4. **`apps/conciv/src/chat/grab-reference.tsx`** — the renderer branches:
   - `ScaledSnapshot` accepts `preview: GrabPreview`. When `preview.kind === 'dom'`, keep the current
     `appendChild(preview.node.cloneNode(true))` path verbatim. When `preview.kind === 'image'`, render
     `<img src={preview.dataUrl} width height>` scaled the same way (`fitScale`).
   - `stagedGrab(grab)` guard changes from `'snapshot' in grab` to `'preview' in grab`.
5. **`packages/extension-testkit/src/host/grab.ts:28-37`** — `toGrab` returns
   `preview: {kind: 'dom', node: element.cloneNode(true) as HTMLElement, width, height}`. The fake stays
   DOM-based (it runs in a real browser via the testkit host entry). Optionally add a second helper
   `makeImageHostGrab` that emits an `image` preview from a fixture data-URL, to exercise the native path
   in browser tests without a simulator — **do this in `07`, not here.**
6. Grep for any remaining `.snapshot` / `snapshot.node`:
   `grep -rn "\.snapshot\b\|snapshot\.node" packages apps --include='*.ts' --include='*.tsx' | grep -v /dist/`.
   Also update `packages/page/test/capture-element.browser.test.ts` (uses `snapshot.node.querySelector`).
7. **Changeset** naming `@conciv/grab` (releases the `@conciv/*` set — see `08`). v0, no back-compat shim
   (`v0-break-api-freely`): update every call site, do not keep the old field.

## Acceptance criteria

- **AC1 — web UX unchanged.** The existing web grab flow (pick an element, staged preview appears in the
  composer with the DOM-clone thumbnail and the `in <source>` line) is visually and behaviorally
  identical. Verified by the existing `packages/page` browser tests (updated for the rename) plus a
  manual pick in `pnpm dev`.
- **AC2 — no DOM types cross the boundary.** `git grep -n "HTMLElement\|Node\b\|Element\b"
packages/grab/src` shows `HTMLElement` only inside `DomPreview`. No native-constructible value
  (`ImagePreview`, `StagedGrab` built from it, `Grab.text/rect/source`) references any DOM type. A native
  producer can emit a valid `Grab` using only `{kind:'image', dataUrl, width, height}` + primitives.
- **AC3 — typecheck + build + test green** across the workspace (`pnpm typecheck && pnpm build &&
pnpm test`), and `fallow audit --changed-since main` introduces nothing.
- **AC4 — testkit fake still constructs a valid `Grab`** and terminal `grab.stage/staged` still compile
  and pass unchanged.
