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

type DraftRow = NonNullable<Awaited<ReturnType<RpcClient['drafts']['get']>>>

export type ServerDraft = {snapshot: WebStorage; text: string; selection: SelectionOffsets}

export type PaneDraftStorage = {
  storage: WebStorage
  noteSelection: (offsets: SelectionOffsets) => void
  restore: (apply: (restored: ServerDraft) => void, signal: AbortSignal) => Promise<void>
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

function serverDraft(row: DraftRow): ServerDraft {
  const serialized = JSON.stringify({text: row.text, quote: null, attachments: row.attachments})
  return {
    snapshot: {getItem: () => serialized, setItem: () => {}},
    text: row.text,
    selection: clampSelection({start: row.selectionStart, end: row.selectionEnd}, row.text),
  }
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

export function makeDraftStorage(rpc: RpcClient, sessionId: string): PaneDraftStorage {
  let cache: string | null = null
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
      .catch((error: unknown) => {
        console.error('[conciv] could not save the draft', error)
      })
  }
  const write = new Debouncer(persist, {wait: WRITE_DELAY_MS, enabled: false})
  const cached = () => (cache === null ? null : parseDraft(cache))
  return {
    storage: {
      getItem: () => cache,
      setItem: (_key, value) => {
        const stored = cached()
        cache = value
        const parsed = parseDraft(value)
        if (!parsed) return
        if (!isCleared(parsed)) {
          write.maybeExecute(parsed)
          return
        }
        write.cancel()
        if (!stored || isCleared(stored)) return
        write.maybeExecute(parsed)
        write.flush()
      },
    },
    noteSelection: (offsets) => {
      selection = offsets
    },
    restore: async (apply, signal) => {
      const row = await rpc.drafts.get({sessionId}, {signal}).catch((error: unknown) => {
        if (!signal.aborted) console.error('[conciv] could not read the saved draft', error)
        return null
      })
      if (signal.aborted) return
      const typed = cached()
      const cleared = typed !== null && isCleared(typed)
      try {
        if (row && !cleared) apply(serverDraft(row))
      } finally {
        write.setOptions({enabled: true})
        if (typed && (row || !cleared)) write.maybeExecute(typed)
        if (cleared) write.flush()
      }
    },
  }
}
