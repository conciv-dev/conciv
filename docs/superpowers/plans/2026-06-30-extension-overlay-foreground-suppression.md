# Extension overlay primitives + foreground suppression — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it structurally impossible for the chat widget to overlap an extension's foreground dialog, by giving `ClientApi` host-owned `Dialog`/`Popover` overlay primitives whose open-state drives widget suppression; cut the whiteboard's four hand-rolled/overlapping floating surfaces onto them.

**Architecture:** A module-level signal-backed stack of open overlay layers (`widget/src/shell/dialogs.ts`) — same cross-component-wire pattern as the existing `react-grab/picking.ts`. A `track()` wrapper pushes a `{isOpen}` layer on mount and removes it on cleanup; `anyOpen` derives from the stack. The shell hides while `picking() || anyOpen()`. `ClientApi.Dialog`/`Popover` are the existing ui-kit-system components wrapped with `track()`. The whiteboard renders compose / drag-prompt / thread via `api.Popover` and delete-confirm via `api.Dialog`.

**Tech Stack:** SolidJS, Ark UI (via `@conciv/ui-kit-system`), UnoCSS, vitest browser mode + Playwright, `@conciv/extension-testkit`, turborepo.

## Global Constraints

- Functions not classes; no IIFE; no `any` / type casts; no non-null `!`; no `useEffect` / `createEffect` for this glue (the stack is effect-free); one-line comments only.
- Views stay presentational; overlay logic/state reaches views through the `useComments()` context model, never prop-drilled.
- Tests assert via roles / text / aria / `toHaveAttribute` — never `querySelector`, class selectors, or `toBe(true)` on DOM. No `data-testid` in production code.
- Whiteboard ITs run through `@conciv/extension-testkit` (`callTool` → assert `api.page`); use keyboard not pointer for shadow-overlay buttons (testkit skips UnoCSS). No tests in example apps.
- Build / typecheck / test via turborepo. Commit logical groups with `--no-verify` after manual `oxfmt` + `oxlint` (the prek hook conflicts its stash on partial commits in this worktree).
- Every whiteboard overlay is **controlled** (`open={signal}`); `track()` reads `props.open` only — it does NOT wrap `onOpenChange` (the flat `Dialog` emits `(open: boolean)` while `Popover.Root` emits `(details: {open})`; reading `props.open` sidesteps the mismatch). Uncontrolled `defaultOpen` tracking is out of scope — no consumer needs it.

---

## File Structure

- `packages/widget/src/shell/dialogs.ts` — **new**. The overlay stack: `pushLayer`/`removeLayer` (private), `anyOpen`/`topOpen` (exported memos), `track()` (exported wrapper). One responsibility: host-side open-overlay bookkeeping + the suppression wire.
- `packages/widget/test/foreground.browser.test.tsx` — **new**. Browser test for the stack wire.
- `packages/extension/src/types.ts` — modify. Add `Dialog`/`Popover` to `ClientApi`.
- `packages/widget/src/page/client-api.ts` — modify. Provide `Dialog`/`Popover` (tracked) in `makeWidgetClientApi`.
- `packages/extension-testkit/src/host/host-runtime.tsx` — modify. Provide `Dialog`/`Popover` (untracked — no shell to suppress) so extension ITs render overlays.
- `packages/widget/src/shell/widget-shell.tsx` — modify. Import `anyOpen`; `suppressed`; swap `data-pw-picking` → `data-pw-suppressed` on panel + fab.
- `packages/widget/src/shell/quick-terminal.tsx` — modify. Swap `data-pw-picking` → `data-pw-suppressed`.
- `packages/widget/src/styles.css` — modify. Hide rule keys on `data-pw-suppressed`.
- `packages/extensions/whiteboard/src/client/model/comments.tsx` — modify. Carry `Dialog`/`Popover` through `CommentsProvider` → model.
- `packages/extensions/whiteboard/src/client/overlay.tsx` — modify. Pass `api.Dialog()` / `api.Popover()` into `CommentsProvider`; render `<Compose />` unconditionally.
- `packages/extensions/whiteboard/src/client/pins/compose.tsx` — modify. `api.Popover` anchored at the element; Cancel/Add → `md`.
- `packages/extensions/whiteboard/src/client/pins/drag-prompt.tsx` — modify. `api.Popover` anchored at the drop point.
- `packages/extensions/whiteboard/src/client/pins/thread.tsx` — modify. `ThreadPopover` → `model.Popover`; delete-confirm → `model.Dialog`.
- `packages/extensions/whiteboard/src/client/ui.tsx` — modify. Remove the local `Popover` wrapper (consolidated into `api.Popover`).

---

## Task 1: The overlay stack module (`dialogs.ts`)

**Files:**

- Create: `packages/widget/src/shell/dialogs.ts`
- Test: `packages/widget/test/foreground.browser.test.tsx`

**Interfaces:**

- Produces: `track<P extends {open?: boolean}>(Inner: Component<P>): Component<P>`, `anyOpen: Accessor<boolean>`, `topOpen: Accessor<{isOpen: () => boolean} | undefined>`.

- [ ] **Step 1: Write the failing test** — `packages/widget/test/foreground.browser.test.tsx`

```tsx
import {describe, it, expect, afterEach} from 'vitest'
import {render} from 'solid-js/web'
import {createSignal} from 'solid-js'
import {track, anyOpen} from '../src/shell/dialogs.js'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  document.body.replaceChildren()
})

function Probe(_props: {open?: boolean}) {
  return <div />
}
const TrackedProbe = track(Probe)

describe('foreground overlay stack', () => {
  it('anyOpen follows a tracked overlay opening and closing', async () => {
    const [open, setOpen] = createSignal(false)
    const host = document.createElement('div')
    document.body.appendChild(host)
    disposers.push(render(() => <TrackedProbe open={open()} />, host))
    await Promise.resolve()
    expect(anyOpen()).toBe(false)
    setOpen(true)
    expect(anyOpen()).toBe(true)
    setOpen(false)
    expect(anyOpen()).toBe(false)
  })

  it('drops the layer when the overlay unmounts', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = render(() => <TrackedProbe open={true} />, host)
    await Promise.resolve()
    expect(anyOpen()).toBe(true)
    dispose()
    await Promise.resolve()
    expect(anyOpen()).toBe(false)
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @conciv/widget exec vitest run test/foreground.browser.test.tsx`
Expected: FAIL — `Cannot find module '../src/shell/dialogs.js'`.

- [ ] **Step 3: Implement `dialogs.ts`**

```tsx
import {createSignal, createMemo, onCleanup, onMount, type Component} from 'solid-js'

// Open-overlay bookkeeping. A module-level signal shared across the dynamic-import boundary, exactly
// like react-grab/picking.ts — the shell imports `anyOpen` and reads it; that read is the wire.
type Layer = {isOpen: () => boolean}

const [stack, setStack] = createSignal<Layer[]>([])
const pushLayer = (layer: Layer): void => setStack((current) => [...current, layer])
const removeLayer = (layer: Layer): void => setStack((current) => current.filter((entry) => entry !== layer))

export const anyOpen = createMemo(() => stack().some((layer) => layer.isOpen()))
export const topOpen = createMemo(() => stack().findLast((layer) => layer.isOpen()))

// Wraps a controlled overlay so the host knows when it is open. A signal-array (not a store) lets the
// layer be removed by reference, so no per-layer id is needed. Reads props.open only — controlled.
export function track<P extends {open?: boolean}>(Inner: Component<P>): Component<P> {
  return (props) => {
    const isOpen = () => props.open ?? false
    const layer: Layer = {isOpen}
    onMount(() => pushLayer(layer))
    onCleanup(() => removeLayer(layer))
    return <Inner {...props} />
  }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm --filter @conciv/widget exec vitest run test/foreground.browser.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
cd packages/widget && pnpm exec oxfmt --write src/shell/dialogs.ts test/foreground.browser.test.tsx && pnpm exec oxlint src/shell/dialogs.ts test/foreground.browser.test.tsx && cd ../..
git add packages/widget/src/shell/dialogs.ts packages/widget/test/foreground.browser.test.tsx
git commit --no-verify -m "feat(widget): foreground overlay stack + track() wrapper"
```

---

## Task 2: `ClientApi.Dialog` / `Popover` + both implementers

**Files:**

- Modify: `packages/extension/src/types.ts`
- Modify: `packages/widget/src/page/client-api.ts`
- Modify: `packages/extension-testkit/src/host/host-runtime.tsx`

**Interfaces:**

- Consumes: `track` from Task 1; `Dialog`, `Popover` from `@conciv/ui-kit-system`.
- Produces: `ClientApi.Dialog: () => Component<ComponentProps<typeof Dialog>>`, `ClientApi.Popover: () => typeof Popover`.

- [ ] **Step 1: Add the types** — `packages/extension/src/types.ts`

Add the imports at the top (the package already depends on `@conciv/ui-kit-system`):

```ts
import {Dialog, Popover} from '@conciv/ui-kit-system'
import type {Component, ComponentProps} from 'solid-js'
```

Add the two fields to `ClientApi` (after `surface`):

```ts
surface: () => HTMLElement
Dialog: () => Component<ComponentProps<typeof Dialog>>
Popover: () => typeof Popover
env: {
  reducedMotion: () => boolean
  doc: Document
  win: Window
}
```

- [ ] **Step 2: Provide them in the widget** — `packages/widget/src/page/client-api.ts`

Add imports:

```ts
import {Dialog, Popover} from '@conciv/ui-kit-system'
import {track} from '../shell/dialogs.js'
```

Add the two fields to the returned object (after `surface`):

```ts
    surface: () => ensureEffectsSurface({styles}),
    Dialog: () => track(Dialog),
    Popover: () => Object.assign({}, Popover, {Root: track(Popover.Root)}),
```

- [ ] **Step 3: Provide them in the testkit (untracked)** — `packages/extension-testkit/src/host/host-runtime.tsx`

Add import:

```ts
import {Dialog, Popover} from '@conciv/ui-kit-system'
```

Add the two fields to the `clientApi` literal (after `surface`). The testkit has no chat shell to suppress, so the plain components are correct:

```ts
    surface: () => ensureEffectsSurface(),
    Dialog: () => Dialog,
    Popover: () => Popover,
```

- [ ] **Step 4: Typecheck the three packages**

Run: `pnpm turbo run typecheck --filter=@conciv/extension --filter=@conciv/widget --filter=@conciv/extension-testkit`
Expected: PASS (no type errors). If `@conciv/extension` build artifacts are stale for downstream consumers, also run `pnpm turbo run build --filter=@conciv/extension`.

- [ ] **Step 5: Format, lint, commit**

```bash
git add packages/extension/src/types.ts packages/widget/src/page/client-api.ts packages/extension-testkit/src/host/host-runtime.tsx
pnpm exec oxfmt --write packages/extension/src/types.ts packages/widget/src/page/client-api.ts packages/extension-testkit/src/host/host-runtime.tsx
git commit --no-verify -m "feat(extension): host-owned Dialog/Popover on ClientApi (widget tracked, testkit plain)"
```

---

## Task 3: Shell suppression (`picking() || anyOpen()`)

**Files:**

- Modify: `packages/widget/src/shell/widget-shell.tsx` (imports ~line 24; panel `data-pw-picking` ~line 459; fab ~line 533)
- Modify: `packages/widget/src/shell/quick-terminal.tsx` (`data-pw-picking` ~line 228)
- Modify: `packages/widget/src/styles.css` (hide rule lines 111-117)

**Interfaces:**

- Consumes: `anyOpen` from Task 1; `picking` (existing).

- [ ] **Step 1: Import `anyOpen` + add `suppressed`** — `packages/widget/src/shell/widget-shell.tsx`

Next to the existing `import {picking, cancelPick} from '../page/react-grab/picking.js'`:

```ts
import {anyOpen} from './dialogs.js'
```

Inside the shell render component (near where `picking` is read), add:

```ts
const suppressed = () => picking() || anyOpen()
```

- [ ] **Step 2: Swap the hide attribute on panel + fab** — same file

Replace both occurrences of `data-pw-picking={picking() ? '' : undefined}` (the panel ~459 and the fab ~533) with:

```tsx
data-pw-suppressed={suppressed() ? '' : undefined}
```

Leave the `<Show when={picking()}>` pick-mode pill untouched — only the hide attribute generalizes.

- [ ] **Step 3: Swap the hide attribute on the quick terminal** — `packages/widget/src/shell/quick-terminal.tsx`

Add the import:

```ts
import {anyOpen} from './dialogs.js'
```

Replace `data-pw-picking={picking() ? '' : undefined}` (~228) with:

```tsx
data-pw-suppressed={picking() || anyOpen() ? '' : undefined}
```

- [ ] **Step 4: Point the hide rule at the new attribute** — `packages/widget/src/styles.css` (lines 111-113)

```css
[data-pw-panel][data-pw-suppressed],
[data-pw-fab][data-pw-suppressed],
[data-pw-qt][data-pw-suppressed] {
  opacity: 0;
  pointer-events: none;
  transition: opacity 140ms var(--pw-ease);
}
```

- [ ] **Step 5: Build the widget bundle + re-run the style regression**

Run: `pnpm turbo run build --filter=@conciv/widget`
Then: `pnpm --filter @conciv/widget exec vitest run test/style-regression.test.ts`
Expected: PASS unchanged — non-picking / non-dialog states never carried `data-pw-picking`, so swapping the attribute name does not move any computed style. (If it fails because the picking pill state moved, that is a real regression — fix before committing; do NOT re-bless blindly.)

- [ ] **Step 6: Format, lint, commit**

```bash
pnpm exec oxfmt --write packages/widget/src/shell/widget-shell.tsx packages/widget/src/shell/quick-terminal.tsx
pnpm exec oxlint packages/widget/src/shell/widget-shell.tsx packages/widget/src/shell/quick-terminal.tsx
git add packages/widget/src/shell/widget-shell.tsx packages/widget/src/shell/quick-terminal.tsx packages/widget/src/styles.css
git commit --no-verify -m "feat(widget): hide chat while picking or any host overlay is open"
```

---

## Task 4: Thread `Dialog`/`Popover` through the comments model

**Files:**

- Modify: `packages/extensions/whiteboard/src/client/model/comments.tsx`
- Modify: `packages/extensions/whiteboard/src/client/overlay.tsx`

**Interfaces:**

- Consumes: `api.Dialog`, `api.Popover` (Task 2).
- Produces: `model.Dialog`, `model.Popover` on `CommentsModel`; `CommentsProvider` gains `dialog` / `popover` props.

- [ ] **Step 1: Accept the primitives in the model** — `comments.tsx`

Add the import:

```ts
import type {Component, ComponentProps} from 'solid-js'
import type {Dialog as DialogComponent, Popover as PopoverComponent} from '@conciv/ui-kit-system'
```

Change the model factory signature and expose them. The factory currently is
`export function createCommentsModel(room: Accessor<string>, apiBase: string)`:

```ts
export function createCommentsModel(
  room: Accessor<string>,
  apiBase: string,
  overlays: {Dialog: Component<ComponentProps<typeof DialogComponent>>; Popover: typeof PopoverComponent},
) {
  // …existing body unchanged…
```

Add `Dialog` and `Popover` to the returned object (anywhere in the `return {…}`):

```ts
    Dialog: overlays.Dialog,
    Popover: overlays.Popover,
```

- [ ] **Step 2: Accept + forward the primitives in the provider** — `comments.tsx`

```tsx
export function CommentsProvider(props: {
  room: Accessor<string>
  apiBase: string
  dialog: Component<ComponentProps<typeof DialogComponent>>
  popover: typeof PopoverComponent
  children: JSX.Element
}): JSX.Element {
  const model = createCommentsModel(props.room, props.apiBase, {Dialog: props.dialog, Popover: props.popover})
  return <CommentsContext.Provider value={model}>{props.children}</CommentsContext.Provider>
}
```

- [ ] **Step 3: Pass `api.Dialog()` / `api.Popover()` from the overlay** — `overlay.tsx` (`Canvas`, ~line 88)

```tsx
return (
  <CommentsProvider
    room={props.room}
    apiBase={props.api.apiBase}
    dialog={props.api.Dialog()}
    popover={props.api.Popover()}
  >
    <ComposeBridge registerComment={props.registerComment} />
    <CanvasView doc={props.doc} visible={props.visible} room={props.room} self={props.self} />
  </CommentsProvider>
)
```

- [ ] **Step 4: Typecheck the whiteboard**

Run: `pnpm turbo run typecheck --filter=@conciv/extension-whiteboard`
Expected: PASS.

- [ ] **Step 5: Format, lint, commit**

```bash
pnpm exec oxfmt --write packages/extensions/whiteboard/src/client/model/comments.tsx packages/extensions/whiteboard/src/client/overlay.tsx
pnpm exec oxlint packages/extensions/whiteboard/src/client/model/comments.tsx packages/extensions/whiteboard/src/client/overlay.tsx
git add packages/extensions/whiteboard/src/client/model/comments.tsx packages/extensions/whiteboard/src/client/overlay.tsx
git commit --no-verify -m "feat(whiteboard): carry host Dialog/Popover through the comments model"
```

---

## Task 5: Compose → `api.Popover` (anchored) + larger buttons

**Files:**

- Modify: `packages/extensions/whiteboard/src/client/pins/compose.tsx`
- Modify: `packages/extensions/whiteboard/src/client/overlay.tsx` (`CanvasView`, ~line 70)

**Interfaces:**

- Consumes: `model.Popover`, `model.composeTarget`, `model.cancelCompose`, `model.createComment` (existing).

- [ ] **Step 1: Render `<Compose />` unconditionally** — `overlay.tsx` `CanvasView`

So the Popover is mounted (its layer pushed) while the canvas is visible, and `open` tracks `composeTarget` with no per-open mount delay. Replace:

```tsx
<Show when={model.composeTarget()}>{(target) => <Compose target={target()} />}</Show>
```

with:

```tsx
<Compose />
```

- [ ] **Step 2: Rewrite `compose.tsx` on `api.Popover`**

```tsx
import {createSignal, type JSX} from 'solid-js'
import {Button, TextField} from '@conciv/ui-kit-system'
import {useComments} from '../model/comments.js'

const CONTENT = 'w-72 max-w-[calc(100vw-2rem)] flex flex-col gap-2 p-3'

export function Compose(): JSX.Element {
  const model = useComments()
  const Popover = model.Popover
  const [draft, setDraft] = createSignal('')
  const submit = (): void => {
    const target = model.composeTarget()
    if (!target) return
    const text = draft().trim()
    if (!text) return model.cancelCompose()
    model.createComment(target, text)
    setDraft('')
  }
  return (
    <Popover.Root
      open={model.composeTarget() !== null}
      onOpenChange={(detail) => detail.open || model.cancelCompose()}
      positioning={{
        placement: 'bottom-start',
        gutter: 8,
        getAnchorRect: () => {
          const target = model.composeTarget()
          return target ? {x: target.screen.x, y: target.screen.y, width: 0, height: 0} : null
        },
      }}
    >
      <Popover.Positioner>
        <Popover.Content class={CONTENT} aria-label="New comment">
          <TextField
            aria-label="Comment"
            ref={(element) => queueMicrotask(() => element.focus())}
            placeholder="Add a comment"
            value={draft()}
            onInput={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.isComposing) submit()
              if (event.key === 'Escape') model.cancelCompose()
            }}
          />
          <div class="flex gap-2 justify-end">
            <Button variant="ghost" size="md" aria-label="Cancel comment" onClick={() => model.cancelCompose()}>
              Cancel
            </Button>
            <Button size="md" aria-label="Add comment" onClick={() => submit()}>
              Add
            </Button>
          </div>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}
```

- [ ] **Step 3: Build + typecheck the whiteboard**

Run: `pnpm turbo run build typecheck --filter=@conciv/extension-whiteboard`
Expected: PASS.

- [ ] **Step 4: Run the whiteboard ITs (compose path unaffected server-side)**

Run: `pnpm --filter @conciv/extension-whiteboard test`
Expected: PASS (the existing 11 ITs — they create comments via `callTool` and exercise the thread/inbox, which are unchanged at this point). The compose _UI_ (element-pick → box) is client-only and react-grab-driven, so it is verified in the running app in Task 8, not by an IT.

- [ ] **Step 5: Format, lint, commit**

```bash
pnpm exec oxfmt --write packages/extensions/whiteboard/src/client/pins/compose.tsx packages/extensions/whiteboard/src/client/overlay.tsx
pnpm exec oxlint packages/extensions/whiteboard/src/client/pins/compose.tsx packages/extensions/whiteboard/src/client/overlay.tsx
git add packages/extensions/whiteboard/src/client/pins/compose.tsx packages/extensions/whiteboard/src/client/overlay.tsx
git commit --no-verify -m "feat(whiteboard): compose on api.Popover (anchored) + md Cancel/Add"
```

---

## Task 6: Drag-prompt → `api.Popover` (anchored)

**Files:**

- Modify: `packages/extensions/whiteboard/src/client/pins/drag-prompt.tsx`

**Interfaces:**

- Consumes: `model.Popover` via `useComments()`. The existing `DragPromptProps` (`x`, `y`, `onDisconnect`, `onKeep`, `onCancel`) and the `<Show when={prompt()}>` call site in `pins.tsx` stay unchanged.

- [ ] **Step 1: Rewrite `drag-prompt.tsx` on `api.Popover`**

```tsx
import {type JSX} from 'solid-js'
import {Button} from '@conciv/ui-kit-system'
import {useComments} from '../model/comments.js'

export type DragPromptProps = {
  x: number
  y: number
  onDisconnect: () => void
  onKeep: () => void
  onCancel: () => void
}

const CONTENT = 'min-w-45 flex flex-col gap-0.5 p-1'

export function DragPrompt(props: DragPromptProps): JSX.Element {
  const model = useComments()
  const Popover = model.Popover
  return (
    <Popover.Root
      open={true}
      onOpenChange={(detail) => detail.open || props.onCancel()}
      positioning={{
        placement: 'right-start',
        gutter: 8,
        getAnchorRect: () => ({x: props.x + 16, y: props.y, width: 0, height: 0}),
      }}
    >
      <Popover.Positioner>
        <Popover.Content class={CONTENT} aria-label="Pin drift">
          <Button
            ref={(element) => queueMicrotask(() => element.focus())}
            variant="ghost"
            size="sm"
            class="justify-start"
            onClick={() => props.onDisconnect()}
          >
            Disconnect from source
          </Button>
          <Button variant="ghost" size="sm" class="justify-start" onClick={() => props.onKeep()}>
            Keep link, accept drift
          </Button>
          <Button variant="ghost" size="sm" class="justify-start" onClick={() => props.onCancel()}>
            Cancel
          </Button>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}
```

Note: it stays rendered only under `pins.tsx`'s `<Show when={prompt()}>`, so `open={true}` is correct — the Show controls presence, and Ark closing (Escape / interact-outside) routes through `onCancel`.

- [ ] **Step 2: Build + typecheck**

Run: `pnpm turbo run build typecheck --filter=@conciv/extension-whiteboard`
Expected: PASS.

- [ ] **Step 3: Run the pin-drag IT**

Run: `pnpm --filter @conciv/extension-whiteboard exec vitest run test/pin-pan.it.test.ts`
Expected: PASS (the drift-prompt path still surfaces "Disconnect from source" / "Keep link, accept drift" by role). If that IT does not currently reach the prompt, this is verified in the running app in Task 8.

- [ ] **Step 4: Format, lint, commit**

```bash
pnpm exec oxfmt --write packages/extensions/whiteboard/src/client/pins/drag-prompt.tsx
pnpm exec oxlint packages/extensions/whiteboard/src/client/pins/drag-prompt.tsx
git add packages/extensions/whiteboard/src/client/pins/drag-prompt.tsx
git commit --no-verify -m "feat(whiteboard): drag-prompt on api.Popover (anchored)"
```

---

## Task 7: Thread + delete-confirm → `api.Popover` / `api.Dialog`; drop local Popover

**Files:**

- Modify: `packages/extensions/whiteboard/src/client/pins/thread.tsx`
- Modify: `packages/extensions/whiteboard/src/client/ui.tsx`

**Interfaces:**

- Consumes: `model.Popover`, `model.Dialog` via `useComments()`.

- [ ] **Step 1: Use the host primitives in `thread.tsx`**

Change the imports — drop `Dialog` and the local `Popover`:

```ts
import {Button, RelativeTime, ScrollArea} from '@conciv/ui-kit-system'
import {Avatar, Menu, MenuItem, Tooltip} from '../ui.js'
```

In `ThreadPopover`, read the primitives from the model and use them in place of the local `Popover` and the ui-kit-system `Dialog`:

```tsx
export function ThreadPopover(): JSX.Element {
  const model = useComments()
  const Popover = model.Popover
  const Dialog = model.Dialog
  const [confirmDelete, setConfirmDelete] = createSignal(false)
  const [composerEl, setComposerEl] = createSignal<HTMLElement>()
  return (
    <Popover.Root
      open={!!model.rootOf(model.openCid() ?? '')}
      onOpenChange={(detail) => detail.open || model.closeThread()}
      modal={false}
      positioning={{placement: 'right-start', gutter: 8, getAnchorRect: model.anchorRect}}
      initialFocusEl={() => composerEl() ?? null}
      finalFocusEl={model.openPinEl}
    >
      <Popover.Positioner>
        <Popover.Content
          class="w-85 max-w-[calc(100vw-2rem)] max-sm:w-[calc(100vw-1rem)] flex flex-col overflow-hidden"
          aria-label="Comment thread"
        >
          <ThreadHeader onRequestDelete={() => setConfirmDelete(true)} />
          <Dialog open={confirmDelete()} onOpenChange={setConfirmDelete} dismissable label="Delete this thread?">
            {/* …existing delete-confirm body unchanged… */}
          </Dialog>
          <ScrollArea.Root class="flex-1 min-h-0">{/* …existing scroll body unchanged… */}</ScrollArea.Root>
          <Show when={model.rootOf(model.openCid() ?? '')}>
            <ThreadComposer onReady={(api) => setComposerEl(api.element)} />
          </Show>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}
```

Notes: the local wrapper's flat props (`open`/`getAnchorRect`/`initialFocusEl`/`finalFocusEl`/`label`/`class`) become the compound Ark equivalents — `getAnchorRect`/`placement` move into `positioning`, `label`/`class` onto `Popover.Content`, `onOpenChange` takes the Ark `{open}` detail. The delete-confirm `Dialog` keeps its flat boolean `onOpenChange` (`setConfirmDelete`).

- [ ] **Step 2: Remove the local `Popover` wrapper** — `packages/extensions/whiteboard/src/client/ui.tsx`

Delete the `Popover` function (and the now-unused `PopoverBase` import + the `Rect` type if only Popover used it). Keep `Avatar` / `Tooltip` / `Menu*` / `Tabs`.

- [ ] **Step 3: Build + typecheck**

Run: `pnpm turbo run build typecheck --filter=@conciv/extension-whiteboard`
Expected: PASS — no remaining references to the local `Popover`.

- [ ] **Step 4: Run the thread ITs**

Run: `pnpm --filter @conciv/extension-whiteboard exec vitest run test/thread-card.it.test.ts test/thread-delete.it.test.ts test/thread-empty.it.test.ts test/thread-unread.it.test.ts test/thread-mention.it.test.ts`
Expected: PASS — the thread popover and delete-confirm now render through `api.Popover` / `api.Dialog` (untracked in the testkit) and behave identically (open by clicking a pin, header buttons, delete flow).

- [ ] **Step 5: Format, lint, commit**

```bash
pnpm exec oxfmt --write packages/extensions/whiteboard/src/client/pins/thread.tsx packages/extensions/whiteboard/src/client/ui.tsx
pnpm exec oxlint packages/extensions/whiteboard/src/client/pins/thread.tsx packages/extensions/whiteboard/src/client/ui.tsx
git add packages/extensions/whiteboard/src/client/pins/thread.tsx packages/extensions/whiteboard/src/client/ui.tsx
git commit --no-verify -m "feat(whiteboard): thread + delete-confirm on api.Popover/api.Dialog; drop local Popover"
```

---

## Task 8: Full suite + real-app verification (the bug is fixed)

**Files:** none (verification + optional handoff fallback).

- [ ] **Step 1: Full build + typecheck + every affected suite**

Run:

```bash
pnpm turbo run build typecheck
pnpm --filter @conciv/widget test
pnpm --filter @conciv/extension-whiteboard test
pnpm --filter @conciv/ui-kit-system test
pnpm --filter @conciv/ui-kit-tap test
```

Expected: all green. Confirm the new `foreground.browser.test.tsx` passes and the style regression is unchanged.

- [ ] **Step 2: Run the example app**

Run (background): `cd apps/examples/tanstack-start && pnpm exec vite dev --port 3100`
(Port 3000 may be taken by an unrelated project; 3100 is safe. Kill stale servers with `pkill -f "vite dev"` only — never by port, which can kill the user's browser tab.)

- [ ] **Step 3: Verify each floating surface hides the chat and restores it**

In the browser at `http://localhost:3100/`, with the chat panel open:

- Click the "Comment on an element" (MessageSquarePlus) composer button → pick an element. Confirm the chat widget stays hidden continuously through the pick **and** while the compose box is open (no reappearance/overlap). Confirm Cancel/Add are comfortably sized. Submit or Cancel → the chat returns.
- Open the whiteboard, click a pin → the thread popover opens and the chat is hidden; close it → chat returns.
- Open a thread, click Delete → the confirm modal shows, chat hidden; cancel/confirm → chat returns.
- Drag a source-linked pin past the drift threshold → the drift prompt shows, chat hidden; resolve it → chat returns.
- Open the inbox panel → the chat is **not** hidden (docked panel is out of scope, by design).

- [ ] **Step 4: If a flash appears at the pick→compose handoff, apply the deterministic fallback**

Only if Step 3 shows the chat briefly flashing between the pick ending and the compose opening: in `packages/widget/src/page/react-grab/adapter.ts`, defer the deactivate clear to the next frame so the compose layer mounts first:

```ts
onDeactivate: () => requestAnimationFrame(() => setPicking(false)),
```

Re-verify Step 3, then commit:

```bash
git add packages/widget/src/page/react-grab/adapter.ts
git commit --no-verify -m "fix(widget): defer pick deactivate a frame so compose suppression is gapless"
```

- [ ] **Step 5: Stop the dev server**

Run: `pkill -f "vite dev"`

---

## Self-Review

- **Spec coverage:** API (`Dialog`/`Popover` via `ComponentProps`) → Task 2. Store/stack `track`/`anyOpen` → Task 1. Shell `suppressed` + `data-pw-suppressed` → Task 3. Whiteboard cutover (compose, drag-prompt, thread, delete-confirm) → Tasks 4–7. Cancel/Add `md` → Task 5. Local `Popover` removal → Task 7. Pick→compose handoff → Task 8 Step 4. Tests → Task 1 (wire), Tasks 5–7 (ITs), Task 8 (real app). Both `ClientApi` implementers updated → Task 2. Catalogued-but-left surfaces (menus/tooltips/notice) → untouched, as specified.
- **Type consistency:** `track<P extends {open?: boolean}>` is used for both `Dialog` (flat, `open: boolean`) and `Popover.Root` (Ark, `open?: boolean`). `model.Popover` = `typeof Popover`; `model.Dialog` = `Component<ComponentProps<typeof Dialog>>`. `onOpenChange` shapes are honored per component (Ark `{open}` for Popover.Root; boolean for the flat Dialog). `getAnchorRect` returns `Rect | null` matching `model.anchorRect`.
- **Placeholder scan:** the only `/* …unchanged… */` markers are in Task 7 Step 1 where existing delete-confirm / scroll bodies are explicitly carried over verbatim from the current file (not new code to write).
