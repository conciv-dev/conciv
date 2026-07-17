# Declarative Attachments — Design

Date: 2026-07-17
Status: Approved (design), pending implementation plan

## Problem

The composer attaches images and plain-text files today. We want a **general attachment system**
where:

1. An attachment renders as its real self in the composer (before send) **and** in the transcript
   (after send). A recording shows a replayable player, not a grey file chip.
2. New attachment **types** are extensible; the recorder adds `recording`, and later **grab**
   becomes just another type.
3. The client stays **dumb** — it only *displays* a type. The **backend** owns what an attachment
   *means* to the model: how it transforms into something the harness reads (text, keyframe images,
   whatever). An extension that adds a type ships that transform.

## What already exists (reuse, do not reinvent)

This design is mostly **wiring existing pieces together**. Verified in the codebase:

| Capability | Where it lives today |
| --- | --- |
| Composer attachment lifecycle `add/remove/send` → content parts | `AttachmentAdapter`, `composeAttachmentAdapters`, `createTextAttachmentAdapter` (`ui-kit-chat/.../attachment-adapter.ts`) |
| Attach a File to the composer from an extension | `host.attach(file: File)` + pane queue (`chat-pane.tsx`) — **unchanged** |
| Thread renders `document`/`image` attachment parts via slot components | `Message.Attachments` + `attachmentComponent(part.type)` (`primitives/message/message.tsx`); `useMessagePartFile()` for document parts |
| Composer renders pending attachments via one component | `Composer.Attachments component={RemovableAttachment}` → `AttachmentUI` (`styled/composer.tsx`, `styled/attachment-ui.tsx`) |
| Collect per-extension client renderers | `collectToolRenderers(instances)` (`extension/collect-client.ts`) |
| Close each extension's server context over its callables at mount | `buildExtensionTools(extension, context)` (`core/app.ts`) |
| Transform a part into harness-native form before send | `prepareMessages` → `withImageRefs` (`harness/claude/chat.ts`) — **unchanged**; keyframes ride it |
| Model view already ignores non-`text`/`image` parts | `modelContent` (`core/chat/session.ts`), `lastUserModelText`/`lastUserImages` (`harness/_shared/text-adapter.ts`) |
| Durable user-message parts across restart | `foldRunMessagesIntoImageHistory` / `imageHistoryFor` (`db/run-queries.ts`) |
| Recorder ring / keyframe renderer / distill | `server/ring.ts`, `server/render.ts`, `server/distill.ts` |

**A recording attachment is a `document` part** — `{type:'document', source:{type:'data',
mimeType:'application/x-conciv-recorder', value: base64(JSON{recordingId, poster})}}`. No new part
type. It rides the `document` slot that already exists.

## The only two genuinely new pieces

### 1. Client (small): dispatch the attachment card by mime

Today both render sites use **one** component (`AttachmentUI`) for every attachment. The one change:
pick the component by the attachment's type/mime, so a `recording` draws the player and everything
else falls back to the existing file tile.

- New `collectAttachmentCards(instances)` mirrors `collectToolRenderers` → `{mime → Card}` gathered
  from installed extensions.
- Composer: `RemovableAttachment` dispatches on the pending attachment's `contentType` → matching
  Card, else `AttachmentUI`.
- Thread: widget's `UserTurn` gains `<Message.Attachments components={{Document: DispatchByMime,
  Image: AttachmentUI}}>`; `DispatchByMime` picks the Card by `part.source.mimeType`, else the file
  tile. (Currently `UserTurn` renders only `<Message.Parts/>`, so document parts render nothing —
  this is the gap.)
- Cards mount under `HostApiProvider(clientValue)` (like `MountedView`) so a card can `useApiBase`
  /rpc to fetch its own heavy data (recording events by id).

The recorder's per-mime adapter is **derived by the framework** from the registered mime (accept =
mime, `send()` = wrap the File bytes into the `document` part). The extension supplies only the Card
and the Expand — no hand-written adapter.

### 2. Backend (the real seam): Expand at send

Every attachment type may register **Expand**: given the sent `document` part, produce the standard
`text`/`image` parts the harness reads. Runs **once, at send**, in the extension's server context —
so the recorder's Expand reaches the ring/renderer and splits the recording into keyframe images +
an action-log text. **Once-at-send** is load-bearing: the ring only holds ~10 minutes, and re-
rendering keyframes every turn is expensive.

- `buildAttachmentExpanders(extension, context)` in `app.ts` mirrors `buildExtensionTools`:
  closes the extension's server context over its Expand fns → `{mime → expand(part) }`. Passed into
  `chatDeps` so `makeSend` can call it.
- `makeSend` (`core/chat/run.ts`) — right where `composeUserContent` already massages user content —
  walks the user parts; for each `document` part whose mime has an Expand, runs it and **appends**
  the resulting `text`/`image` parts marked `metadata.modelOnly:true`, keeping the document part for
  the card. Built-in `image` needs no Expand (already standard).

## Data flow (one array, three projections)

After Expand the stored user turn is:

```
[ {type:'text', content:'why did this break?'},                                   // human + model
  {type:'document', source:{…mime:'application/x-conciv-recorder'…}},             // card only
  {type:'text', content:'Recorded actions: clicked Save…', metadata:{modelOnly:true}},  // model only
  {type:'image', source:{…png…}, metadata:{modelOnly:true}},                      // model only (keyframe)
  {type:'image', source:{…png…}, metadata:{modelOnly:true}} ]
```

- **Model** (`toModelMessages`): `modelContent` already drops `document` → model sees text + the
  expanded text + keyframes. Keyframes become file-refs via the untouched `withImageRefs`.
- **Thread**: render `document` via its Card; render `text`/`image` parts **except** `modelOnly`
  ones. One filter in `UserTurn`/`Message.Parts`.

### The store seam

Today `makeSend` builds model-shaped `messages` and `startRun` stores
`addUserMessage(messages[last].content)` — so rich parts vanish before storage. Fix: `startRun`
stores the **pre-Expand-projection rich array**, and hands the harness the `toModelMessages(rich)`
projection. Same array, two projections; ~a few lines threading `userParts` onto the run request.

### Persistence across reload / restart

Rich parts land in `runMessages` → folded into `imageHistory`. Extend the fold predicate
`hasImagePart` → `hasRichPart` (image **or** document part) so the turn survives restart; card and
model view both replay, no re-Expand, no ring dependency. (Compaction still clears this, as with
images today — accepted.)

## Extension API

Mirrors the tool builder (`__render` client-side, `.server(execute)` server-side, split across
modules, matched by name). New `meta.attachments`:

```ts
// shared def
export const recordingAttachment = defineAttachment({ mime: 'application/x-conciv-recorder' })

// client module — the Card
recordingAttachment.card(RecordingCard)              // sets __card

// server module — the Expand, same ctx signature as a tool's execute
recordingAttachment.server((part, ctx) => {          // sets __expand
  const { recordingId } = decode(part)
  const { log, keyframes } = renderRecording(ctx.recorder, recordingId)
  return [ {type:'text', content: log}, ...keyframes.map(pngImagePart) ]
})

defineExtension({ name:'recorder', attachments:[recordingAttachment], /* tools, views, Surface */ })
```

- Client build reads `__card` (via `collectAttachmentCards`); server build reads `__expand` (via
  `buildAttachmentExpanders`). Two faces on split module instances sharing `mime`, exactly like a
  tool.

## Wire schema

- `ChatContentPartSchema` (protocol) + the `content` union in `packages/contract` gain a `document`
  variant `{type:'document', source:{type:'data', mimeType, value}}` and allow `metadata.modelOnly`
  on `text`/`image`. Size caps on `value` preserved (recorder value is a tiny id JSON; keyframes are
  server-produced).
- `Attachment` / `AttachmentAdapter` / status types move from `ui-kit-chat` to
  `@conciv/protocol/attachment-types` (protocol already deps `@tanstack/ai-client`); `ui-kit-chat`
  re-exports, keeps composer implementations. Avoids a `ui-kit-chat` ↔ `extension` dependency.

## Recorder as first consumer

- Panel "Send to agent" stops building a `.txt` File. It saves the current window as a recording and
  attaches a File carrying `{recordingId, poster}` under the recorder mime via the existing
  `host.attach(file)`.
- Recorder gains `recordings.save` (freeze window → id, persisted like whiteboard state under
  `.conciv/recorder/recordings/<id>.json`, pruned to newest 50) and `recordings.get(id)` (events, or
  `expired`). Both the Card (client fetch by id → player) and Expand (server fetch by id →
  keyframes) read through it.
- Player mount + CSS + skip-idle logic in `panel-view.tsx` extracts to a shared module reused by the
  Card.
- Distill cleanup rides along: drop `id === -1` entries (the widget itself — kills noise + the
  record-itself recursion) and empty typed `""` entries.

## Grab migration (follow-up, not this cut)

Grab becomes a `grab` attachment type: the grabbed content in the document value, Card = the existing
reference chip, Expand = return the grabbed text (replacing the `composeUserContent` grab prefix).
Built general enough now that grab slots in with no rework; the migration is its own plan.

## Error handling

- Expand throws at send → turn still sends with the document part + a short fallback text; never
  blocks the message.
- Card fetch fails / recording `expired` → Card shows error/expired + retry (reuse the recorder
  panel's existing states), not a broken player.
- Unknown mime in the thread (extension uninstalled) → generic file tile.

## Testing

- Protocol: schema accepts `document` part + `modelOnly` metadata; rejects oversized `value`.
- Core: `makeSend` stores rich parts while the harness receives the stripped projection; Expand runs
  with the owning extension's context; fold predicate persists document parts across restart. Real
  send path, no mocks.
- Recorder (real-browser IT): attach → player card in composer → send → card in thread → reload →
  survives; Expand yields keyframes + log; expired recording renders the expired state.
- ui-kit-chat (Playwright): composer + thread dispatch to a registered Card by mime; generic tile
  fallback for unknown mime.

## Out of scope

- Grab migration (separate plan).
- Per-type Expand *timing* — always once-at-send.
- Audio/video model modalities — Expand emits only `text`/`image` for now.

## Decisions locked

- A recording is a **`document` part with a namespaced mime** — no new part type.
- Client change is only **dispatch the existing render slot by mime**; `host.attach`,
  `AttachmentAdapter`, `withImageRefs` all unchanged.
- Backend adds **Expand-at-send** (mirrors `buildExtensionTools`) + the **store-rich / send-stripped
  seam** in `startRun`; keyframes are standard `image` parts reusing the image→file-ref path.
