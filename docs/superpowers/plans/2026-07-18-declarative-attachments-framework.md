# Declarative Attachments — Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A generic attachment framework where an extension declares an attachment type (a namespaced document mime) with a client Card and a server Expand, and the transcript renders the Card while the model receives Expand's `text`/`image` parts.

**Architecture:** A sent attachment is a standard `document` part with a namespaced mime — no new part type. The client dispatches the existing attachment render slot by mime to a per-extension Card (mirrors `collectToolRenderers`). The backend, once at send, runs the type's Expand (mirrors `buildExtensionTools`' context closure) to append the `text`/`image` parts the harness reads, marked `modelOnly` so the transcript hides them. `startRun` stores the rich parts and hands the harness the stripped projection.

**Tech Stack:** TypeScript (strict, NodeNext), Solid, zod, `@tanstack/ai`/`ai-client`, oRPC, Vitest (node), Playwright (real-browser widget/ui-kit tests), turbo.

This is **Plan 1 of 2**. Plan 2 (recorder consumer: `recordings.save`/`get`, player Card, recording Expand, distill cleanup) builds on the symbols produced here. This plan proves the framework end-to-end with a **test fixture** attachment type, not the recorder.

## Global Constraints

- Functions, not classes. No IIFEs. Zero code comments in TS/JS (self-explanatory names).
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- TS strict: no `any`/`as`/`@ts-ignore`/non-null `!`; `noUncheckedIndexedAccess`, `verbatimModuleSyntax`.
- No barrel files; import from source. Import from `@conciv/*` subpaths as the package exports them.
- Build/typecheck/test via turbo (`pnpm turbo run …`), never hand-build `dist/`.
- Widget/ui-kit UI tested in a real browser (Playwright), never jsdom. Solid vitest configs pin `test:{environment:'node'}`.
- zod validates every HTTP boundary.
- v0, no back-compat shims — reshape APIs and update all call sites.
- Commit with pathspec: `git commit -m … -- <paths>`. If the `prek` hook aborts on a lock race, run `pnpm format` then `git commit --no-verify -- <paths>`.

---

## File Structure

- `packages/protocol/src/chat-types.ts` — extend `ChatContentPartSchema` with a `document` variant and allow `metadata.modelOnly` on `text`/`image`. (Wire + contract propagate automatically; `packages/contract/src/contract.ts` already references this schema.)
- `packages/extension/src/define-attachment.ts` — **new**: `defineAttachment(def).card(Component).server(expand)` builder (mirrors `define-tool.ts`).
- `packages/extension/src/types.ts` — **new** types `ExtensionAttachment`, `AttachmentExpand`, `AttachmentCardEntry`.
- `packages/extension/src/define-extension.ts` — add `attachments?: readonly AnyAttachmentBuilder[]` to `ExtensionMeta`/`ExtensionBuilder`.
- `packages/extension/src/collect-client.ts` — add `collectAttachmentCards(builders)`.
- `packages/extension/src/index.ts` — export the new symbols.
- `packages/core/src/app.ts` — add `buildAttachmentExpanders(extension, context)`; assemble `attachmentExpanders` into `chatDeps`.
- `packages/core/src/chat/runtime.ts` — add `attachmentExpanders` to `ChatDeps`.
- `packages/core/src/chat/run.ts` — `expandUserParts(...)` in `makeSend`; thread rich parts to `startRun`; store rich via `addUserMessage`.
- `packages/db/src/run-queries.ts` — `hasImagePart` → `hasRichPart` (image **or** document).
- `packages/ui-kit-chat/src/styled/attachment-dispatch.tsx` — **new**: `AttachmentByMime` (composer + thread dispatch to a Card by mime, fallback `AttachmentUI`) and `createDocumentAttachmentAdapter(mime)`.
- `packages/ui-kit-chat/src/index.tsx` — export the two new symbols + `partIsModelOnly`.
- `packages/ui-kit-chat/src/styled/thread.tsx` — `UserTurn` renders `Message.Attachments` and filters `modelOnly` parts.
- `apps/conciv/src/chat/chat-pane.tsx` — build attachment adapters + Card map from `instances`; pass Card map to the thread.
- `packages/extension/test/fixtures/…` + package tests — a fixture attachment type exercised end-to-end.

---

## Task 1: Wire schema — document part + modelOnly metadata

**Files:**
- Modify: `packages/protocol/src/chat-types.ts:15-25`
- Test: `packages/protocol/test/chat-types.test.ts` (create if absent)

**Interfaces:**
- Produces: `ChatContentPartSchema` accepts `{type:'document', source:{type:'data', mimeType, value}}` and `metadata?:{modelOnly?:boolean}` on `text`/`image`/`document`. `contract`'s `content` union inherits it (it already imports `ChatContentPartSchema`).

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {ChatContentPartSchema} from '../src/chat-types.js'

describe('ChatContentPartSchema', () => {
  it('accepts a document part with a namespaced mime', () => {
    const parsed = ChatContentPartSchema.safeParse({
      type: 'document',
      source: {type: 'data', mimeType: 'application/x-conciv-recorder', value: 'eyJpZCI6MX0='},
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts modelOnly metadata on a text part', () => {
    const parsed = ChatContentPartSchema.safeParse({type: 'text', content: 'x', metadata: {modelOnly: true}})
    expect(parsed.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/protocol`
Expected: FAIL — document part rejected by the discriminated union.

- [ ] **Step 3: Implement — extend the schema**

Replace the `ChatContentPartSchema` definition (currently text + image) with:

```ts
const PartMetadata = z.object({modelOnly: z.boolean().optional()}).loose().optional()

const MAX_DOCUMENT_BASE64_LENGTH = 27_962_028

export const ChatContentPartSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('text'), content: z.string(), metadata: PartMetadata}).loose(),
  z
    .object({
      type: z.literal('image'),
      source: z
        .object({type: z.literal('data'), mimeType: z.string().regex(/^image\/[A-Za-z0-9.+-]+$/), value: Base64Image})
        .loose(),
      metadata: PartMetadata,
    })
    .loose(),
  z
    .object({
      type: z.literal('document'),
      source: z
        .object({
          type: z.literal('data'),
          mimeType: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.+-]*\/[A-Za-z0-9.+-]+$/),
          value: z.string().min(1).max(MAX_DOCUMENT_BASE64_LENGTH),
        })
        .loose(),
      metadata: PartMetadata,
    })
    .loose(),
])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm turbo run test --filter=@conciv/protocol`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(protocol): document content part + modelOnly metadata" -- packages/protocol/src/chat-types.ts packages/protocol/test/chat-types.test.ts
```

---

## Task 2: `defineAttachment` builder

**Files:**
- Create: `packages/extension/src/define-attachment.ts`
- Modify: `packages/extension/src/types.ts` (append types)
- Test: `packages/extension/test/define-attachment.test.ts`

**Interfaces:**
- Produces:
  - `type AttachmentExpand = (part: DocumentPart, ctx: unknown) => Promise<ContentPart[]> | ContentPart[]` where `DocumentPart = Extract<ContentPart, {type:'document'}>`.
  - `type ExtensionAttachment = {mime: string; __card?: Component; __expand?: AttachmentExpand}`.
  - `type AttachmentBuilder = ExtensionAttachment & {card(c: Component): AttachmentBuilder; server(e: AttachmentExpand): AttachmentBuilder}`.
  - `type AnyAttachmentBuilder = AttachmentBuilder`.
  - `defineAttachment(def: {mime: string}): AttachmentBuilder`.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {defineAttachment} from '../src/define-attachment.js'

describe('defineAttachment', () => {
  it('records card and expand on the builder, matched by mime', () => {
    const Card = () => null
    const attachment = defineAttachment({mime: 'application/x-test'})
    attachment.card(Card)
    attachment.server((part) => [{type: 'text', content: `expanded:${part.source.mimeType}`}])
    expect(attachment.mime).toBe('application/x-test')
    expect(attachment.__card).toBe(Card)
    expect(attachment.__expand).toBeTypeOf('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/extension`
Expected: FAIL — `define-attachment.js` not found.

- [ ] **Step 3: Implement the types**

Append to `packages/extension/src/types.ts`:

```ts
import type {ContentPart} from '@tanstack/ai'

export type DocumentPart = Extract<ContentPart, {type: 'document'}>
export type AttachmentExpand = (part: DocumentPart, ctx: unknown) => Promise<ContentPart[]> | ContentPart[]
export type ExtensionAttachment = {mime: string; __card?: Component; __expand?: AttachmentExpand}
export type AttachmentCardEntry = {mime: string; render: Component}
```

- [ ] **Step 4: Implement the builder**

Create `packages/extension/src/define-attachment.ts`:

```ts
import type {Component} from 'solid-js'
import type {AttachmentExpand, ExtensionAttachment} from './types.js'

export type AttachmentBuilder = ExtensionAttachment & {
  card: (component: Component) => AttachmentBuilder
  server: (expand: AttachmentExpand) => AttachmentBuilder
}

export type AnyAttachmentBuilder = AttachmentBuilder

export function defineAttachment(def: {mime: string}): AttachmentBuilder {
  const builder: AttachmentBuilder = {
    mime: def.mime,
    card(component) {
      builder.__card = component
      return builder
    },
    server(expand) {
      builder.__expand = expand
      return builder
    },
  }
  return builder
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm turbo run test --filter=@conciv/extension`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(extension): defineAttachment builder (card + server expand)" -- packages/extension/src/define-attachment.ts packages/extension/src/types.ts packages/extension/test/define-attachment.test.ts
```

---

## Task 3: Register `attachments` on the extension + collectors

**Files:**
- Modify: `packages/extension/src/define-extension.ts:18-27,37-44,84-92`
- Modify: `packages/extension/src/collect-client.ts`
- Modify: `packages/extension/src/index.ts`
- Test: `packages/extension/test/collect-attachment-cards.test.ts`

**Interfaces:**
- Consumes: `AnyAttachmentBuilder` (Task 2), the `collectToolRenderers` shape (existing).
- Produces:
  - `ExtensionMeta`/`ExtensionBuilder` gain `attachments?: readonly AnyAttachmentBuilder[]`.
  - `collectAttachmentCards(builders: AnyExtension[]): AttachmentCardEntry[]` — `{mime, render}` per registered card, first-wins on mime.
  - Exports: `defineAttachment`, `collectAttachmentCards`, and types `AttachmentBuilder`, `AnyAttachmentBuilder`, `ExtensionAttachment`, `AttachmentExpand`, `AttachmentCardEntry`, `DocumentPart`.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {defineExtension} from '../src/define-extension.js'
import {defineAttachment} from '../src/define-attachment.js'
import {collectAttachmentCards} from '../src/collect-client.js'

describe('collectAttachmentCards', () => {
  it('gathers registered cards keyed by mime, first-wins', () => {
    const Card = () => null
    const attachment = defineAttachment({mime: 'application/x-test'})
    attachment.card(Card)
    const ext = defineExtension({name: 'demo', attachments: [attachment]})
    const cards = collectAttachmentCards([ext])
    expect(cards).toEqual([{mime: 'application/x-test', render: Card}])
  })

  it('ignores attachments with no card', () => {
    const attachment = defineAttachment({mime: 'application/x-noop'})
    const ext = defineExtension({name: 'demo2', attachments: [attachment]})
    expect(collectAttachmentCards([ext])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/extension`
Expected: FAIL — `attachments` not accepted by `defineExtension` / `collectAttachmentCards` missing.

- [ ] **Step 3: Implement — add `attachments` to the meta and builder**

In `packages/extension/src/define-extension.ts`, import the type and add the field in three places (`ExtensionMeta`, `ExtensionBuilder`, and the returned `builder` object):

```ts
import type {AnyAttachmentBuilder} from './define-attachment.js'
```

Add to `ExtensionMeta<…>` and `ExtensionBuilder<…>` type bodies:

```ts
  attachments?: readonly AnyAttachmentBuilder[]
```

Add to the constructed `builder` object (next to `views: meta.views,`):

```ts
    attachments: meta.attachments,
```

- [ ] **Step 4: Implement the collector**

Append to `packages/extension/src/collect-client.ts`:

```ts
import type {AttachmentCardEntry} from './types.js'

export function collectAttachmentCards(builders: AnyExtension[]): AttachmentCardEntry[] {
  const seen = new Set<string>()
  const entries: AttachmentCardEntry[] = []
  for (const builder of builders)
    for (const attachment of builder.attachments ?? []) {
      if (!attachment.__card || seen.has(attachment.mime)) continue
      seen.add(attachment.mime)
      entries.push({mime: attachment.mime, render: attachment.__card})
    }
  return entries
}
```

- [ ] **Step 5: Export the new symbols**

Add to `packages/extension/src/index.ts`:

```ts
export {defineAttachment} from './define-attachment.js'
export type {AttachmentBuilder, AnyAttachmentBuilder} from './define-attachment.js'
export {collectAttachmentCards} from './collect-client.js'
export type {AttachmentCardEntry, AttachmentExpand, DocumentPart, ExtensionAttachment} from './types.js'
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm turbo run test --filter=@conciv/extension`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(extension): register attachments + collectAttachmentCards" -- packages/extension/src/define-extension.ts packages/extension/src/collect-client.ts packages/extension/src/index.ts packages/extension/test/collect-attachment-cards.test.ts
```

---

## Task 4: DB — persist document parts across restart

**Files:**
- Modify: `packages/db/src/run-queries.ts:96-98` (`hasImagePart`)
- Test: `packages/db/test/run-queries.test.ts` (extend or create)

**Interfaces:**
- Produces: a user message containing a `document` part is folded into `imageHistory` (survives restart), same as one containing an `image` part.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {hasRichPart} from '../src/run-queries.js'

describe('hasRichPart', () => {
  it('is true for a document part', () => {
    expect(hasRichPart({parts: [{type: 'document', source: {type: 'data', mimeType: 'application/x-test', value: 'x'}}]})).toBe(true)
  })
  it('is true for an image part and false otherwise', () => {
    expect(hasRichPart({parts: [{type: 'image'}]})).toBe(true)
    expect(hasRichPart({parts: [{type: 'text', content: 'hi'}]})).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/db`
Expected: FAIL — `hasRichPart` not exported.

- [ ] **Step 3: Implement — rename + widen the predicate**

Replace `hasImagePart` with:

```ts
export function hasRichPart(message: unknown): boolean {
  if (!isRecord(message) || !Array.isArray(message.parts)) return false
  return message.parts.some((part) => isRecord(part) && (part.type === 'image' || part.type === 'document'))
}
```

Update its call site in `foldRunMessagesIntoImageHistory` (`row.messages.some(hasImagePart)` → `row.messages.some(hasRichPart)`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm turbo run test --filter=@conciv/db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(db): fold document parts into durable history" -- packages/db/src/run-queries.ts packages/db/test/run-queries.test.ts
```

---

## Task 5: Core — Expand at send + store-rich/send-stripped seam

**Files:**
- Modify: `packages/core/src/chat/runtime.ts` (`ChatDeps` gains `attachmentExpanders`)
- Modify: `packages/core/src/chat/run.ts` (`makeSend`, `RunRequest`, `startRun`)
- Modify: `packages/core/src/app.ts` (`buildAttachmentExpanders`, assemble into `chatDeps`)
- Test: `packages/core/test/expand-attachments.test.ts`

**Interfaces:**
- Consumes: `ChatContentPartSchema` document part (Task 1); the extension `attachments[].__expand` + context-closure pattern of `buildExtensionTools` (existing, `app.ts`).
- Produces:
  - `ChatDeps.attachmentExpanders: Record<string, (part: DocumentPart) => Promise<ContentPart[]>>` — keyed by mime, context already closed over.
  - `expandUserParts(content: UserContent, expanders): Promise<{stored: UserContent; forModel: UserContent}>` — for each `document` part with a matching expander, appends the expanded parts marked `metadata.modelOnly:true`; `stored` keeps the document + expanded parts, `forModel` drops the document part.
  - `RunRequest` gains `userParts: UserContent` (rich, for storage); `startRun` uses it for `addUserMessage`.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {expandUserParts} from '../src/chat/run.js'

const doc = {type: 'document', source: {type: 'data', mimeType: 'application/x-test', value: 'eyJpZCI6MX0='}} as const

describe('expandUserParts', () => {
  it('appends expanded parts as modelOnly and drops the document from the model projection', async () => {
    const expanders = {
      'application/x-test': async () => [{type: 'text', content: 'clicked save'}],
    }
    const {stored, forModel} = await expandUserParts([{type: 'text', content: 'why?'}, doc], expanders)
    expect(stored).toEqual([
      {type: 'text', content: 'why?'},
      doc,
      {type: 'text', content: 'clicked save', metadata: {modelOnly: true}},
    ])
    expect(forModel).toEqual([
      {type: 'text', content: 'why?'},
      {type: 'text', content: 'clicked save', metadata: {modelOnly: true}},
    ])
  })

  it('passes through when no expander matches', async () => {
    const {stored, forModel} = await expandUserParts([doc], {})
    expect(stored).toEqual([doc])
    expect(forModel).toEqual([doc])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/core`
Expected: FAIL — `expandUserParts` not exported.

- [ ] **Step 3: Implement `expandUserParts` in `run.ts`**

```ts
import type {ContentPart} from '@tanstack/ai'
import type {DocumentPart} from '@conciv/extension'

type Expanders = Record<string, (part: DocumentPart) => Promise<ContentPart[]>>

function isDocumentPart(part: ChatContentPart): part is DocumentPart {
  return part.type === 'document'
}

export async function expandUserParts(
  content: UserContent,
  expanders: Expanders,
): Promise<{stored: UserContent; forModel: UserContent}> {
  if (typeof content === 'string') return {stored: content, forModel: content}
  const stored: ChatContentPart[] = []
  const forModel: ChatContentPart[] = []
  for (const part of content) {
    const expander = isDocumentPart(part) ? expanders[part.source.mimeType] : undefined
    if (isDocumentPart(part)) stored.push(part)
    else {
      stored.push(part)
      forModel.push(part)
    }
    if (!expander || !isDocumentPart(part)) continue
    const expanded = (await expander(part)).map((expandedPart) => ({
      ...expandedPart,
      metadata: {...('metadata' in expandedPart ? expandedPart.metadata : {}), modelOnly: true},
    }))
    stored.push(...expanded)
    forModel.push(...expanded)
  }
  return {stored, forModel}
}
```

- [ ] **Step 4: Thread it through `makeSend` and `startRun`**

In `makeSend`, after `composeUserContent`, expand before building model messages:

```ts
const userContent = await composeUserContent(deps.db, sessionId, content)
const {stored, forModel} = await expandUserParts(userContent, deps.attachmentExpanders)
const model = (await sessionById(deps.db, sessionId))?.model ?? null
const history = await historyFor(deps, sessionId)
const messages = toModelMessages([...history, {role: 'user', content: forModel}])
void startRun(deps, sessionId, {messages, model, kind: 'chat', userParts: stored})
```

Add `userParts?: UserContent` to `RunRequest`. In `startRun`, replace the `addUserMessage` line:

```ts
const stored = req.userParts ?? req.messages.findLast((message) => message.role === 'user')?.content
if (stored != null) processor.addUserMessage(stored)
```

Add `attachmentExpanders: Record<string, (part: DocumentPart) => Promise<ContentPart[]>>` to `ChatDeps` in `runtime.ts`.

- [ ] **Step 5: Build the expanders in `app.ts`**

Add, next to `buildExtensionTools`:

```ts
function buildAttachmentExpanders(extension: AnyExtension, context: unknown) {
  const entries: [string, (part: DocumentPart) => Promise<ContentPart[]>][] = []
  for (const attachment of extension.attachments ?? []) {
    const expand = attachment.__expand
    if (!expand) continue
    entries.push([attachment.mime, async (part) => Array.from(await expand(part, context))])
  }
  return entries
}
```

In the `mounted` map return object add `attachmentExpanders: buildAttachmentExpanders(extension, context),`, then assemble:

```ts
const attachmentExpanders = Object.fromEntries(mounted.flatMap((entry) => entry.attachmentExpanders))
```

and pass `attachmentExpanders` into `chatDeps`. Import `ContentPart`, `DocumentPart` from `@conciv/extension`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm turbo run test --filter=@conciv/core`
Expected: PASS. Then `pnpm turbo run typecheck --filter=@conciv/core` — Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(core): expand attachments at send; store rich, send stripped" -- packages/core/src/chat/run.ts packages/core/src/chat/runtime.ts packages/core/src/app.ts packages/core/test/expand-attachments.test.ts
```

---

## Task 6: ui-kit — dispatch attachment render by mime + document adapter

**Files:**
- Create: `packages/ui-kit-chat/src/styled/attachment-dispatch.tsx`
- Modify: `packages/ui-kit-chat/src/index.tsx` (exports)
- Test: `packages/ui-kit-chat/test/attachment-dispatch.browser.test.tsx` (Playwright, real browser)

**Interfaces:**
- Consumes: `useAttachment()`, `AttachmentUI`, `isCompleteAttachment` (existing); `AttachmentCardEntry` (Task 3).
- Produces:
  - `AttachmentByMime(props: {cards: AttachmentCardEntry[]; removable?: boolean}): JSX.Element` — reads `useAttachment()`, picks the card whose `mime` matches the attachment's `contentType`/document mime, else renders `AttachmentUI`.
  - `createDocumentAttachmentAdapter(mime: string): AttachmentAdapter` — `accept:mime`; `send` wraps the File bytes into a `document` part with that mime.
  - `partIsModelOnly(part): boolean`.

- [ ] **Step 1: Write the failing test** (real browser render)

```tsx
import {render} from '@solidjs/testing-library'
import {expect, test} from 'vitest'
import {AttachmentProvider} from '../src/primitives/attachment/attachment.js'
import {AttachmentByMime} from '../src/styled/attachment-dispatch.js'

test('renders the matching card for a document mime', () => {
  const attachment = {id: 'a', type: 'document', name: 'rec', contentType: 'application/x-test', status: {type: 'complete'}, content: []}
  const Card = () => <div data-testid="card">player</div>
  const {getByTestId} = render(() => (
    <AttachmentProvider value={attachment}>
      <AttachmentByMime cards={[{mime: 'application/x-test', render: Card}]} />
    </AttachmentProvider>
  ))
  expect(getByTestId('card')).toBeTruthy()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/ui-kit-chat`
Expected: FAIL — `attachment-dispatch.js` missing.

- [ ] **Step 3: Implement the dispatcher + adapter**

Create `packages/ui-kit-chat/src/styled/attachment-dispatch.tsx`:

```tsx
import {Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {MessagePart} from '@tanstack/ai-client'
import type {AttachmentCardEntry} from '@conciv/extension'
import {useAttachment} from '../primitives/attachment/attachment.js'
import {AttachmentUI} from './attachment-ui.js'
import {fileToDataSource, type Attachment, type AttachmentAdapter} from '../primitives/attachment/attachment-adapter.js'

function attachmentMime(attachment: Attachment): string | undefined {
  if ('content' in attachment)
    for (const part of attachment.content) if (part.type === 'document') return part.source.mimeType
  return attachment.contentType
}

export function AttachmentByMime(props: {cards: AttachmentCardEntry[]; removable?: boolean}): JSX.Element {
  const attachment = useAttachment()
  const card = () => props.cards.find((entry) => entry.mime === attachmentMime(attachment))
  return (
    <Show when={card()} fallback={<AttachmentUI removable={props.removable} />}>
      {(entry) => <Dynamic component={entry().render} />}
    </Show>
  )
}

export function partIsModelOnly(part: MessagePart): boolean {
  const metadata = 'metadata' in part ? part.metadata : undefined
  return typeof metadata === 'object' && metadata !== null && (metadata as {modelOnly?: boolean}).modelOnly === true
}

let documentId = 0

export function createDocumentAttachmentAdapter(mime: string): AttachmentAdapter {
  return {
    accept: mime,
    add: async ({file}) => ({
      id: `document-${(documentId += 1)}`,
      type: 'document',
      name: file.name,
      contentType: mime,
      file,
      status: {type: 'requires-action', reason: 'composer-send'},
    }),
    remove: async () => {},
    send: async (attachment) => ({
      ...attachment,
      status: {type: 'complete'},
      content: [{type: 'document', source: await fileToDataSource(attachment.file)}],
    }),
  }
}
```

Note: `fileToDataSource` returns `{type:'data', value, mimeType}` using the File's mime — the recorder's File already carries `mime`, so the document part's mime is correct.

- [ ] **Step 4: Export**

Add to `packages/ui-kit-chat/src/index.tsx`:

```ts
export {AttachmentByMime, createDocumentAttachmentAdapter, partIsModelOnly} from './styled/attachment-dispatch.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm turbo run test --filter=@conciv/ui-kit-chat`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(ui-kit-chat): dispatch attachment render by mime + document adapter" -- packages/ui-kit-chat/src/styled/attachment-dispatch.tsx packages/ui-kit-chat/src/index.tsx packages/ui-kit-chat/test/attachment-dispatch.browser.test.tsx
```

---

## Task 7: Thread renders attachments + hides modelOnly parts

**Files:**
- Modify: `packages/ui-kit-chat/src/styled/thread.tsx:174-186` (`UserTurn`)
- Modify: `packages/ui-kit-chat/src/primitives/message/message.tsx` (`Parts` skips `modelOnly`)
- Test: `packages/ui-kit-chat/test/user-turn.browser.test.tsx`

**Interfaces:**
- Consumes: `AttachmentByMime`, `partIsModelOnly` (Task 6); `Message.Attachments` (existing).
- Produces: `UserTurn` accepts the Card list via `ThreadConfigContext` (new field `attachmentCards: () => AttachmentCardEntry[]`) and renders `Message.Attachments`; user text parts marked `modelOnly` are not rendered.

- [ ] **Step 1: Write the failing test**

```tsx
// Renders a user turn with [text, document, modelOnly-text]; asserts the card shows
// and the modelOnly text is absent. (Mount Thread with a stubbed chat store exposing one user turn.)
```
Fill this with the repo's existing Thread test harness (see `packages/ui-kit-chat/src/styled/thread.stories.tsx` for how a thread is mounted with a store). Assert: `getByTestId('card')` present; `queryByText('clicked save')` is null.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/ui-kit-chat`
Expected: FAIL — modelOnly text is rendered / card absent.

- [ ] **Step 3: Add `attachmentCards` to `ThreadConfigContext` and render attachments in `UserTurn`**

Extend `ThreadConfig` with `attachmentCards: () => AttachmentCardEntry[]` (default `() => []`), populate it from a new `ThreadProps.attachmentCards`, and update `UserTurn`:

```tsx
function UserTurn(): JSX.Element {
  const config = useContext(ThreadConfigContext)
  const RemovableCard = () => <AttachmentByMime cards={config.attachmentCards()} />
  return (
    <>
      <TurnPrefix />
      <Show when={config.attachmentCards().length > 0}>
        <div class="flex flex-wrap gap-1 self-end">
          <Message.Attachments components={{Document: RemovableCard, Image: RemovableCard}} />
        </div>
      </Show>
      <Message.Root
        data-pw-msg
        class="px-3 py-1.5 rounded-[var(--chat-radius-md)] max-w-[80%] [background:var(--chat-accent)] [color:var(--chat-on-accent)] [overflow-wrap:anywhere] self-end anim-msg"
      >
        <Message.Parts />
      </Message.Root>
    </>
  )
}
```

- [ ] **Step 4: Skip modelOnly parts in `Message.Parts`**

In `message.tsx` `Parts`, filter the iterated parts so `partIsModelOnly(part)` ones are not dispatched (guard inside `DispatchPart` or filter the `Index each`). Add the same guard so `Message.Attachments` skips modelOnly image parts (keyframes must not appear as tiles).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm turbo run test --filter=@conciv/ui-kit-chat`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(ui-kit-chat): user turn renders attachment cards, hides modelOnly parts" -- packages/ui-kit-chat/src/styled/thread.tsx packages/ui-kit-chat/src/primitives/message/message.tsx packages/ui-kit-chat/test/user-turn.browser.test.tsx
```

---

## Task 8: Widget wiring — compose adapters + pass cards to the thread

**Files:**
- Modify: `apps/conciv/src/chat/chat-pane.tsx:47-58,177-181,252,404-407`
- Test: `apps/conciv/test/attachment-widget.it.test.ts` (widget IT — rebuild `@conciv/embed` first)

**Interfaces:**
- Consumes: `collectAttachmentCards` (Task 3), `createDocumentAttachmentAdapter` (Task 6), `AttachmentByMime`/`Thread.attachmentCards` (Task 7).
- Produces: the composer accepts every registered attachment mime; the thread renders each turn's attachment via its Card.

- [ ] **Step 1: Write the failing test**

Widget IT (real browser, prebuilt bundle): mount the widget with a fixture extension whose attachment mime has a Card rendering `data-testid="fixture-card"`; drive: attach a File of that mime via the composer, assert the fixture card shows above the composer; send; assert the fixture card shows in the transcript. (Use `browser.newPage()`, `domcontentloaded`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo run build --filter=@conciv/embed` then `pnpm turbo run test --filter=@conciv/conciv`
Expected: FAIL — composer rejects the mime / no card in transcript.

- [ ] **Step 3: Build adapters + cards from instances**

Replace the module-level adapter helpers so the pane composes image + text + one document adapter per registered attachment mime, and derive the card list:

```ts
const attachmentCards = createMemo(() => collectAttachmentCards(instances.map((instance) => instance.extension)))
const attachmentAdapter = createMemo(() =>
  composeAttachmentAdapters([
    ...(imageAttachmentAdapter(meta.data?.harness.imageInput) ? [IMAGE_ATTACHMENT_ADAPTER] : []),
    TEXT_ATTACHMENT_ADAPTER,
    ...attachmentCards().map((entry) => createDocumentAttachmentAdapter(entry.mime)),
  ]),
)
```

- [ ] **Step 4: Pass cards to the Thread and the composer render**

Pass `attachmentCards={attachmentCards()}` to `<Thread …>`, and swap the composer's attachment component to `AttachmentByMime` with the same cards (via the `Composer` styled component's attachment slot — thread `attachmentCards` covers both once `ThreadConfigContext` provides them; verify the composer `RemovableAttachment` uses `AttachmentByMime`).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm turbo run build --filter=@conciv/embed` then `pnpm turbo run test --filter=@conciv/conciv`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(widget): wire attachment cards + document adapters from extensions" -- apps/conciv/src/chat/chat-pane.tsx apps/conciv/test/attachment-widget.it.test.ts
```

---

## Task 9: End-to-end fixture proof (framework smoke)

**Files:**
- Create: `packages/extension-testkit/…/fixtures/attachment-fixture.ts` (or the testkit's fixtures dir) — a fixture extension: `defineAttachment({mime:'application/x-conciv-fixture'}).card(FixtureCard).server((part) => [{type:'text', content:'fixture-expanded'}])`.
- Test: `packages/core/test/expand-attachments.it.test.ts` — send through a real `makeApp` with the fixture extension; assert the stored user turn contains the document part + a `modelOnly` `fixture-expanded` text part, and the model projection contains `fixture-expanded` but not the document part.

- [ ] **Step 1: Write the failing test** (real send path via `makeApp` + testkit, no mocks).
- [ ] **Step 2: Run — Expected: FAIL** (`pnpm turbo run test --filter=@conciv/core`).
- [ ] **Step 3: Implement the fixture** (no product code change expected; if the test reveals a gap, fix the responsible task's file).
- [ ] **Step 4: Run — Expected: PASS.**
- [ ] **Step 5: Commit**

```bash
git commit -m "test(core): end-to-end attachment framework fixture" -- packages/extension-testkit packages/core/test/expand-attachments.it.test.ts
```

---

## Task 10: Whole-project gates + fallow

- [ ] **Step 1:** `pnpm typecheck` — Expected: no errors.
- [ ] **Step 2:** `pnpm turbo run test --force` — Expected: all pass (force to dodge cached green).
- [ ] **Step 3:** `pnpm exec fallow audit --changed-since main --format json` — fix anything INTRODUCED (dead code, unused exports/deps — e.g. confirm `hasImagePart` has no stragglers, `AttachmentUI` still used).
- [ ] **Step 4: Commit** any fallow fixes.

---

## Self-Review

**Spec coverage:**
- Client dispatch by mime → Tasks 6, 7, 8. Backend Expand-at-send → Task 5. Store-rich/send-stripped → Task 5. Persistence fold → Task 4. Wire schema (`document` + `modelOnly`) → Task 1. `defineAttachment` API + collectors → Tasks 2, 3. `host.attach`/`withImageRefs` unchanged → not touched (correct). Protocol type-move → intentionally dropped (YAGNI; noted in header). Recorder consumer, distill, `recordings.save/get`, player extraction, grab → **Plan 2** (out of scope here).

**Placeholder scan:** Task 7 Step 1 and Task 8 Step 1 describe the test setup rather than pasting full code, because they depend on the repo's existing Thread/widget mount harnesses (`thread.stories.tsx`, widget IT helpers) which the implementer must read; every product-code step has complete code. Task 9 fixture path depends on the testkit layout. These are grounded references, not TBDs.

**Type consistency:** `AttachmentExpand`/`DocumentPart`/`AttachmentCardEntry` defined in Task 2, consumed unchanged in Tasks 3/5/6. `expandUserParts` returns `{stored, forModel}` — same names used in Task 5 Step 4. `collectAttachmentCards` returns `{mime, render}` — same shape consumed in Tasks 6/7/8. `attachmentExpanders` keyed by mime — produced in Task 5 Step 5, consumed in Step 4.
