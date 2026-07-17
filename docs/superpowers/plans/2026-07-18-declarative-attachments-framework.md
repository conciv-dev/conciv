# Declarative Attachments — Framework Implementation Plan (rev 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A generic attachment framework where an extension declares an attachment type (a namespaced document mime) with a client Card and a server Expand, and the transcript renders the Card while the model receives Expand's `text`/`image` parts.

**Architecture:** A sent attachment is a standard `document` part with a namespaced mime — no new part type. The client dispatches the existing attachment render slot by mime to a per-extension Card (mirrors `collectToolRenderers`). The backend, once at send, runs the type's Expand (mirrors `buildExtensionTools`' context closure) to append the `text`/`image` parts the harness reads, marked `modelOnly` so the transcript hides them. Expand failures never block the send. `startRun` stores the full expanded parts; the harness projection falls out of the existing `modelContent` filter (documents dropped, text/image kept).

**Tech Stack:** TypeScript (strict, NodeNext), Solid, zod, `@tanstack/ai`/`ai-client`, oRPC, Vitest (node + `@vitest/browser-playwright` in `apps/conciv`), turbo.

**Plan 1 of 3.** Plan 2 (recorder consumer) depends on this plan's symbols. Plan 3 (recorder resource hardening) is independent.

**Rev 2 changes** (from Fable API review + maintainer comments): client `partContent` document gap (was a feature-killing blocker), single-array `expandUserParts` (old two-array version failed its own test), Expand try/catch fallback, `Ctx` generic on `defineAttachment` + `RequiredContext` over attachments, browser tests moved to `apps/conciv` (ui-kit-chat has no browser vitest project), composer dispatch site now a real task, no double-render of images / unconditional document fallback, remove affordance on matched cards, fixture task rebuilt without a dependency cycle, correct turbo filter names (`conciv`, not `@conciv/conciv`), first-wins expander precedence, `partIsModelOnly` lives in primitives.

**Rev 3 changes** (risk-closure review against the live tree, 2026-07-18): browser-test snippets rewritten to the repo's real harness — `render` from `solid-js/web` + structural assertions, exactly like `apps/conciv/test/context-tracker.browser.test.tsx` (`vitest-browser-solid` is NOT a dependency and must not be added); tests import from the `@conciv/ui-kit-chat` root only (the package exports `.` plus two css files — subpaths like `primitives/attachment/attachment` do not resolve); Task 4 gains a no-new-cast acceptance check; Task 6's expand failure path logs via `logError` so failures are diagnosable server-side (the `modelOnly` failure text also reaches the model, which tells the user in its reply — that is the user-facing surface, by design); Task 10 gains a pre-send part-count gate matching the contract's 16-part cap (`contract.ts:30`) so an over-attached message gets a notice instead of an opaque server rejection; redundant `aria-label` dropped from the Task 8 remove overlay (`Attachment.Remove` sets its own, `attachment.tsx:42`).

## Global Constraints

- Functions, not classes. No IIFEs. Zero code comments in TS/JS (self-explanatory names).
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120.
- TS strict: no `any`/`as`/`@ts-ignore`/non-null `!`; `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. Plan snippets must compile under these rules — do not add casts to make them fit.
- No barrel files; import from source.
- Build/typecheck/test via turbo; never hand-build `dist/`.
- Browser UI tests run in the `apps/conciv` vitest **browser** project (`test/**/*.browser.test.tsx`, Playwright chromium — see `apps/conciv/vitest.config.ts`). `packages/ui-kit-chat` vitest is node-only and must stay that way.
- Browser tests mount with `render` from `solid-js/web` into a host div with dispose-on-afterEach (copy the harness in `apps/conciv/test/context-tracker.browser.test.tsx`) and assert **structurally** (`querySelector` by role/aria-label/testid, `textContent`) — never visually (the browser project loads no UnoCSS/theme, so classes are unstyled). Do NOT add `vitest-browser-solid` or any other test dep.
- All test imports of ui-kit symbols go through the `@conciv/ui-kit-chat` **root** export (the exports map has only `.` + two css files; subpath imports do not resolve).
- zod validates every HTTP boundary.
- v0, no back-compat shims.
- Commit with pathspec. If `prek` aborts on a lock race, `pnpm format` then `git commit --no-verify -- <paths>`.

Turbo filter names (verified): protocol `@conciv/protocol`, extension `@conciv/extension`, db `@conciv/db`, core `@conciv/core`, client `@conciv/client`, ui-kit `@conciv/ui-kit-chat`, widget app **`conciv`**, embed `@conciv/embed`.

---

## File Structure

- `packages/protocol/src/chat-types.ts` — `document` variant + `metadata.modelOnly` on parts (contract propagates automatically; `packages/contract/src/contract.ts:30` imports this schema).
- `packages/client/src/chat-connection.ts` — `partContent` gains a `document` branch and preserves `metadata` (today it drops anything non-text/image at `:33-39` — without this the feature no-ops).
- `packages/extension/src/define-attachment.ts` — **new**: `defineAttachment<Ctx>` builder with `.card()`/`.server()`.
- `packages/extension/src/types.ts` — `AttachmentDocumentPart`, `AttachmentExpand<Ctx>`, `ExtensionAttachment`, `AttachmentCardEntry`.
- `packages/extension/src/define-extension.ts` — `attachments` on meta/builder; `server()` context constraint covers attachments.
- `packages/extension/src/collect-client.ts` — `collectAttachmentCards`.
- `packages/extension/src/index.ts` — exports.
- `packages/core/src/chat/run.ts` — `expandUserParts` (single array, per-expander try/catch); `RunRequest.userParts`; `startRun` stores rich parts.
- `packages/core/src/chat/runtime.ts` — `ChatDeps.attachmentExpanders`.
- `packages/core/src/app.ts` — `buildAttachmentExpanders` (first-wins on mime).
- `packages/db/src/run-queries.ts` — `hasImagePart` → `hasRichPart`.
- `packages/ui-kit-chat/src/primitives/message-part/part-visibility.ts` — **new**: `partIsModelOnly` (primitives layer — must not import from `styled/`).
- `packages/ui-kit-chat/src/primitives/message/message.tsx` — `DispatchPart` + `Attachments` skip `modelOnly` parts.
- `packages/ui-kit-chat/src/styled/attachment-dispatch.tsx` — **new**: `AttachmentByMime` (+ remove affordance) and `createDocumentAttachmentAdapter`.
- `packages/ui-kit-chat/src/styled/composer.tsx` — `ComposerProps.AttachmentComponent` (the composer dispatch site — previously unowned).
- `packages/ui-kit-chat/src/styled/thread.tsx` — `ThreadProps.attachmentCards`; `UserTurn` renders Document attachments unconditionally.
- `packages/ui-kit-chat/src/index.tsx` — exports.
- `apps/conciv/src/chat/chat-pane.tsx` — compose adapters + card map from instances.
- `apps/conciv/test/*.browser.test.tsx` + `packages/core/test/*` — tests.

---

## Task 1: Wire schema — document part + modelOnly metadata

**Files:**

- Modify: `packages/protocol/src/chat-types.ts:15-25`
- Test: `packages/protocol/test/chat-types.test.ts` (create if absent)

**Interfaces:**

- Produces: `ChatContentPartSchema` accepts `{type:'document', source:{type:'data', mimeType, value}}` and `metadata?:{modelOnly?:boolean}` on all three variants. `ChatContentPart` gains the document member. Contract `content` union inherits automatically.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {ChatContentPartSchema} from '../src/chat-types.js'

describe('ChatContentPartSchema', () => {
  it('accepts a document part with a namespaced mime', () => {
    const parsed = ChatContentPartSchema.safeParse({
      type: 'document',
      source: {type: 'data', mimeType: 'application/x-conciv-recorder', value: 'eyJyZWNvcmRpbmdJZCI6InIxIn0='},
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects an oversized document value', () => {
    const parsed = ChatContentPartSchema.safeParse({
      type: 'document',
      source: {type: 'data', mimeType: 'application/x-test', value: 'a'.repeat(27_962_029)},
    })
    expect(parsed.success).toBe(false)
  })

  it('accepts modelOnly metadata on a text part', () => {
    const parsed = ChatContentPartSchema.safeParse({type: 'text', content: 'x', metadata: {modelOnly: true}})
    expect(parsed.success).toBe(true)
  })
})
```

Note: the `modelOnly` test is green already (`.loose()` on the existing variants) — the red assertions are the two document cases. That is fine; the schema change is still driven by the document tests.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/protocol`
Expected: FAIL — document part rejected by the discriminated union.

- [ ] **Step 3: Implement — extend the schema**

Replace the `ChatContentPartSchema` definition with:

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

## Task 2: Client send path forwards document parts (blocker fix)

**Files:**

- Modify: `packages/client/src/chat-connection.ts:33-39` (`partContent`)
- Test: `packages/client/test/part-content.test.ts`

**Interfaces:**

- Consumes: Task 1's document variant of `ChatContentPart`.
- Produces: `partContent` maps `document` parts (data source) to `{type:'document', source}` and carries `metadata` through on all part kinds. Without this, `chat.sendMessage` → `lastUserContent` → `rpc.chat.send` silently drops the attachment client-side.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {partContent} from '../src/chat-connection.js'

const doc = {
  type: 'document',
  source: {type: 'data', mimeType: 'application/x-test', value: 'eyJhIjoxfQ=='},
}

describe('partContent', () => {
  it('forwards a document part', () => {
    expect(partContent(doc)).toEqual([doc])
  })
  it('carries metadata through on text parts', () => {
    expect(partContent({type: 'text', content: 'x', metadata: {modelOnly: true}})).toEqual([
      {type: 'text', content: 'x', metadata: {modelOnly: true}},
    ])
  })
  it('still drops unknown part types', () => {
    expect(partContent({type: 'thinking', content: 'x'})).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/client`
Expected: FAIL — `partContent` not exported / document branch missing.

- [ ] **Step 3: Implement**

Export `partContent` and rewrite it (the existing `imageSource` helper narrows data sources; reuse it for documents since the shape is identical minus the mime check):

```ts
function partMetadata(part: Record<string, unknown>): {metadata?: Record<string, unknown>} {
  const metadata = part.metadata
  return typeof metadata === 'object' && metadata !== null ? {metadata: {...metadata}} : {}
}

export function partContent(part: unknown): ChatContentPart[] {
  if (!isRecord(part)) return []
  if (part.type === 'text' && typeof part.content === 'string')
    return [{type: 'text', content: part.content, ...partMetadata(part)}]
  if (part.type !== 'image' && part.type !== 'document') return []
  const source = imageSource(part.source)
  if (!source) return []
  if (part.type === 'image') return [{type: 'image', source, ...partMetadata(part)}]
  return [{type: 'document', source, ...partMetadata(part)}]
}
```

(`imageSource` only checks data-source structure, not the image mime prefix — verify at `chat-connection.ts:20-31`; if it enforces an `image/` prefix, split a `dataSource` helper both branches share.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm turbo run test --filter=@conciv/client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(client): forward document parts and metadata in send path" -- packages/client/src/chat-connection.ts packages/client/test/part-content.test.ts
```

---

## Task 3: `defineAttachment` builder with typed ctx

**Files:**

- Create: `packages/extension/src/define-attachment.ts`
- Modify: `packages/extension/src/types.ts` (append types)
- Test: `packages/extension/test/define-attachment.test.ts`

**Interfaces:**

- Produces (exact — Plan 2 consumes these):
  - `type AttachmentDocumentPart = {type:'document'; source:{type:'data'; mimeType:string; value:string}}` — the protocol shape, deliberately NOT tanstack's `DocumentPart` (whose url arm makes `mimeType` optional and breaks strict indexing).
  - `type AttachmentExpand<Ctx = unknown> = (part: AttachmentDocumentPart, ctx: Ctx) => Promise<readonly ContentPart[]> | readonly ContentPart[]`.
  - `type ExtensionAttachment = {mime: string; __card?: Component; __expand?: AttachmentExpand<never>; __ctx?: unknown}`.
  - `type AttachmentCardEntry = {mime: string; render: Component}`.
  - `AttachmentBuilder<Ctx>` = `ExtensionAttachment & {__ctx?: Ctx; card(c: Component): AttachmentBuilder<Ctx>; server(e: AttachmentExpand<Ctx>): AttachmentBuilder<Ctx>}`.
  - `defineAttachment<Ctx = unknown>(def: {mime: string}): AttachmentBuilder<Ctx>`.
  - `__ctx` is the same phantom the tool builder uses, so `RequiredContext` (via `CtxOf`) composes over attachments (Task 4).

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {defineAttachment} from '../src/define-attachment.js'

describe('defineAttachment', () => {
  it('records card and expand on the builder, matched by mime', () => {
    const Card = () => null
    const attachment = defineAttachment<{depth: number}>({mime: 'application/x-test'})
    attachment.card(Card)
    attachment.server((part, ctx) => [{type: 'text', content: `${part.source.mimeType}:${ctx.depth}`}])
    expect(attachment.mime).toBe('application/x-test')
    expect(attachment.__card).toBe(Card)
    expect(attachment.__expand).toBeTypeOf('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo run test --filter=@conciv/extension`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement types + builder**

Append to `packages/extension/src/types.ts`:

```ts
import type {ContentPart} from '@tanstack/ai'

export type AttachmentDocumentPart = {type: 'document'; source: {type: 'data'; mimeType: string; value: string}}
export type AttachmentExpand<Ctx = unknown> = (
  part: AttachmentDocumentPart,
  ctx: Ctx,
) => Promise<readonly ContentPart[]> | readonly ContentPart[]
export type ExtensionAttachment = {mime: string; __card?: Component; __ctx?: unknown}
export type AttachmentCardEntry = {mime: string; render: Component}
```

Create `packages/extension/src/define-attachment.ts`:

```ts
import type {Component} from 'solid-js'
import type {AttachmentExpand, ExtensionAttachment} from './types.js'

export type AttachmentBuilder<Ctx = unknown> = ExtensionAttachment & {
  __ctx?: Ctx
  __expand?: AttachmentExpand<Ctx>
  card: (component: Component) => AttachmentBuilder<Ctx>
  server: (expand: AttachmentExpand<Ctx>) => AttachmentBuilder<Ctx>
}

export type AnyAttachmentBuilder = AttachmentBuilder<never>

export function defineAttachment<Ctx = unknown>(def: {mime: string}): AttachmentBuilder<Ctx> {
  const builder: AttachmentBuilder<Ctx> = {
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

(If `AnyAttachmentBuilder = AttachmentBuilder<never>` makes assignment of concrete builders fail variance-wise, use `AttachmentBuilder<any>` is banned — instead type it structurally: `type AnyAttachmentBuilder = ExtensionAttachment & {__expand?: AttachmentExpand<never>}` and have collectors read only `mime`/`__card`/`__expand`. The implementer picks whichever satisfies strict mode; the collector-facing surface is `mime`, `__card`, `__expand`, `__ctx`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm turbo run test --filter=@conciv/extension`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(extension): defineAttachment builder with typed ctx" -- packages/extension/src/define-attachment.ts packages/extension/src/types.ts packages/extension/test/define-attachment.test.ts
```

---

## Task 4: Register `attachments` on the extension + collector + ctx constraint

**Files:**

- Modify: `packages/extension/src/define-extension.ts:18-27,37-57,84-92`
- Modify: `packages/extension/src/collect-client.ts`
- Modify: `packages/extension/src/index.ts`
- Test: `packages/extension/test/collect-attachment-cards.test.ts`

**Interfaces:**

- Consumes: `AnyAttachmentBuilder` (Task 3); `RequiredContext`/`CtxOf` (existing, `types.ts:92-94`).
- Produces:
  - `ExtensionMeta`/`ExtensionBuilder` gain generic `Attachments extends readonly AnyAttachmentBuilder[]` and field `attachments?: Attachments`.
  - `server()`'s context parameter is constrained to `RequiredContext<readonly [...Tools, ...Attachments]>` so an attachment's `Ctx` is compile-enforced exactly like a tool's.
  - `collectAttachmentCards(builders: AnyExtension[]): AttachmentCardEntry[]` — first-wins on mime.
  - Exports: `defineAttachment`, `collectAttachmentCards`, types `AttachmentBuilder`, `AnyAttachmentBuilder`, `AttachmentCardEntry`, `AttachmentExpand`, `AttachmentDocumentPart`, `ExtensionAttachment`.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {defineExtension} from '../src/define-extension.js'
import {defineAttachment} from '../src/define-attachment.js'
import {collectAttachmentCards} from '../src/collect-client.js'

describe('collectAttachmentCards', () => {
  it('gathers registered cards keyed by mime, first-wins', () => {
    const CardA = () => null
    const CardB = () => null
    const first = defineAttachment({mime: 'application/x-test'})
    first.card(CardA)
    const duplicate = defineAttachment({mime: 'application/x-test'})
    duplicate.card(CardB)
    const cards = collectAttachmentCards([
      defineExtension({name: 'a', attachments: [first]}),
      defineExtension({name: 'b', attachments: [duplicate]}),
    ])
    expect(cards).toEqual([{mime: 'application/x-test', render: CardA}])
  })

  it('ignores attachments with no card', () => {
    const bare = defineAttachment({mime: 'application/x-noop'})
    expect(collectAttachmentCards([defineExtension({name: 'c', attachments: [bare]})])).toEqual([])
  })
})
```

- [ ] **Step 2: Run — Expected: FAIL** (`pnpm turbo run test --filter=@conciv/extension`).

- [ ] **Step 3: Implement — thread the generic + field**

In `define-extension.ts`: add `Attachments extends readonly AnyAttachmentBuilder[] = readonly []` to `ExtensionMeta`, `ExtensionBuilder`, and `defineExtension`'s generics; add `attachments?: Attachments` to both type bodies; add `attachments: meta.attachments,` to the constructed builder; change the server signature to

```ts
server: <Context extends RequiredContext<readonly [...Tools, ...Attachments]>>(
  factory: (server: ServerApi<ConfigOf<Schema>>) => ServerResult<Context> | Promise<ServerResult<Context>>,
) => ExtensionBuilder<Name, Schema, Tools, Attachments, ClientValue>
```

and update `AnyExtension` and the other `ExtensionBuilder<...>` references for the new arity. `RequiredContext` already folds `__ctx` via `CtxOf` — no change needed there.

**Acceptance (no-new-cast):** this task's diff must introduce ZERO new `as`/`as unknown as`/non-null casts. The single pre-existing `as unknown as ExtensionBuilder<...>` at `define-extension.ts:102` stays and absorbs the new `attachments` field exactly as it absorbs `tools`. If the `Attachments` generic fights variance anywhere, fall back to the structural `AnyAttachmentBuilder` shape from Task 3's note — never a cast. Verify: `git diff packages/extension | grep -E '\bas\b'` shows nothing new.

- [ ] **Step 4: Implement the collector**

Append to `collect-client.ts`:

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

Add the exports listed in Interfaces to `index.ts`.

- [ ] **Step 5: Run — Expected: PASS.** Also `pnpm turbo run typecheck --filter=@conciv/extension` (the generic-arity change touches every `ExtensionBuilder` reference).

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(extension): attachments on extensions + collectAttachmentCards + ctx constraint" -- packages/extension/src/define-extension.ts packages/extension/src/collect-client.ts packages/extension/src/index.ts packages/extension/test/collect-attachment-cards.test.ts
```

---

## Task 5: DB — persist document parts across restart

**Files:**

- Modify: `packages/db/src/run-queries.ts:96-99,105`
- Test: `packages/db/test/run-queries.test.ts` (extend or create)

**Interfaces:**

- Produces: `hasRichPart(message)` true for `image` **or** `document` parts; `foldRunMessagesIntoImageHistory` uses it, so attachment turns survive restart.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {hasRichPart} from '../src/run-queries.js'

describe('hasRichPart', () => {
  it('is true for a document part', () => {
    expect(
      hasRichPart({parts: [{type: 'document', source: {type: 'data', mimeType: 'application/x-test', value: 'x'}}]}),
    ).toBe(true)
  })
  it('is true for an image part and false for text-only', () => {
    expect(hasRichPart({parts: [{type: 'image'}]})).toBe(true)
    expect(hasRichPart({parts: [{type: 'text', content: 'hi'}]})).toBe(false)
  })
})
```

- [ ] **Step 2: Run — Expected: FAIL** (`pnpm turbo run test --filter=@conciv/db`) — `hasRichPart` not exported.

- [ ] **Step 3: Implement**

```ts
export function hasRichPart(message: unknown): boolean {
  if (!isRecord(message) || !Array.isArray(message.parts)) return false
  return message.parts.some((part) => isRecord(part) && (part.type === 'image' || part.type === 'document'))
}
```

Update the call site: `row.messages.some(hasImagePart)` → `row.messages.some(hasRichPart)`; delete `hasImagePart`.

- [ ] **Step 4: Run — Expected: PASS.**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(db): fold document parts into durable history" -- packages/db/src/run-queries.ts packages/db/test/run-queries.test.ts
```

---

## Task 6: Core — Expand at send (single array, failure-safe)

**Files:**

- Modify: `packages/core/src/chat/runtime.ts` (`ChatDeps.attachmentExpanders`)
- Modify: `packages/core/src/chat/run.ts` (`expandUserParts`, `RunRequest.userParts`, `makeSend`, `startRun`)
- Modify: `packages/core/src/app.ts` (`buildAttachmentExpanders`, first-wins assembly)
- Test: `packages/core/test/expand-attachments.test.ts`

**Interfaces:**

- Consumes: `AttachmentDocumentPart` (Task 3), `buildExtensionTools` pattern (`app.ts:77-90`).
- Produces:
  - `type AttachmentExpanders = Record<string, (part: AttachmentDocumentPart) => Promise<readonly ContentPart[]>>` on `ChatDeps` (ctx pre-closed).
  - `expandUserParts(content: UserContent, expanders: AttachmentExpanders): Promise<UserContent>` — **one** array: original parts (documents included) plus, after each matched document, its expanded parts marked `metadata:{modelOnly:true}`. An expander that throws contributes `{type:'text', content:'[attachment could not be processed]', metadata:{modelOnly:true}}` instead — the send never fails.
  - The harness projection needs no second array: `modelContent` (`session.ts:204-216`) already drops document parts and keeps text/image. Note `toModelMessages` strips part `metadata` — irrelevant for the harness; the stored copy keeps it.
  - `RunRequest.userParts?: UserContent`; `startRun` stores `userParts` when present, else the previous behavior.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {expandUserParts} from '../src/chat/run.js'

const doc = {type: 'document', source: {type: 'data', mimeType: 'application/x-test', value: 'eyJpZCI6MX0='}} as const

describe('expandUserParts', () => {
  it('appends expanded parts as modelOnly after the document', async () => {
    const expanders = {'application/x-test': async () => [{type: 'text' as const, content: 'clicked save'}]}
    const expanded = await expandUserParts([{type: 'text', content: 'why?'}, doc], expanders)
    expect(expanded).toEqual([
      {type: 'text', content: 'why?'},
      doc,
      {type: 'text', content: 'clicked save', metadata: {modelOnly: true}},
    ])
  })

  it('passes through untouched when no expander matches', async () => {
    expect(await expandUserParts([doc], {})).toEqual([doc])
    expect(await expandUserParts('plain', {})).toBe('plain')
  })

  it('falls back to an error text part when the expander throws', async () => {
    const expanders = {
      'application/x-test': async () => {
        throw new Error('renderer died')
      },
    }
    expect(await expandUserParts([doc], expanders)).toEqual([
      doc,
      {type: 'text', content: '[attachment could not be processed]', metadata: {modelOnly: true}},
    ])
  })
})
```

- [ ] **Step 2: Run — Expected: FAIL** (`pnpm turbo run test --filter=@conciv/core`) — not exported.

- [ ] **Step 3: Implement `expandUserParts`**

```ts
import type {ContentPart} from '@tanstack/ai'
import type {AttachmentDocumentPart} from '@conciv/extension'

export type AttachmentExpanders = Record<string, (part: AttachmentDocumentPart) => Promise<readonly ContentPart[]>>

const EXPAND_FAILURE_PART: ChatContentPart = {
  type: 'text',
  content: '[attachment could not be processed]',
  metadata: {modelOnly: true},
}

function asExpandable(part: ChatContentPart): AttachmentDocumentPart | null {
  if (part.type !== 'document' || part.source.type !== 'data') return null
  return {type: 'document', source: {type: 'data', mimeType: part.source.mimeType, value: part.source.value}}
}

function markModelOnly(parts: readonly ContentPart[]): ChatContentPart[] {
  return parts.flatMap((part) => {
    if (part.type === 'text') return [{type: 'text', content: part.content, metadata: {modelOnly: true}}]
    if (part.type === 'image' && part.source.type === 'data' && part.source.mimeType !== undefined)
      return [
        {
          type: 'image',
          source: {type: 'data', mimeType: part.source.mimeType, value: part.source.value},
          metadata: {modelOnly: true},
        },
      ]
    return []
  })
}

export async function expandUserParts(content: UserContent, expanders: AttachmentExpanders): Promise<UserContent> {
  if (typeof content === 'string') return content
  const expanded: ChatContentPart[] = []
  for (const part of content) {
    expanded.push(part)
    const expandable = asExpandable(part)
    const expander = expandable ? expanders[expandable.source.mimeType] : undefined
    if (!expandable || !expander) continue
    const produced = await expander(expandable)
      .then(markModelOnly)
      .catch((error: unknown) => {
        logError(`[core] attachment expand failed (${expandable.source.mimeType}): ${String(error)}`)
        return [EXPAND_FAILURE_PART]
      })
    expanded.push(...produced)
  }
  return expanded
}
```

(`logError` from `../lib/debug.js` — the same logger `app.ts` uses. The failure is thus diagnosable server-side; the model receives the `modelOnly` failure text and relays it to the user in its reply, which is the intended user-facing surface. The Task 1 Step 1 test with a throwing expander asserts the returned parts only — the log line is additive and does not change its expectations.)

- [ ] **Step 4: Thread through `makeSend` / `startRun`**

In `makeSend` (`run.ts:238-258`):

```ts
const userContent = await composeUserContent(deps.db, sessionId, content)
const expanded = await expandUserParts(userContent, deps.attachmentExpanders)
const model = (await sessionById(deps.db, sessionId))?.model ?? null
const history = await historyFor(deps, sessionId)
const messages = toModelMessages([...history, {role: 'user', content: expanded}])
void startRun(deps, sessionId, {messages, model, kind: 'chat', userParts: expanded})
```

`RunRequest` gains `userParts?: UserContent`. In `startRun` replace the `addUserMessage` block:

```ts
const lastUser = req.messages.findLast((message) => message.role === 'user')
const stored = req.userParts ?? lastUser?.content
if (stored != null) processor.addUserMessage(stored)
```

Add to `ChatDeps` (`runtime.ts`): `attachmentExpanders: AttachmentExpanders` (import the type from `./run.js`).

- [ ] **Step 5: Build the expanders in `app.ts` (first-wins, matching the card collector)**

```ts
function buildAttachmentExpanders(extension: AnyExtension, context: unknown) {
  const entries: [string, (part: AttachmentDocumentPart) => Promise<readonly ContentPart[]>][] = []
  for (const attachment of extension.attachments ?? []) {
    const expand = attachment.__expand
    if (!expand) continue
    entries.push([attachment.mime, async (part) => expand(part, context)])
  }
  return entries
}
```

In the `mounted` map return add `attachmentExpanders: buildAttachmentExpanders(extension, context),`; assemble first-wins:

```ts
const attachmentExpanders: AttachmentExpanders = {}
for (const entry of mounted)
  for (const [mime, expand] of entry.attachmentExpanders) attachmentExpanders[mime] ??= expand
```

Pass into `chatDeps`. (Typing note: `attachment.__expand` on `AnyExtension` is `AttachmentExpand<never>`-flavored per Task 3's `AnyAttachmentBuilder`; calling it with `(part, context)` where context is `unknown` is exactly the same erasure `buildExtensionTools` does with `tool.__execute` — mirror however Task 3 resolved the variance so no cast is needed.)

- [ ] **Step 6: Run — Expected: PASS** (`pnpm turbo run test --filter=@conciv/core`), then `pnpm turbo run typecheck --filter=@conciv/core`.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(core): expand attachments at send, failure-safe, store rich parts" -- packages/core/src/chat/run.ts packages/core/src/chat/runtime.ts packages/core/src/app.ts packages/core/test/expand-attachments.test.ts
```

---

## Task 7: ui-kit — `partIsModelOnly` (primitives) + hide modelOnly parts

**Files:**

- Create: `packages/ui-kit-chat/src/primitives/message-part/part-visibility.ts`
- Modify: `packages/ui-kit-chat/src/primitives/message/message.tsx` (`DispatchPart`, `Attachments`)
- Modify: `packages/ui-kit-chat/src/index.tsx` (export)
- Test: `packages/ui-kit-chat/test/part-visibility.test.ts` (node — pure predicate)

**Interfaces:**

- Produces: `partIsModelOnly(part: MessagePart): boolean` in the **primitives** layer (styled may import primitives, never the reverse). `Message.Parts`/`DispatchPart` render nothing for modelOnly parts (covers keyframe `image` parts — without this they render inline via `MessagePart.Image`). `Message.Attachments` excludes modelOnly parts from its entries.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest'
import {partIsModelOnly} from '../src/primitives/message-part/part-visibility.js'

describe('partIsModelOnly', () => {
  it('detects the marker', () => {
    expect(partIsModelOnly({type: 'text', content: 'x', metadata: {modelOnly: true}})).toBe(true)
  })
  it('is false without the marker or with other metadata', () => {
    expect(partIsModelOnly({type: 'text', content: 'x'})).toBe(false)
    expect(partIsModelOnly({type: 'text', content: 'x', metadata: {other: 1}})).toBe(false)
  })
})
```

- [ ] **Step 2: Run — Expected: FAIL** (`pnpm turbo run test --filter=@conciv/ui-kit-chat`).

- [ ] **Step 3: Implement**

```ts
import type {MessagePart} from '@tanstack/ai-client'

export function partIsModelOnly(part: MessagePart): boolean {
  if (!('metadata' in part)) return false
  const metadata: unknown = part.metadata
  if (typeof metadata !== 'object' || metadata === null) return false
  return 'modelOnly' in metadata && metadata.modelOnly === true
}
```

In `message.tsx`: at the top of `DispatchPart`'s returned JSX add an outer `<Show when={!partIsModelOnly(part())} fallback={null}>`; in `Attachments`/`AttachmentByIndex`, extend the filter to `parts.filter((part) => isAttachmentPart(part) && !partIsModelOnly(part))`. Export `partIsModelOnly` from `index.tsx`.

- [ ] **Step 4: Run — Expected: PASS.**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui-kit-chat): modelOnly part visibility predicate + hidden in render" -- packages/ui-kit-chat/src/primitives/message-part/part-visibility.ts packages/ui-kit-chat/src/primitives/message/message.tsx packages/ui-kit-chat/src/index.tsx packages/ui-kit-chat/test/part-visibility.test.ts
```

---

## Task 8: ui-kit — `AttachmentByMime` + document adapter + composer dispatch site

**Files:**

- Create: `packages/ui-kit-chat/src/styled/attachment-dispatch.tsx`
- Modify: `packages/ui-kit-chat/src/styled/composer.tsx:16,42-51` (`AttachmentComponent` prop — the previously-unowned dispatch site)
- Modify: `packages/ui-kit-chat/src/index.tsx` (exports)
- Test: `apps/conciv/test/attachment-dispatch.browser.test.tsx` (the repo's only browser vitest project)

**Interfaces:**

- Consumes: `useAttachment`, `Attachment.Root`/`Attachment.Remove`, `AttachmentUI`, `fileToDataSource` (existing); `partIsModelOnly` (Task 7).
- Produces:
  - `type AttachmentCardSlot = {mime: string; render: ValidComponent}` — structural, defined **in ui-kit-chat** (no dep on `@conciv/extension`; `collectAttachmentCards`' entries are structurally assignable).
  - `AttachmentByMime(props: {cards: readonly AttachmentCardSlot[]; removable?: boolean}): JSX.Element` — matched card is wrapped in `Attachment.Root` with an `Attachment.Remove` overlay when `removable` (matched cards must stay removable in the composer); unmatched falls back to `AttachmentUI`.
  - `createDocumentAttachmentAdapter(mime: string): AttachmentAdapter`.
  - `ComposerProps.AttachmentComponent?: Component<{removable?: boolean}>` — `Composer` uses it in place of the hard-coded `RemovableAttachment`.

- [ ] **Step 1: Write the failing test**

```tsx
import {render} from 'solid-js/web'
import {afterEach, expect, test} from 'vitest'
import type {JSX} from 'solid-js'
import {AttachmentByMime, AttachmentProvider, type CompleteAttachment} from '@conciv/ui-kit-chat'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

function mount(element: () => JSX.Element): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = render(element, host)
  disposers.push(() => {
    dispose()
    host.remove()
  })
  return host
}

const complete: CompleteAttachment = {
  id: 'a',
  type: 'document',
  name: 'rec',
  contentType: 'application/x-test',
  status: {type: 'complete'},
  content: [{type: 'document', source: {type: 'data', mimeType: 'application/x-test', value: 'eyJ4IjoxfQ=='}}],
}

test('renders the matching card for a document mime', () => {
  const Card = (): JSX.Element => <div data-testid="card">player</div>
  const host = mount(() => (
    <AttachmentProvider value={complete}>
      <AttachmentByMime cards={[{mime: 'application/x-test', render: Card}]} />
    </AttachmentProvider>
  ))
  expect(host.querySelector('[data-testid="card"]')).not.toBeNull()
})

test('falls back to the generic tile for an unknown mime', () => {
  const host = mount(() => (
    <AttachmentProvider value={complete}>
      <AttachmentByMime cards={[]} />
    </AttachmentProvider>
  ))
  expect(host.querySelector('[aria-label="rec"]')).not.toBeNull()
})
```

(Harness copied from `apps/conciv/test/context-tracker.browser.test.tsx` — `solid-js/web` render + dispose, structural asserts. Root import only; `AttachmentProvider`/`CompleteAttachment` are already exported from the ui-kit index, `AttachmentByMime` is exported by this task. If `CompleteAttachment`'s content typing rejects the literal, type the fixture with a `satisfies`-free plain annotation and adjust the part literal — no casts.)

- [ ] **Step 2: Run — Expected: FAIL** (`pnpm turbo run test --filter=conciv`).

- [ ] **Step 3: Implement `attachment-dispatch.tsx`**

```tsx
import {Show, type JSX, type ValidComponent} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {X} from 'lucide-solid'
import {Attachment, useAttachment} from '../primitives/attachment/attachment.js'
import {AttachmentUI} from './attachment-ui.js'
import {
  fileToDataSource,
  type Attachment as AttachmentState,
  type AttachmentAdapter,
} from '../primitives/attachment/attachment-adapter.js'

export type AttachmentCardSlot = {mime: string; render: ValidComponent}

function attachmentMime(attachment: AttachmentState): string | undefined {
  if ('content' in attachment)
    for (const part of attachment.content)
      if (part.type === 'document' && part.source.type === 'data') return part.source.mimeType
  return attachment.contentType
}

export function AttachmentByMime(props: {cards: readonly AttachmentCardSlot[]; removable?: boolean}): JSX.Element {
  const attachment = useAttachment()
  const card = () => props.cards.find((entry) => entry.mime === attachmentMime(attachment))
  return (
    <Show when={card()} fallback={<AttachmentUI removable={props.removable} />}>
      {(entry) => (
        <Attachment.Root class="relative">
          <Dynamic component={entry().render} />
          <Show when={props.removable}>
            <Attachment.Remove class="absolute end-1 top-1 inline-flex items-center justify-center size-6 rounded-[var(--chat-radius-pill)] [background:var(--chat-panel)] [color:var(--chat-text-2)] shadow-[var(--chat-shadow-lg)] cursor-pointer hover:[color:var(--chat-danger)]">
              <X size={12} />
            </Attachment.Remove>
          </Show>
        </Attachment.Root>
      )}
    </Show>
  )
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

- [ ] **Step 4: Open the composer dispatch site**

In `styled/composer.tsx`: add `AttachmentComponent?: Component<{removable?: boolean}>` to `ComposerProps`; replace the hard-coded usage:

```tsx
<ComposerPrimitive.Attachments
  component={() => (
    <Show when={props.AttachmentComponent} fallback={<AttachmentUI removable />}>
      {(component) => <Dynamic component={component()} removable />}
    </Show>
  )}
/>
```

Delete `RemovableAttachment` if now unused. Export `AttachmentByMime`, `createDocumentAttachmentAdapter`, and `type AttachmentCardSlot` from `index.tsx`.

- [ ] **Step 5: Run — Expected: PASS** (`pnpm turbo run test --filter=conciv` browser project + `--filter=@conciv/ui-kit-chat` node suite still green).

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(ui-kit-chat): AttachmentByMime dispatch, document adapter, composer slot" -- packages/ui-kit-chat/src/styled/attachment-dispatch.tsx packages/ui-kit-chat/src/styled/composer.tsx packages/ui-kit-chat/src/index.tsx apps/conciv/test/attachment-dispatch.browser.test.tsx
```

---

## Task 9: Thread — user turn renders document attachments

**Files:**

- Modify: `packages/ui-kit-chat/src/styled/thread.tsx:31-53,174-200` (`ThreadProps`, `ThreadConfigContext`, `UserTurn`)
- Test: `apps/conciv/test/user-turn.browser.test.tsx`

**Interfaces:**

- Consumes: `AttachmentByMime`/`AttachmentCardSlot` (Task 8), `partIsModelOnly` behavior (Task 7), `Message.Attachments` (existing).
- Produces: `ThreadProps.attachmentCards?: readonly AttachmentCardSlot[]`; carried on `ThreadConfigContext` as `attachmentCards: () => readonly AttachmentCardSlot[]` (default `() => []`). `UserTurn` renders **Document attachments unconditionally** (unknown mime → generic tile via `AttachmentByMime` fallback — even with zero cards registered), Document slot **only** (images already render inline via `Message.Parts` → `MessagePart.Image`; wiring an Image slot would double-render them).

- [ ] **Step 1: Write the failing test**

Mount `Thread` inside a `ChatProvider` whose store holds one user message with parts `[text 'why?', document(mime 'application/x-test'), modelOnly text 'clicked save', modelOnly image]` — use the `solid-js/web` `render`+dispose harness from the Global Constraints (copy `context-tracker.browser.test.tsx`), mirror the chat-store seeding approach of `packages/ui-kit-chat/src/styled/thread.stories.tsx` for the message fixture, import everything from the `@conciv/ui-kit-chat` root. Assert structurally on the host element:

- with `attachmentCards=[{mime:'application/x-test', render: Card}]`: `host.querySelector('[data-testid="card"]')` non-null; `host.textContent` does NOT contain `'clicked save'`; no `<img>` in the host (modelOnly keyframe hidden); `host.textContent` contains `'why?'`.
- with `attachmentCards=[]`: the generic file tile renders (fallback, `[aria-label]` of the document attachment present), not nothing.

- [ ] **Step 2: Run — Expected: FAIL** (`pnpm turbo run test --filter=conciv`).

- [ ] **Step 3: Implement**

```tsx
function UserTurn(): JSX.Element {
  const config = useContext(ThreadConfigContext)
  const DocumentCard = () => <AttachmentByMime cards={config.attachmentCards()} />
  return (
    <>
      <TurnPrefix />
      <Message.If hasAttachments>
        <div class="flex flex-wrap gap-1 self-end">
          <Message.Attachments components={{Document: DocumentCard}} />
        </div>
      </Message.If>
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

Add `attachmentCards` to `ThreadConfig`, its default, the provider value (`attachmentCards: () => props.attachmentCards ?? []`), and `ThreadProps`.

- [ ] **Step 4: Run — Expected: PASS.**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui-kit-chat): user turn renders document attachment cards" -- packages/ui-kit-chat/src/styled/thread.tsx apps/conciv/test/user-turn.browser.test.tsx
```

---

## Task 10: Widget wiring

**Files:**

- Modify: `apps/conciv/src/chat/chat-pane.tsx:47-58,252,404,462-489`
- Test: `apps/conciv/test/attachment-widget.browser.test.tsx`

**Interfaces:**

- Consumes: `collectAttachmentCards` (Task 4), `createDocumentAttachmentAdapter`, `AttachmentByMime`, `ComposerProps.AttachmentComponent` (Task 8), `ThreadProps.attachmentCards` (Task 9).
- Produces: composer accepts every registered mime; composer chips and thread turns dispatch through the same card list.

- [ ] **Step 1: Write the failing test**

Browser test mounting `ChatPane` (or the widget) with a fixture extension instance whose attachment registers a Card with `data-testid="fixture-card"`; attach a File of the fixture mime; assert the card renders in the composer chip area; send; assert it renders in the transcript. Mirror an existing `apps/conciv` browser test's mounting approach.

- [ ] **Step 2: Run — Expected: FAIL** (`pnpm turbo run test --filter=conciv`).

- [ ] **Step 3: Implement**

```ts
const attachmentCards = createMemo(() => collectAttachmentCards(instances.map((instance) => instance.extension)))
const attachmentAdapter = createMemo(() => {
  const image = imageAttachmentAdapter(meta.data?.harness.imageInput)
  return composeAttachmentAdapters([
    ...(image ? [image] : []),
    TEXT_ATTACHMENT_ADAPTER,
    ...attachmentCards().map((entry) => createDocumentAttachmentAdapter(entry.mime)),
  ])
})
const PaneAttachment = (slotProps: {removable?: boolean}) => (
  <AttachmentByMime cards={attachmentCards()} removable={slotProps.removable} />
)
```

Pass `AttachmentComponent={PaneAttachment}` to `<Composer>`, `attachmentCards={attachmentCards()}` to `<Thread>`. Delete the now-dead `paneAttachmentAdapter` helper.

Also add the pre-send part-count gate in `onSend` (the contract caps `content` at 16 parts — `packages/contract/src/contract.ts:30`; without this, an over-attached message dies as an opaque server-side zod rejection):

```ts
const MAX_CONTENT_PARTS = 16

const onSend = (content: string | MultimodalContent) => {
  const text = contentText(content)
  const hasContent = typeof content === 'string' ? text.length > 0 : content.content.length > 0
  if (!hasContent || chat.isLoading() || compacting()) return
  if (typeof content !== 'string' && content.content.length > MAX_CONTENT_PARTS) {
    notify('Too many attachments — remove some and send again.')
    return
  }
  if (raw.connectionStatus() !== 'connected') return
  void send(typeof content === 'string' ? text : content)
}
```

(Gate note: this duplicates a bound the contract already enforces server-side — the protocol Task 1 test covers the schema; browser-driving 17 attachments to red-test a notify branch is disproportionate, so this guard ships untested by design. Flagged per the tests-must-fail rule; the schema bound itself IS test-covered.)

- [ ] **Step 4: Run — Expected: PASS.**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(widget): wire attachment cards + document adapters from extensions" -- apps/conciv/src/chat/chat-pane.tsx apps/conciv/test/attachment-widget.browser.test.tsx
```

---

## Task 11: End-to-end framework proof (core, no dependency cycle)

**Files:**

- Test: `packages/core/test/expand-attachments.it.test.ts`

**Interfaces:**

- Consumes: `makeApp` with `opts.extensions` + `opts.harness` (`app.ts:35-55`); a scripted harness from `@conciv/harness-testkit` (already a core devDep — do NOT add `@conciv/extension-testkit` to core, that edge is a workspace cycle).

- [ ] **Step 1: Write the failing test**

Build inline in the test: `defineAttachment({mime:'application/x-conciv-fixture'})` with `.server(() => [{type:'text', content:'fixture-expanded'}])`, wrapped in `defineExtension({name:'fixture', attachments:[attachment]}).server(() => ({context: {}}))`; a harness-testkit scripted adapter that captures the `messages` it receives. Call `makeApp({extensions:[fixture], harness: scripted, …})`, drive `send` with content `[text, document(fixture mime)]`, then assert:

- stored run messages (via the db) contain the document part AND the `modelOnly` `fixture-expanded` text part;
- the harness-captured messages contain `fixture-expanded` and NO document part.
  This is the real send path with a scripted-but-real adapter (the same "no mocks" posture as harness-testkit's other users).

- [ ] **Step 2: Run — Expected: FAIL** first (before Task 6 semantics are complete this asserts the full chain).
- [ ] **Step 3: Fix gaps** in the responsible task's files if the chain breaks anywhere.
- [ ] **Step 4: Run — Expected: PASS** (`pnpm turbo run test --filter=@conciv/core`).
- [ ] **Step 5: Commit**

```bash
git commit -m "test(core): end-to-end attachment expand fixture" -- packages/core/test/expand-attachments.it.test.ts
```

---

## Task 12: Whole-project gates + fallow

- [ ] **Step 1:** `pnpm typecheck` — Expected: no errors.
- [ ] **Step 2:** `pnpm turbo run test --force` — Expected: all pass (cached green masks regressions).
- [ ] **Step 3:** `pnpm exec fallow audit --changed-since main --format json` — fix anything INTRODUCED (confirm `hasImagePart`, `RemovableAttachment`, `paneAttachmentAdapter` have no stragglers).
- [ ] **Step 4: Commit** any fixes.

---

## Self-Review

**Spec coverage:** wire schema → T1; client send gap (review B1) → T2; builder + ctx typing (B-review M10) → T3/T4; durable fold → T5; Expand-at-send + failure fallback (design "never blocks", maintainer comment) → T6; modelOnly hiding incl. keyframe images (M5) → T7; mime dispatch + composer site (M4) + remove affordance → T8; unconditional document fallback (M5) → T9; widget wiring → T10; e2e without cycle (M6) → T11.

**Placeholder scan:** T9–T11 Step 1 reference existing mount harnesses by file (implementer reads them); all product-code steps carry complete code.

**Type consistency:** `AttachmentDocumentPart`/`AttachmentExpand<Ctx>`/`AttachmentCardEntry` (T3) consumed in T4/T6; `AttachmentCardSlot` (T8) structurally accepts `AttachmentCardEntry` — used in T8/T9/T10; `expandUserParts(content, expanders): Promise<UserContent>` single-array semantics consistent across T6 test/impl/T11; `attachmentCards` prop name identical in T9/T10; first-wins precedence identical in T4 collector and T6 assembly.
