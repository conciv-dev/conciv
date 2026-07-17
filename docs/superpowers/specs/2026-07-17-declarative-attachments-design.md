# Declarative Attachments — Design

Date: 2026-07-17
Status: Approved (design), pending implementation plan

## Problem

The composer can attach images and plain-text files today. We want a **general attachment
system** where:

1. An attachment renders as its real self — both in the composer (before send) and in the chat
   transcript (after send). A recording shows a replayable player, not a grey text chip.
2. New attachment **types** are extensible. The recorder introduces a `recording` type; later the
   existing **grab** reference becomes just another attachment type.
3. The client stays **dumb**: it only knows how to *display* a type. The **backend** owns what an
   attachment *means* to the model — how it is transformed into something the harness can read
   (text, split into keyframe images, whatever the type needs). An extension that adds a type ships
   that transform itself.

## Guiding precedent

The harness adapter **already does this for images.** `claudeChatConfig.prepareMessages` →
`withImageRefs` (`packages/harness/src/claude/chat.ts`) rewrites an image part into the file-ref
Claude Code ingests. This design generalizes "images only, hard-coded" into "any type, including
extension-defined," and moves the *meaning* step to a place extensions can plug into.

## Vocabulary (three pieces)

An attachment on the wire is `{type, ref, display}`:

- `type` — the type tag (`image`, `recording`, `grab`, …).
- `ref` — the type's own payload. `recordingId` for a recording, the grabbed content for a grab,
  the image bytes for an image. The client never interprets `ref`.
- `display` — small human-facing hints for the card (poster text, `"3 actions · 42s"`).

Each type is defined with **two faces split across the client/server modules — exactly like a
tool** (`__render` lives client-side, `.server(execute)` lives server-side, matched by name):

- **Display** — client component that renders `ref` as a card, used in *both* the composer and the
  thread. Recorder's Display = the rrweb player. Dumb about meaning, smart about rendering.
- **Expand** — backend function that turns `{type, ref}` into the **standard** parts the harness
  already understands (`text`, `image`). Runs **in the extension's server context**, so the
  recorder's Expand can reach the ring/renderer and split a recording into keyframe images + an
  action-log text.

**Expand runs once, at send**, while the source is still fresh — not per-turn. This is the load-
bearing decision: it is the only version that survives the recording's events aging out of the
~10-minute ring, and it keeps the harness adapter dumb.

## Data model

After Expand at send, the user turn's `parts` array looks like:

```
[
  {type:'text', content:'why did this break?'},                              // human + model
  {type:'attachment', attachmentType:'recording', ref:{recordingId:'a1'},
     display:{poster:'Screen recording · 12 actions · 42s'}},               // card only
  {type:'text', content:'Recorded actions: clicked Save…', metadata:{modelOnly:true}},  // model only
  {type:'image', source:{type:'data', mimeType:'image/png', value:'…'},
     metadata:{modelOnly:true}},                                            // model only (keyframe)
  {type:'image', source:{…}, metadata:{modelOnly:true}},
]
```

Why this shape needs **almost nothing** downstream:

- **Harness / model view**: `modelContent` (`session.ts`) already keeps only `text` + `image` and
  drops everything else, and the adapter's `lastUserModelText` / `lastUserImages` do the same. So
  the `attachment` descriptor part is invisible to the model **with zero adapter changes**, and the
  expanded `text` + `image` parts flow through the existing path (keyframe images even ride the
  existing image→file-ref transform for free).
- **Client / thread view**: renders `attachment` parts via the type's Display, renders `text` parts
  **except** those marked `metadata.modelOnly`. One filter, one place.

### The one core seam: store the rich parts, send the stripped ones

Today `makeSend` builds `messages = toModelMessages(...)` (already model-shaped) and `startRun`
stores `addUserMessage(messages[last].content)` — so the rich parts are gone before storage. Fix:
`startRun` stores the **pre-conversion** user parts (the rich array above) and hands the harness the
**post-conversion** messages. `toModelMessages` naturally drops the `attachment` descriptor and
`modelOnly` marking is irrelevant to it, so the same rich array is the single source: raw → storage,
converted → harness. ~a few lines threading `userParts` onto the run request.

### Persistence across reload / restart

The rich parts are stored in `runMessages`, then folded into `imageHistory` for durability. Extend
the fold predicate `hasImagePart` → `hasRichPart` (covers `image` **and** `attachment` parts) so the
turn survives restart. On replay the card redraws and the model view is intact — no re-Expand, no
dependence on the ring. (Compaction still clears this, same as images today — accepted.)

## Flow, end to end

1. **Compose** — attach → a pending `{type, ref}` shows above the composer via its Display card.
   File drops resolve `type` by `accept` (image); programmatic attaches (recorder "Send to agent")
   hand a typed attachment directly.
2. **Send** — backend walks the user parts; for each `attachment` whose `type` has a registered
   Expand, it runs Expand (in that extension's server context) and appends the expanded
   `text`/`image` parts (marked `modelOnly`), keeping the descriptor for the card. Built-in `image`
   needs no Expand — it is already a standard part.
3. **Thread** — client shows the user's text + the card; `modelOnly` parts are hidden.
4. **Harness** — adapter sees only `text` + `image`. Unchanged. Recorder keyframes become
   file-refs via the existing image path.
5. **Reload / restart** — replay from history; card + model view both survive.

## Extension API

```ts
export const recorder = defineExtension({
  name: 'recorder',
  attachments: [
    defineAttachment({
      type: 'recording',
      accept: 'application/x-conciv-recorder',       // optional; for file-based types
      Display: RecordingCard,                          // client: composer + thread card
    }),
  ],
  // …tools, views, Surface
})
  .client(() => ({ value: { store: createRecorderStore() } }))
  .server((server) => ({
    context: { recorder: runtime },
    router: makeRecorderRouter(runtime),
    // Expand runs with the same ctx tools get: (attachment, ctx, request)
    expandAttachment: async ({ type, ref }, ctx) => {
      if (type !== 'recording') return null
      const { log, keyframes } = await renderRecording(ctx.recorder, ref.recordingId)
      return [
        { type: 'text', content: log },
        ...keyframes.map((png) => ({ type: 'image', source: { type: 'data', mimeType: 'image/png', value: png } })),
      ]
    },
  }))
```

- Client side: `collectAttachmentKinds(instances)` (mirrors `collectToolRenderers`) → registry
  keyed by `type` → composer & thread dispatch `ref` to the matching Display, generic file-tile
  fallback for unknown types. Cards mount under `HostApiProvider(clientValue)` so they can use
  `useApiBase`/rpc (fetch recording events by id), same as `MountedView`.
- Server side: core collects `expandAttachment` from each extension's server result and calls the
  owner at send with that extension's context. Display (client) is declared via `attachments:
  [defineAttachment(...)]`; Expand (server) comes from the `.server()` result, matched to the type
  by name — the split is deliberate and mirrors a tool's `__render` vs `.server(execute)`.
- `host.attach` generalizes from `attach(file: File)` to `attach(File | TypedAttachment)` so the
  recorder can hand `{type:'recording', ref:{recordingId}, display}` instead of a fake `.txt` file.

## Types & schema home

- `Attachment` / `AttachmentAdapter` / status types move from `ui-kit-chat` to
  `@conciv/protocol/attachment-types` (protocol already deps `@tanstack/ai-client`); `ui-kit-chat`
  re-exports and keeps the composer implementations. Avoids a `ui-kit-chat` ↔ `extension` dep.
- Wire validation (`ChatContentPartSchema` in protocol + the `content` union in
  `packages/contract`) gains an `attachment` variant `{type:'attachment', attachmentType, ref,
  display}` and allows `metadata.modelOnly` on `text`/`image`. Size caps preserved; `ref` bounded.

## Recorder as first consumer

- Panel "Send to agent" stops building a `.txt` File. It saves the current window as a recording
  (id) and calls `host.attach({type:'recording', ref:{recordingId}, display:{poster}})`.
- Recorder gains `recordings.save` (freeze window → id, persisted like whiteboard state under
  `.conciv/recorder/recordings/<id>.json`, pruned to the newest 50) and `recordings.get(id)` (events, or `expired`). Both the Display card (client fetch by
  id → mount player) and Expand (server fetch by id → keyframes) read through it.
- The player mount + CSS + skip-idle logic in `panel-view.tsx` extracts to a shared module reused by
  the thread card.
- Distill cleanup rides along: drop `id === -1` entries (the widget itself — kills noise and the
  record-itself recursion) and empty typed `""` entries.

## Grab migration (follow-up, not this cut)

Grab becomes an attachment type: `ref` = grabbed content, Display = the existing reference chip,
Expand = return the grabbed text. The composer's grab action creates a `grab` attachment instead of
using the separate `grabStore` + `composeUserContent` prefix. The abstraction is built general
enough now that grab slots in with no rework; the actual migration is a separate plan.

## Error handling

- Expand fails at send → the turn still sends with the descriptor + a short fallback text
  (`"[recording could not be processed]"`); never blocks the message.
- Display card fetch fails / recording expired → card shows an error/expired state with retry, not a
  broken player (recorder panel already has these states to reuse).
- Unknown `type` in the thread (extension uninstalled) → generic file chip from `display`.

## Testing

- Protocol: schema accepts `attachment` part + `modelOnly` metadata; rejects oversized `ref`.
- Core: `makeSend` stores rich parts while the harness receives stripped `text`+`image`; Expand
  invoked with the owning extension's context; fold predicate persists `attachment` parts across
  restart. Real send path, no mocks.
- Recorder (real browser IT): attach → card in composer → send → card in thread → reload → card
  survives; Expand produces keyframes + log; expired recording renders expired state.
- ui-kit-chat: composer + thread dispatch to a registered Display; generic fallback for unknown
  type. Real browser (Playwright), per repo rule.

## Out of scope

- Grab migration (separate plan).
- Per-type Expand *timing* choices — it is always once-at-send.
- Non-image model modalities (audio/video to the model) — Expand may only emit `text`/`image` for
  now.

## Decisions locked

- Client dumb; backend owns meaning via **Expand**; Expand runs **once at send** in the extension's
  server context.
- Single rich parts array; harness-invisibility of the descriptor comes free from existing
  `modelContent` filtering; only new core seam is store-rich / send-stripped in `startRun`.
- Keyframes are standard `image` parts so they reuse the existing image→file-ref adapter path.
