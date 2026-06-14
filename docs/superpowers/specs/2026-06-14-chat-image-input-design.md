# Chat Image Input — Design Spec

Date: 2026-06-14
Status: Approved for planning

## Summary

Add image input to the aidx chat composer: drag-and-drop, clipboard paste, an
upload button, and multiple images per message. The whole feature is gated on a
per-harness capability — a harness that cannot ingest images shows none of the
new UI, and the composer behaves exactly as it does today.

TanStack AI already carries image content end to end (`sendMessage({content:
[...]})` → AG-UI `RunAgentInput` body → typed `ContentPart[]` on the server). The
work is: a composer attachment layer, a per-harness capability, surfacing that
capability to the widget, parsing the inbound body with TanStack's own parser,
and delivering images to the agent CLI by one of two mechanisms.

## Goals

- Drag-and-drop image upload onto the chat panel.
- Paste images from the clipboard into the composer.
- An upload (paperclip) button in the composer.
- Multiple images per message.
- Entirely capability-gated: per-harness, with graceful absence.
- Configurable limits (count, size, accepted types) with sane defaults.

## Non-goals

- Non-image attachments (PDF, audio, video). The adapter is shaped to extend
  later, but v1 ships images only.
- Re-rendering user-sent image thumbnails on history hydration beyond whatever
  `harness.history.parse` already yields.
- Image generation / output. This is inbound (user → agent) only.

## Architecture overview

```
composer (SolidJS)                core /api/chat                 harness CLI
─────────────────                 ──────────────                 ───────────
paperclip / drop / paste
   │ adapter.add(file)            POST RunAgentInput
   ▼  (validate, preview)            │
PendingImage[]  ──── submit ───▶  raw = await readBody(event)
   │ adapter.send → ContentPart   params = chatParamsFromRequestBody(raw)
   │ {type:image,source:data}     sessionId = forwardedProps.sessionId
   ▼                              text   = lastUserText(params.messages)
chat.sendMessage({content})       images = lastUserImages(params.messages)
                                     │
                                     ├─ imageInput:'native'  → stream-json stdin
                                     ├─ imageInput:'fileRef' → temp files + path refs
                                     └─ imageInput:false      → (UI hidden; unreachable)
```

The client is uniform — it always emits TanStack `image` parts with a base64
data source. The native-vs-fileRef split is purely a server concern, driven by
the harness capability.

## Contract layer

### Per-harness capability

`packages/protocol/src/harness-types.ts` — extend `HarnessCapabilities`:

```ts
export type HarnessCapabilities = {
  resume: boolean
  permissionGate: 'hook' | 'none'
  transcriptHistory: boolean
  systemPrompt: 'file' | 'flag' | 'none'
  imageInput: 'native' | 'fileRef' | false
}
```

- `native` — the harness ingests image content blocks directly. Claude does, via
  `--input-format stream-json` on stdin.
- `fileRef` — no native vision input channel; the server writes the images to
  temp files and appends path references to the prompt, and the agent reads them
  with its own Read tool.
- `false` — no image support; the widget renders none of the upload affordances.

Per-adapter declarations (`packages/harness/src/*/index.ts`):

| Harness   | imageInput  | Rationale |
|-----------|-------------|-----------|
| claude    | `'native'`  | `--input-format stream-json` accepts base64 image blocks |
| codex     | `'fileRef'` | reads image files by path (verify during impl; else `false`) |
| gemini-cli| `false`     | until verified |
| opencode  | `false`     | until verified |
| pi        | `false`     | until verified |

Default any unverified harness to `false`. Promoting one is a one-line change
plus its delivery path.

### Configurable limits

`packages/protocol/src/config-types.ts` — extend `AidxConfig`:

```ts
export interface AidxConfig {
  // …existing…
  chat?: {
    images?: {
      maxCount?: number   // default 5
      maxBytes?: number   // default 5 * 1024 * 1024
      accept?: string[]   // default ['image/png','image/jpeg','image/webp','image/gif']
    }
  }
}
```

Defaults live as exported constants in protocol (single source of truth, reused
by client validation, server re-validation, and tests):

```ts
export const IMAGE_DEFAULTS = {
  maxCount: 5,
  maxBytes: 5 * 1024 * 1024,
  accept: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
} as const
```

`@aidx/core/config` resolves `config.chat.images` over `IMAGE_DEFAULTS`.

### Surfacing capability + limits to the widget

Extend the `GET /api/chat/session` response (`chat-types.ts` `ChatSessionSchema`,
`api/chat/session.ts`):

```ts
images: {
  input: 'native' | 'fileRef' | false,   // from harness.capabilities.imageInput
  maxCount: number,
  maxBytes: number,
  accept: string[],
}
```

The widget already fetches `/api/chat/session` on panel open (`hydrate`). The
composer reads `session.images` to decide what to render and how to validate. If
`input === false`, no upload UI mounts and the composer is unchanged.

## Widget — composer + attachment adapter

Modeled on assistant-ui's `AttachmentAdapter` lifecycle (`add` → `send` →
`remove`), adapted to SolidJS + TanStack (we adopt the pattern, not the library).

### Adapter — `packages/widget/src/attachments.ts`

```ts
type PendingImage = {
  id: string
  file: File
  name: string
  mimeType: string
  bytes: number
  previewUrl: string          // object URL, revoked on remove/clear
  status: 'ready' | 'error'
  error?: string
}

type ImageAttachmentAdapter = {
  accept: string[]                                   // session.images.accept
  add(file: File): PendingImage                      // validate type/size/count → preview
  send(p: PendingImage): Promise<ContentPart>        // base64-encode → TanStack image part
  remove(id: string): void                           // revoke object URL, drop from store
}
```

- The adapter is created only when `session.images.input !== false` (mirrors
  assistant-ui: adapter present → paperclip shows).
- `add` validates against `accept`, `maxBytes`, and the current count vs
  `maxCount`. On failure it returns a `PendingImage{status:'error', error}` so the
  composer can show an inline error chip; it is not added to the send set.
- `send` reads the file as base64 (`FileReader.readAsDataURL`, strip the
  `data:…;base64,` prefix) and returns:
  `{ type: 'image', source: { type: 'data', value: base64, mimeType } }`.
- Object URLs power previews cheaply; base64 is produced only at send time.

A small SolidJS store (`createImageAttachments(session.images)`) holds the
`PendingImage[]` signal and exposes `add` / `remove` / `clear` / `sendAll`.

### Composer changes — `packages/widget/src/chat-shell.tsx`

Gated behind `images.input !== false`:

- **Upload button:** a paperclip button next to send; clicks a hidden
  `<input type="file" accept={accept.join(',')} multiple={maxCount>1}>`; each
  selected file → `adapter.add`.
- **Drag-and-drop:** `dragover` / `dragleave` / `drop` handlers on the panel
  (`pw-chat-panel`), with a drop-zone visual state on dragover. On drop, filter
  `dataTransfer.files` to accepted image types → `adapter.add` each.
- **Paste:** `onPaste` on the textarea reads `clipboardData.items` / `.files`,
  filters to images → `adapter.add` each. (Screenshot paste is the primary use.)
- **Thumbnail strip:** above the textarea, a row of previews (`previewUrl`), each
  with a remove (✕) button → `adapter.remove(id)`. Error entries render as a
  dismissible inline chip with the reason.
- **Submit:** if pending images exist:
  `const parts = [textPart, ...await store.sendAll()]` then
  `chat.sendMessage({ content: parts })`, then `store.clear()`. Sending is allowed
  with images and empty text. The existing text-only path
  (`chat.sendMessage(text)`) stays for the no-image case.

### sessionId (no client wiring)

Pre-flight verification (2026-06-14) showed the widget never originated a
`sessionId`: today's composer calls `createChatClientOptions({connection})` only,
and resume is driven entirely server-side by `state.sessionId` (seeded from
`initialSessionId`, updated via `onSessionId`). So switching the server to
`chatParamsFromRequestBody` — which drops unknown top-level fields — loses
nothing, and the client needs no `forwardedProps` change. `useChat` stays as is.

(`@tanstack/ai-solid@0.13.4` applies `forwardedProps` via a one-shot
`updateOptions` read, so a function value would not track a signal anyway — another
reason to skip it.)

### Accessibility

- Paperclip button: `aria-label="Attach image"`; included in the existing focus
  trap (`focusablesIn` already selects `button`/`input`).
- Thumbnail remove buttons: `aria-label="Remove <name>"`.
- Drop-zone state announced via an `aria-live` hint; error chips use
  `role="alert"` (consistent with the existing `pw-chat-error`).

## Server — parse, extract, deliver

### Inbound parsing — switch to `chatParamsFromRequestBody`

`@tanstack/ai@0.28.0` exports `chatParamsFromRequestBody`. Use it as a pure
parser (we do not call TanStack `chat()` — `/api/chat` bridges to a CLI and
decodes stdout to `StreamChunk`):

`packages/core/src/api/chat/turn.ts`, in `POST /api/chat`:

```ts
const raw = await readBody(event)
let params
try {
  params = await chatParamsFromRequestBody(raw)   // throws on non-AG-UI body
} catch {
  throw new HTTPError({status: 400, message: 'bad chat request'})
}
const fwdSessionId =
  typeof params.forwardedProps.sessionId === 'string' ? params.forwardedProps.sessionId : ''
const resumeSessionId = harness.capabilities.resume
  ? fwdSessionId || state.sessionId || null
  : null
const userText = lastUserText(params.messages)
const userImages = lastUserImages(params.messages)
```

Benefits over the prior hand-parse: typed `ContentPart[]` (ImagePart parsed for
us), and AG-UI fan-out dedup + role normalization handled internally.

`ChatRequestSchema` is only consumed by the turn route; it is removed there.
Keep or delete the schema in `chat-types.ts` per remaining references (expect
deletion).

### Extraction — `packages/core/src/api/chat/messages.ts`

`lastUserText` is rewritten against the typed messages (content may be a string
or `ContentPart[]`). Add:

```ts
export type InboundImage = { value: string; mimeType: string }

// Image parts of the latest user message: {type:'image', source:{type:'data', value, mimeType}}.
// URL-source images (no base64) are out of scope for v1 and skipped.
export function lastUserImages(messages: ModelMessage[] | UIMessage[]): InboundImage[]
```

### Server-side validation (defense in depth)

Re-check the extracted images against resolved limits before delivery:

- count ≤ `maxCount`
- each decoded byte length ≤ `maxBytes`
- `mimeType` ∈ `accept`

On breach → `HTTPError 400`. The client already blocks these; this guards
direct/malformed posts.

### Delivery — branch on `harness.capabilities.imageInput`

The turn route chooses delivery by capability. `false` is unreachable here (UI
hidden), but is handled by ignoring images.

**`native` (Claude):**

- `buildArgs` keeps `-p` (`--print` — required for `--input-format`) but drops
  the positional prompt, and adds `--input-format stream-json` (alongside the
  existing `--output-format stream-json`). The prompt arrives via stdin.
- The turn writes one stream-json user message to `child.stdin`, then closes it:
  ```json
  {"type":"user","message":{"role":"user","content":[
    {"type":"text","text":"<prompt>"},
    {"type":"image","source":{"type":"base64","media_type":"image/png","data":"<base64>"}}
  ]}}
  ```
  VERIFIED against claude 2.1.177 (2026-06-14): text round-trips and a red-pixel
  PNG returns "Red." `--input-format stream-json` works only with `-p`.
- `SpawnHarness` / `HarnessChild` must expose `stdin` (a `Writable`). Today the
  type is `{pid, stdout, stderr, kill}` — add `stdin`. The spawn helper already
  has it from `child_process`; it is just not surfaced.
- When there are no images, the native path may still use stdin uniformly, or
  retain `-p` — decided in the plan; either keeps text-only behavior identical.

**`fileRef`:**

- Write each image to `<stateRoot>/uploads/<turnId>/<n>.<ext>` (ext from
  mimeType). `turnId` is a fresh id per turn.
- Append to the prompt text, one line per image:
  `\n\n[Attached image: <absolute path>]`
- Keep the current `-p <prompt>` argv path unchanged otherwise.
- Cleanup: remove the turn's upload dir when the turn's merged stream finishes
  (extend `withLockRelease`'s `finally`), best-effort.

**no images:** today's exact path (text via `-p`, or via the native stdin
envelope with a text-only content array).

### History / hydration

- `fileRef`: the agent's Read of the file appears in its transcript; hydration
  renders whatever `harness.history.parse` yields. No extra work.
- `native`: images live in the harness transcript in its own format; hydration
  renders whatever `parse` yields. v1 does not add bespoke thumbnail
  reconstruction.
- Rendering inbound image parts already on screen (the message the user just
  sent) uses TanStack's documented shape:
  `src = source.type==='url' ? source.value : data:${mimeType};base64,${value}`.
  Add an `image` branch to `PartView` in `chat-shell.tsx`.

## Components and boundaries

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `harness-types.ts` | `imageInput` capability in the contract | — |
| `config-types.ts` | `chat.images` config + `IMAGE_DEFAULTS` | — |
| each `harness/*/index.ts` | declare `imageInput` per adapter | harness-types |
| `core/config.ts` | resolve limits over defaults | config-types |
| `api/chat/session.ts` | expose `images` block in session response | config, harness |
| `widget/attachments.ts` | validate / preview / encode images (adapter) | session.images, TanStack types |
| `widget/chat-shell.tsx` | composer UI: button, dnd, paste, strip, submit, render | attachments, useChat |
| `api/chat/messages.ts` | `lastUserText` + `lastUserImages` over typed parts | TanStack message types |
| `api/chat/turn.ts` | parse (TanStack), validate, branch delivery | messages, harness caps, spawn |
| native delivery | stream-json stdin envelope | claude args, child.stdin |
| fileRef delivery | temp files + prompt path refs | fs, stateRoot |

## Error handling

- Client rejects (type/size/count): inline error chip, file not added. Never
  silently dropped.
- `chatParamsFromRequestBody` throw → 400.
- Server limit breach → 400.
- `fileRef` temp-write failure → fail the turn with a clear error (do not send a
  prompt referencing a path that does not exist).
- `native` stdin write failure → propagate as a turn error; lock released by the
  existing `finally`.
- Object URLs revoked on remove/clear and on panel close to avoid leaks.

## Testing

Per project rules: real-browser tests via Playwright, no jsdom; build/typecheck
via turbo.

- **Protocol/unit:** `lastUserImages` extraction; limit resolution over defaults;
  capability typing (a `native` harness compiles, `false` hides UI).
- **Server:** `chatParamsFromRequestBody` integration — a body with image parts
  yields text + images; oversize/wrong-type → 400; `fileRef` writes files and
  appends path refs; `native` writes the stdin envelope.
- **Widget (Playwright):** paperclip opens picker and adds a thumbnail; paste a
  clipboard image adds a thumbnail; drag-drop adds a thumbnail; remove clears it;
  reject oversize shows an error chip; submit with image sends an `image`
  ContentPart; with `input:false` no upload UI renders.
- **Cross-harness:** a `false` harness session response hides the UI; a `native`
  harness round-trips an image (gated to environments where the CLI is present).

## Open items resolved

- Delivery mechanism: **hybrid** — `native` for Claude, `fileRef` fallback,
  `false` hides UI. (Per-harness capability.)
- Limits: **configurable** via `chat.images` over `IMAGE_DEFAULTS`.
- Inbound parse: **`chatParamsFromRequestBody`** (pure parser; not `chat()`).
- sessionId: **no client wiring** — the widget never sent it; the server uses
  `state.sessionId`. `ChatRequestSchema` in the turn route is removed.

## Rollout

Additive and capability-gated. With every harness defaulting `imageInput:false`
except those explicitly promoted, shipping the code changes nothing visible until
a harness is verified and flipped. No migration, no flag.
