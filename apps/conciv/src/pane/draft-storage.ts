import {z} from 'zod'
import {Debouncer} from '@tanstack/pacer'
import type {RpcClient} from '@conciv/contract'
import type {WebStorage} from '@conciv/storage-history'
import type {SelectionOffsets} from './composer-input-adapter.js'

const WRITE_DELAY_MS = 300

const PersistedAttachmentSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  contentType: z.string(),
  data: z.string(),
})

const PersistedDraftSchema = z.object({
  text: z.string().catch(''),
  attachments: z.array(PersistedAttachmentSchema).catch([]),
})

type PersistedDraft = z.infer<typeof PersistedDraftSchema>

export type PaneDraftStorage = {
  storage: WebStorage
  noteSelection: (offsets: SelectionOffsets) => void
  restoredSelection: SelectionOffsets | undefined
}

function parseDraft(raw: string): PersistedDraft | null {
  try {
    const parsed = PersistedDraftSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function isCleared(draft: PersistedDraft): boolean {
  return draft.text === '' && draft.attachments.length === 0
}

function clampSelection(offsets: SelectionOffsets | null, text: string): SelectionOffsets {
  if (!offsets) return {start: text.length, end: text.length}
  return {start: Math.min(offsets.start, text.length), end: Math.min(offsets.end, text.length)}
}

export async function appendDraft(rpc: RpcClient, sessionId: string, text: string): Promise<void> {
  const row = await rpc.drafts.get({sessionId})
  const nextText = row?.text ? `${row.text}\n${text}` : text
  await rpc.drafts.set({
    sessionId,
    text: nextText,
    selectionStart: nextText.length,
    selectionEnd: nextText.length,
    attachments: row?.attachments ?? [],
  })
}

export async function makeDraftStorage(rpc: RpcClient, sessionId: string): Promise<PaneDraftStorage> {
  const row = await rpc.drafts.get({sessionId}).catch(() => null)
  let cache = row ? JSON.stringify({text: row.text, quote: null, attachments: row.attachments}) : null
  let selection: SelectionOffsets | null = null
  const persist = (draft: PersistedDraft) => {
    const offsets = clampSelection(selection, draft.text)
    void rpc.drafts
      .set({
        sessionId,
        text: draft.text,
        selectionStart: offsets.start,
        selectionEnd: offsets.end,
        attachments: draft.attachments,
      })
      .catch(() => {})
  }
  const write = new Debouncer(persist, {wait: WRITE_DELAY_MS})
  return {
    storage: {
      getItem: () => cache,
      setItem: (_key, value) => {
        const stored = cache === null ? null : parseDraft(cache)
        cache = value
        const parsed = parseDraft(value)
        if (!parsed) return
        if (!isCleared(parsed)) {
          write.maybeExecute(parsed)
          return
        }
        write.cancel()
        if (stored && !isCleared(stored)) persist(parsed)
      },
    },
    noteSelection: (offsets) => {
      selection = offsets
    },
    restoredSelection: row ? clampSelection({start: row.selectionStart, end: row.selectionEnd}, row.text) : undefined,
  }
}
