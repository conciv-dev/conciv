# Chat Image Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, on `main` per user) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish capability-gated image input for the aidx chat composer — drag-and-drop, paste, an upload button, and multiple images per message.

**Architecture:** The server half shipped with the TanStack-AI `chat()` migration (merged 2026-06-14): `chat()` drives the turn through `harnessText(harness)`, the request schema accepts image content parts, the adapter extracts them, and claude delivers them as `@<path>` file references written under `cwd`. **Only the frontend and a thin capability-surfacing seam remain.**

**Tech Stack:** SolidJS + `@tanstack/ai-solid@0.13.4` (widget), h3 + `@tanstack/ai@0.28.0` (core), Zod (protocol), Vitest + Playwright (tests), Turborepo (build/typecheck). Per project rules: never jsdom — widget behavior tested in a real browser; build/typecheck via turbo.

**Spec:** `docs/superpowers/specs/2026-06-14-chat-image-input-design.md`

---

## Status after the TanStack-AI merge

**Already shipped — do NOT re-implement (verified by reading the merged code):**

- [x] `HarnessCapabilities.imageInput: 'native' | 'fileRef' | false` (`packages/protocol/src/harness-types.ts`). claude = `'fileRef'`.
- [x] `HarnessImage {mediaType, dataBase64}`, `images?` on `HarnessTurn`, `stdin?` on `HarnessChild`, optional `deliverInput` hook (76bfd72).
- [x] Request accepts image parts — `ChatContentPartSchema` (`source: {type, mimeType?, value}`) + `ChatMessageSchema.content: string | ContentPart[]` (`packages/protocol/src/chat-types.ts`).
- [x] Server extraction — `modelContent`/`toChatMessages` (`messages.ts`) build typed `ContentPart[]`; `lastUserImages` (`packages/harness/src/_shared/text-adapter.ts`) → `HarnessImage[]`, gated on `imageInput === false`.
- [x] Delivery — `turn.ts` runs `chat({adapter: harnessText(harness, …)})`; claude `buildArgs` writes each image to `.aidx-img-<uuid>.<ext>` under `cwd` and appends `@<path>` to the prompt (`packages/harness/src/claude/args.ts`, c16d5dd).

**Decision change vs the original plan:** claude ingests images via **`@<path>` file refs**, NOT native `--input-format stream-json`. (A live test showed stream-json base64 works, but the team chose fileRef; the `claude-image-fileref` memory records it.) Net effect: the old "native stdin / encodeStdin" tasks are obsolete. The widget is unaffected — it always sends base64 image content parts; the server converts.

**Remaining work (this plan):** config limits → surface capability+limits on the session → widget composer (button, dnd, paste, thumbnails, render, submit) → verify.

---

## File structure (remaining)

| File                                     | Change | Responsibility                                      |
| ---------------------------------------- | ------ | --------------------------------------------------- |
| `packages/protocol/src/config-types.ts`  | modify | `chat.images` config + `IMAGE_DEFAULTS`             |
| `packages/core/src/config.ts`            | modify | `resolveImageLimits` over defaults                  |
| `packages/protocol/src/chat-types.ts`    | modify | `images` block on `ChatSessionSchema`               |
| `packages/core/src/api/chat/session.ts`  | modify | emit `images` block                                 |
| `packages/core/src/api/chat/chat.ts`     | modify | thread `imageLimits` to the session route           |
| `packages/core/src/app.ts`               | modify | resolve + pass `imageLimits`                        |
| `packages/widget/src/image-validate.ts`  | create | pure validation (unit-testable)                     |
| `packages/widget/src/attachments.ts`     | create | SolidJS attachment store                            |
| `packages/widget/src/chat-shell.tsx`     | modify | composer: button, dnd, paste, strip, render, submit |
| `packages/widget/src/styles.css`         | modify | composer image styles                               |
| `packages/widget/test/widget.it.test.ts` | modify | session fixture + browser IT                        |

---

## Task 1: image limits config + defaults

**Files:**

- Modify: `packages/protocol/src/config-types.ts`
- Modify: `packages/core/src/config.ts`
- Test: `packages/core/test/config.test.ts`

- [ ] **Step 1: Write the failing test** — append to `config.test.ts`:

```ts
import {resolveImageLimits} from '../src/config.js'

it('resolves chat.images over IMAGE_DEFAULTS', () => {
  expect(resolveImageLimits(undefined)).toEqual({
    maxCount: 5,
    maxBytes: 5 * 1024 * 1024,
    accept: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  })
  expect(resolveImageLimits({maxCount: 2, accept: ['image/png']})).toEqual({
    maxCount: 2,
    maxBytes: 5 * 1024 * 1024,
    accept: ['image/png'],
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run test/config.test.ts`
Expected: FAIL — `resolveImageLimits` not exported.

- [ ] **Step 3: Edit `config-types.ts`** — extend `AidxConfig`, export defaults:

```ts
export interface AidxConfig {
  // …existing fields unchanged…
  chat?: {
    images?: {maxCount?: number; maxBytes?: number; accept?: string[]}
  }
}

export type ImageLimits = {maxCount: number; maxBytes: number; accept: string[]}

export const IMAGE_DEFAULTS: ImageLimits = {
  maxCount: 5,
  maxBytes: 5 * 1024 * 1024,
  accept: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
}
```

- [ ] **Step 4: Edit `config.ts`** — add the resolver (simple signature, no conditional type):

```ts
import {IMAGE_DEFAULTS, type ImageLimits} from '@aidx/protocol/config-types'

export function resolveImageLimits(images?: {maxCount?: number; maxBytes?: number; accept?: string[]}): ImageLimits {
  return {
    maxCount: images?.maxCount ?? IMAGE_DEFAULTS.maxCount,
    maxBytes: images?.maxBytes ?? IMAGE_DEFAULTS.maxBytes,
    accept: images?.accept ?? IMAGE_DEFAULTS.accept,
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm vitest run test/config.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol/src/config-types.ts packages/core/src/config.ts packages/core/test/config.test.ts
git commit -m "feat(config): configurable chat.images limits with sane defaults"
```

---

## Task 2: surface capability + limits on the session

**Files:**

- Modify: `packages/protocol/src/chat-types.ts`
- Modify: `packages/core/src/api/chat/session.ts`
- Modify: `packages/core/src/api/chat/chat.ts`
- Modify: `packages/core/src/app.ts`
- Test: `packages/core/test/api/chat/chat.it.test.ts`

- [ ] **Step 1: Write the failing test** — add to `chat.it.test.ts` (`startServer` is updated in Step 4 to pass `imageLimits`):

```ts
it('exposes the image capability + limits on GET /api/chat/session', async () => {
  const {server, base} = await startServer()
  try {
    const res = await fetch(`${base}/api/chat/session`)
    const body = await res.json()
    expect(body.images).toEqual({
      input: 'fileRef', // claude
      maxCount: 5,
      maxBytes: 5 * 1024 * 1024,
      accept: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    })
  } finally {
    await server.close()
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run test/api/chat/chat.it.test.ts -t "image capability"`
Expected: FAIL — `body.images` undefined.

- [ ] **Step 3: Edit `chat-types.ts`** — add to `ChatSessionSchema`:

```ts
export const ChatSessionSchema = z.object({
  sessionId: z.string().nullable(),
  source: z.enum(['agent', 'chat', 'new']),
  cwd: z.string(),
  lock: z.object({held: z.boolean(), role: z.enum(['iterate', 'chat']).nullable()}),
  images: z.object({
    input: z.union([z.literal('native'), z.literal('fileRef'), z.literal(false)]),
    maxCount: z.number(),
    maxBytes: z.number(),
    accept: z.array(z.string()),
  }),
})
```

- [ ] **Step 4: Edit `session.ts`** — add `imageLimits` to `SessionRouteDeps`, emit the block:

```ts
import type {ImageLimits} from '@aidx/protocol/config-types'

export type SessionRouteDeps = {
  cwd: string
  stateRoot: string
  initialSessionId: string
  harness: HarnessAdapter
  state: SessionState
  imageLimits: ImageLimits
}
```

In the `GET /api/chat/session` handler, extend `body`:

```ts
const body: ChatSession = {
  sessionId,
  source,
  cwd: deps.cwd,
  lock: {held: lock.held, role: lock.role},
  images: {input: deps.harness.capabilities.imageInput, ...deps.imageLimits},
}
```

- [ ] **Step 5: Thread `imageLimits` through `chat.ts`** — add `imageLimits: ImageLimits` to `ChatRouteOpts`, and pass `imageLimits: opts.imageLimits` into the `registerSessionRoutes({...})` call.

- [ ] **Step 6: Thread from `app.ts`** — in the `registerChatRoutes(app, {...})` call add:

```ts
import {resolveImageLimits} from './config.js'
// inside the registerChatRoutes options object:
imageLimits: resolveImageLimits(opts.cfg.chat?.images),
```

Then update the `chat.it.test.ts` `startServer`'s `registerChatRoutes(app, {...})` call to add `imageLimits: {maxCount: 5, maxBytes: 5 * 1024 * 1024, accept: ['image/png','image/jpeg','image/webp','image/gif']}`.

- [ ] **Step 7: Run test to verify it passes**

Run: `cd packages/core && pnpm vitest run test/api/chat/chat.it.test.ts -t "image capability"`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/protocol/src/chat-types.ts packages/core/src/api/chat packages/core/src/app.ts packages/core/test/api/chat/chat.it.test.ts
git commit -m "feat(core): surface image capability + limits on chat session"
```

---

## Task 3: widget — pure image validation

**Files:**

- Create: `packages/widget/src/image-validate.ts`
- Test: `packages/widget/test/image-validate.test.ts`

- [ ] **Step 1: Write the failing test** — create `packages/widget/test/image-validate.test.ts` (pure logic, plain vitest, no DOM/jsdom):

```ts
import {describe, it, expect} from 'vitest'
import {validateImage} from '../src/image-validate.js'

const limits = {maxCount: 2, maxBytes: 100, accept: ['image/png']}

describe('validateImage', () => {
  it('accepts a valid file under the count limit', () => {
    expect(validateImage({type: 'image/png', size: 50}, 0, limits)).toEqual({ok: true})
  })
  it('rejects an unsupported type', () => {
    expect(validateImage({type: 'image/bmp', size: 10}, 0, limits)).toEqual({ok: false, error: 'Unsupported type'})
  })
  it('rejects an oversize file', () => {
    expect(validateImage({type: 'image/png', size: 200}, 0, limits)).toEqual({
      ok: false,
      error: 'Too large (max 0.1MB)',
    })
  })
  it('rejects when the count limit is reached', () => {
    expect(validateImage({type: 'image/png', size: 10}, 2, limits)).toEqual({ok: false, error: 'Max 2 images'})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/widget && pnpm vitest run test/image-validate.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Create `image-validate.ts`:**

```ts
import type {ImageLimits} from '@aidx/protocol/config-types'

export type ValidateResult = {ok: true} | {ok: false; error: string}

// Pure guard for one candidate file given how many images are already staged.
export function validateImage(
  file: {type: string; size: number},
  currentCount: number,
  limits: ImageLimits,
): ValidateResult {
  if (currentCount >= limits.maxCount) return {ok: false, error: `Max ${limits.maxCount} images`}
  if (!limits.accept.includes(file.type)) return {ok: false, error: 'Unsupported type'}
  if (file.size > limits.maxBytes)
    return {ok: false, error: `Too large (max ${(limits.maxBytes / 1024 / 1024).toFixed(1)}MB)`}
  return {ok: true}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/widget && pnpm vitest run test/image-validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/image-validate.ts packages/widget/test/image-validate.test.ts
git commit -m "feat(widget): pure image-validation guard"
```

---

## Task 4: widget — attachment store

**Files:**

- Create: `packages/widget/src/attachments.ts`

(Behavior exercised by the browser IT in Task 9 — `FileReader`/object URLs are browser-only, no jsdom unit test. This task is a typed implementation step.)

- [ ] **Step 1: Create `attachments.ts`** — the `send` output matches `ChatContentPartSchema`/`modelContent` exactly (`{type:'image', source:{type:'data', value, mimeType}}`):

```ts
import {createSignal} from 'solid-js'
import type {ImageLimits} from '@aidx/protocol/config-types'
import {validateImage} from './image-validate.js'

export type PendingImage = {id: string; name: string; mimeType: string; bytes: number; previewUrl: string}

// TanStack image content part (data source) — the shape sendMessage({content}) accepts and the
// server's modelContent reads.
export type ImagePart = {type: 'image'; source: {type: 'data'; value: string; mimeType: string}}

async function toBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

let counter = 0

export function createImageAttachments(limits: () => ImageLimits) {
  const [pending, setPending] = createSignal<PendingImage[]>([])
  const [error, setError] = createSignal<string>('')
  const files = new Map<string, File>()

  const add = (file: File): void => {
    const result = validateImage(file, pending().length, limits())
    if (!result.ok) {
      setError(result.error)
      return
    }
    const id = `img-${counter++}`
    files.set(id, file)
    setError('')
    setPending((p) => [
      ...p,
      {id, name: file.name, mimeType: file.type, bytes: file.size, previewUrl: URL.createObjectURL(file)},
    ])
  }

  const remove = (id: string): void => {
    const target = pending().find((p) => p.id === id)
    if (target) URL.revokeObjectURL(target.previewUrl)
    files.delete(id)
    setPending((p) => p.filter((x) => x.id !== id))
  }

  const clear = (): void => {
    pending().forEach((p) => URL.revokeObjectURL(p.previewUrl))
    files.clear()
    setPending([])
    setError('')
  }

  const sendAll = async (): Promise<ImagePart[]> =>
    Promise.all(
      pending().map(async (p) => ({
        type: 'image' as const,
        source: {type: 'data' as const, value: await toBase64(files.get(p.id)!), mimeType: p.mimeType},
      })),
    )

  return {pending, error, add, remove, clear, sendAll}
}
```

> Note: `limits` is passed as an accessor (`() => ImageLimits`) so the store reads the latest session-derived limits after hydrate, not a stale snapshot.

- [ ] **Step 2: Typecheck the widget**

Run: `pnpm turbo typecheck --filter=@aidx/widget`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/widget/src/attachments.ts
git commit -m "feat(widget): image attachment store (add/remove/clear/sendAll)"
```

---

## Task 5: widget — composer upload button, thumbnail strip, submit

**Files:**

- Modify: `packages/widget/src/chat-shell.tsx`
- Modify: `packages/widget/src/styles.css`

- [ ] **Step 1: Wire session capability + the store in `ChatFeature`.** After `const api = createChatApi(...)`:

```ts
import {createImageAttachments, type ImagePart} from './attachments.js'
import {IMAGE_DEFAULTS} from '@aidx/protocol/config-types'

const [imageCaps, setImageCaps] = createSignal(IMAGE_DEFAULTS)
const [imageInput, setImageInput] = createSignal<'native' | 'fileRef' | false>(false)
const attachments = createImageAttachments(imageCaps)
```

In `hydrate`, after `const session = await api.session()`:

```ts
setImageInput(session.images.input)
setImageCaps({maxCount: session.images.maxCount, maxBytes: session.images.maxBytes, accept: session.images.accept})
```

> The composer reads `imageInput()`; before hydrate it is `false`, so the upload UI mounts once the panel opens and the session resolves. `useChat` is unchanged — no `forwardedProps`/`sessionId` wiring (the widget never originated a sessionId; resume is server-driven).

- [ ] **Step 2: Update `submit`** to include images. `sendMessage` accepts `string | {content: string | ContentPart[]}` (verified: `MultimodalContent`):

```ts
const submit = (e: Event) => {
  e.preventDefault()
  const text = input().trim()
  const hasImages = attachments.pending().length > 0
  if ((!text && !hasImages) || chat.isLoading()) return
  setInput('')
  if (hasImages) {
    void attachments.sendAll().then((parts: ImagePart[]) => {
      const content = text ? [{type: 'text', content: text}, ...parts] : parts
      void chat.sendMessage({content})
      attachments.clear()
    })
  } else {
    void chat.sendMessage(text)
  }
}
```

- [ ] **Step 3: Add the `PaperclipIcon`** near `SendArrow`:

```tsx
function PaperclipIcon(): JSX.Element {
  return (
    <svg class="pw-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21 11.5l-8.5 8.5a5 5 0 01-7-7l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  )
}
```

- [ ] **Step 4: Restructure the composer `<form>`** into a column (strip above the input row). Add `let fileInputEl: HTMLInputElement | undefined` with the other refs. Replace the `<form class="pw-chat-composer">` body:

```tsx
<form class="pw-chat-composer" onSubmit={submit}>
  <Show when={imageInput() !== false}>
    <Show when={attachments.pending().length > 0}>
      <div class="pw-chat-thumbs">
        <For each={attachments.pending()}>
          {(img) => (
            <div class="pw-chat-thumb">
              <img src={img.previewUrl} alt={img.name} />
              <button
                type="button"
                class="pw-chat-thumb-x"
                aria-label={`Remove ${img.name}`}
                onClick={() => attachments.remove(img.id)}
              >
                ✕
              </button>
            </div>
          )}
        </For>
      </div>
    </Show>
    <Show when={attachments.error()}>
      <div class="pw-chat-thumb-err" role="alert">
        {attachments.error()}
      </div>
    </Show>
  </Show>
  <div class="pw-chat-composer-row">
    <Show when={imageInput() !== false}>
      <button type="button" class="pw-chat-attach" aria-label="Attach image" onClick={() => fileInputEl?.click()}>
        <PaperclipIcon />
      </button>
      <input
        type="file"
        class="pw-chat-file"
        accept={imageCaps().accept.join(',')}
        multiple={imageCaps().maxCount > 1}
        ref={(el) => {
          fileInputEl = el
        }}
        onChange={(e) => {
          for (const f of Array.from(e.currentTarget.files ?? [])) attachments.add(f)
          e.currentTarget.value = ''
        }}
      />
    </Show>
    <textarea
      class="pw-chat-input"
      rows={1}
      placeholder="Ask a question…"
      aria-label="Message the aidx agent"
      value={input()}
      onInput={(e) => setInput(e.currentTarget.value)}
      onKeyDown={onKeyDown}
      ref={(el) => {
        inputEl = el
      }}
    />
    {/* existing send/stop <Show> block, unchanged except the disabled rule below */}
  </div>
</form>
```

Update the send button `disabled` to also enable with staged images: `disabled={!input().trim() && attachments.pending().length === 0}`.

- [ ] **Step 5: Add CSS** to `styles.css` (uses the existing token system — magenta `--pw-accent`, `--pw-r-*`, `--pw-ease*`, `pw-pin-in` keyframe):

```css
.pw-chat-composer {
  flex-direction: column;
  align-items: stretch;
}
.pw-chat-composer-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.pw-chat-thumbs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.pw-chat-thumb {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: var(--pw-r-md);
  overflow: hidden;
  border: 1px solid var(--pw-line);
  animation: pw-pin-in 240ms var(--pw-ease-expo) both;
}
.pw-chat-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.pw-chat-thumb-x {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: var(--pw-r-pill);
  border: none;
  background: oklch(0.12 0.01 var(--pw-hue) / 0.72);
  color: var(--pw-text-hi);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 120ms var(--pw-ease);
}
.pw-chat-thumb-x:hover {
  background: var(--pw-accent);
  color: var(--pw-on-accent);
}
.pw-chat-thumb-err {
  color: var(--pw-danger);
  font-size: 12px;
  margin-bottom: 8px;
}
.pw-chat-attach {
  width: 38px;
  height: 38px;
  border-radius: var(--pw-r-pill);
  border: 1px solid var(--pw-line);
  background: transparent;
  color: var(--pw-text-2);
  cursor: pointer;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color 120ms var(--pw-ease),
    color 120ms var(--pw-ease);
}
.pw-chat-attach:hover {
  background: var(--pw-fill);
  color: var(--pw-text-hi);
}
.pw-chat-file {
  display: none;
}
```

- [ ] **Step 6: Build + typecheck the widget** (the browser IT loads the built global bundle):

Run: `pnpm turbo build typecheck --filter=@aidx/widget`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/widget/src/chat-shell.tsx packages/widget/src/styles.css
git commit -m "feat(widget): composer upload button, thumbnail strip, image send"
```

---

## Task 6: widget — drag-and-drop

**Files:**

- Modify: `packages/widget/src/chat-shell.tsx`
- Modify: `packages/widget/src/styles.css`

- [ ] **Step 1: Add drag state + handlers in `ChatFeature`:**

```ts
const [dragging, setDragging] = createSignal(false)

const onDragOver = (e: DragEvent) => {
  if (imageInput() === false) return
  e.preventDefault()
  setDragging(true)
}
const onDragLeave = (e: DragEvent) => {
  if (e.currentTarget === e.target) setDragging(false)
}
const onDrop = (e: DragEvent) => {
  if (imageInput() === false) return
  e.preventDefault()
  setDragging(false)
  for (const f of Array.from(e.dataTransfer?.files ?? [])) {
    if (f.type.startsWith('image/')) attachments.add(f)
  }
}
```

- [ ] **Step 2: Wire to the panel `<section>`** — add `onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}`, and toggle a class: `class={`${panelClass(closing())}${dragging() ? ' pw-chat-dragging' : ''}`}`. Add a drop hint after `<header>`:

```tsx
<Show when={dragging()}>
  <div class="pw-chat-dropzone" aria-hidden="true">
    Drop images to attach
  </div>
</Show>
```

- [ ] **Step 3: Add CSS:**

```css
.pw-chat-dropzone {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--pw-accent-line);
  border-radius: inherit;
  background: var(--pw-accent-08);
  color: var(--pw-text-hi);
  font: 600 14px/1 var(--pw-font);
  pointer-events: none;
}
```

- [ ] **Step 4: Build + typecheck**

Run: `pnpm turbo build typecheck --filter=@aidx/widget`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/chat-shell.tsx packages/widget/src/styles.css
git commit -m "feat(widget): drag-and-drop image attachment"
```

---

## Task 7: widget — clipboard paste

**Files:**

- Modify: `packages/widget/src/chat-shell.tsx`

- [ ] **Step 1: Add a paste handler:**

```ts
const onPaste = (e: ClipboardEvent) => {
  if (imageInput() === false) return
  const images = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
  if (images.length === 0) return
  e.preventDefault()
  for (const f of images) attachments.add(f)
}
```

- [ ] **Step 2: Wire to the textarea** — add `onPaste={onPaste}` to `<textarea class="pw-chat-input">`.

- [ ] **Step 3: Build + typecheck**

Run: `pnpm turbo build typecheck --filter=@aidx/widget`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/widget/src/chat-shell.tsx
git commit -m "feat(widget): paste image from clipboard into composer"
```

---

## Task 8: widget — render inbound image parts in the thread

**Files:**

- Modify: `packages/widget/src/chat-shell.tsx`
- Modify: `packages/widget/src/styles.css`

`MessagePart` from `@tanstack/ai-client` includes `ImagePart` (`{type:'image', source: {type:'data', value, mimeType} | {type:'url', value, mimeType?}}`) — verified — so the branch narrows with no cast.

- [ ] **Step 1: Add an `image` branch to `PartView`** (before the `tool-call`/`tool-result` branches):

```tsx
if (part.type === 'image') {
  const src =
    part.source.type === 'url' ? part.source.value : `data:${part.source.mimeType};base64,${part.source.value}`
  return <img class="pw-chat-img" src={src} alt="Attached image" />
}
```

- [ ] **Step 2: Add CSS:**

```css
.pw-chat-img {
  max-width: 220px;
  max-height: 220px;
  border-radius: var(--pw-r-md);
  border: 1px solid var(--pw-line);
  display: block;
  margin: 4px 0;
}
```

- [ ] **Step 3: Build + typecheck**

Run: `pnpm turbo build typecheck --filter=@aidx/widget`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/widget/src/chat-shell.tsx packages/widget/src/styles.css
git commit -m "feat(widget): render image content parts in the chat thread"
```

---

## Task 9: widget — real-browser IT for the image flows

**Files:**

- Modify: `packages/widget/test/widget.it.test.ts`

- [ ] **Step 1: Update the `/api/chat/session` fixture** in the test server to include the `images` block:

```ts
images: {input: 'fileRef', maxCount: 5, maxBytes: 5 * 1024 * 1024, accept: ['image/png', 'image/jpeg', 'image/webp', 'image/gif']},
```

- [ ] **Step 2: Write the failing test** — open the panel, set a file on the hidden input, assert a thumbnail renders and removes. Mirror the file's existing open-panel selectors:

```ts
it('shows the upload button and a thumbnail after selecting an image', async () => {
  const page = await browser.newPage()
  await page.goto(base)
  await page.click('[aria-label="Open aidx chat"]')
  await page.waitForSelector('.pw-chat-attach')
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  )
  await page.setInputFiles('.pw-chat-file', {name: 'p.png', mimeType: 'image/png', buffer: png})
  await page.waitForSelector('.pw-chat-thumb img')
  expect(await page.locator('.pw-chat-thumb').count()).toBe(1)
  await page.click('.pw-chat-thumb-x')
  expect(await page.locator('.pw-chat-thumb').count()).toBe(0)
  await page.close()
})
```

- [ ] **Step 3: Build the bundle, then run the IT**

Run: `cd packages/widget && pnpm build && pnpm vitest run test/widget.it.test.ts -t "upload button"`
Expected: PASS (rebuild required — the IT loads `dist/aidx-widget.global.js`).

- [ ] **Step 4: Commit**

```bash
git add packages/widget/test/widget.it.test.ts
git commit -m "test(widget): browser IT for image upload + thumbnail removal"
```

---

## Task 10: full verification sweep

- [ ] **Step 1: Whole-repo typecheck** — `pnpm turbo typecheck` → PASS.
- [ ] **Step 2: Whole-repo build** — `pnpm turbo build` → PASS.
- [ ] **Step 3: Whole-repo tests** — `pnpm turbo test` → PASS.
- [ ] **Step 4: Lint + format** — `pnpm turbo lint && pnpm format:check` → PASS.
- [ ] **Step 5: Manual smoke (real claude harness, end-to-end)** — open the widget, paste a screenshot, send "what's in this image?", confirm the agent describes it (claude reads the `@<path>` written under cwd). Confirm a `.aidx-img-*.png` is written and cleaned up as expected.
- [ ] **Step 6: Commit any lint/format fixes**

```bash
git add -A && git commit -m "chore: lint + format for chat image input"
```

---

## Self-review notes

- **Spec coverage of remaining work:** configurable limits (T1), capability surfacing (T2), validation (T3), attachment store (T4), upload button + multiple + submit (T5), drag-drop (T6), paste (T7), render inbound (T8), browser IT (T9). Server-side (extraction, delivery, schema) shipped in the merge and is ticked off at the top.
- **No open unknowns:** `sendMessage({content})` shape verified against `MultimodalContent`; `ImagePart` in `MessagePart` verified; claude `fileRef` `@path` delivery verified in `args.ts`; `imageInput` capability value (`'fileRef'`) verified in `claude/index.ts`.
- **Type consistency:** `ImageLimits {maxCount, maxBytes, accept}` identical across config/session/widget. The widget `ImagePart` (`{type:'image', source:{type:'data', value, mimeType}}`) matches `ChatContentPartSchema` + `modelContent`'s read exactly. `imageInput` union identical everywhere.
- **Server-side limit validation** is intentionally NOT added — the merged server does not validate, the widget enforces, and `imageInput===false` already drops images server-side. If defense-in-depth is wanted later, add a guard in `text-adapter.ts` `lastUserImages`; out of scope here.
- **No jsdom:** widget behavior tested in a real browser (T9); only pure logic (T3) uses plain vitest.

```

```
