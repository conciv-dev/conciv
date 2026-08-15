import {z} from 'zod'
import type {WebStorage} from '@conciv/storage-history'
import {fileToDataSource, type Attachment, type PendingAttachment} from '../primitives/attachment/attachment-adapter.js'
import type {ComposerDraft} from '../primitives/composer/composer-context.js'

const MAX_PERSISTED_ATTACHMENT_CHARACTERS = 1_000_000

const PersistedAttachmentSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  contentType: z.string(),
  data: z.string(),
})

const PersistedDraftSchema = z.object({
  text: z.string().catch(''),
  quote: z.string().nullable().catch(null),
  attachments: z.array(PersistedAttachmentSchema).catch([]),
})

export type PersistedComposerDraft = z.infer<typeof PersistedDraftSchema>

type PersistedAttachment = z.infer<typeof PersistedAttachmentSchema>

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function decodeBytes(data: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(data)
    const bytes = new Uint8Array(new ArrayBuffer(binary.length))
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    return null
  }
}

function toPendingAttachment(persisted: PersistedAttachment): PendingAttachment[] {
  const bytes = decodeBytes(persisted.data)
  if (!bytes) return []
  return [
    {
      id: persisted.id,
      type: persisted.type,
      name: persisted.name,
      contentType: persisted.contentType,
      file: new File([bytes], persisted.name, {type: persisted.contentType}),
      status: {type: 'requires-action', reason: 'composer-send'},
    },
  ]
}

export function readComposerDraft(storage: WebStorage, key: string): ComposerDraft | null {
  const raw = storage.getItem(key)
  if (!raw) return null
  const parsed = PersistedDraftSchema.safeParse(parseJson(raw))
  if (!parsed.success) return null
  return {
    draft: parsed.data.text,
    quote: parsed.data.quote,
    attachments: parsed.data.attachments.flatMap(toPendingAttachment),
  }
}

async function encodeAttachment(attachment: Attachment, budget: number): Promise<PersistedAttachment[]> {
  if (!attachment.file) return []
  const source = await fileToDataSource(attachment.file).catch(() => null)
  if (!source || source.value.length > budget) return []
  return [
    {
      id: attachment.id,
      type: attachment.type,
      name: attachment.name,
      contentType: source.mimeType,
      data: source.value,
    },
  ]
}

async function encodeAttachments(attachments: readonly Attachment[]): Promise<PersistedAttachment[]> {
  const encoded: PersistedAttachment[] = []
  let budget = MAX_PERSISTED_ATTACHMENT_CHARACTERS
  for (const attachment of attachments) {
    const persisted = await encodeAttachment(attachment, budget)
    for (const entry of persisted) budget -= entry.data.length
    encoded.push(...persisted)
  }
  return encoded
}

export async function writeComposerDraft(storage: WebStorage, key: string, draft: ComposerDraft): Promise<void> {
  const payload: PersistedComposerDraft = {
    text: draft.draft,
    quote: draft.quote,
    attachments: await encodeAttachments(draft.attachments),
  }
  try {
    storage.setItem(key, JSON.stringify(payload))
  } catch {
    return
  }
}
