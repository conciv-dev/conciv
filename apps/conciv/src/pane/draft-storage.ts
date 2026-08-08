import {z} from 'zod'
import {debounce} from '@tanstack/pacer'
import type {RpcClient} from '@conciv/contract'
import type {WebStorage} from '@conciv/storage-history'
import type {SelectionOffsets} from './composer-input-adapter.js'

const WRITE_DELAY_MS = 300

const PersistedDraftSchema = z.object({
  text: z.string().catch(''),
  grabs: z.array(z.string()).catch([]),
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
    grabs: row?.grabs ?? [],
  })
}

export async function makeDraftStorage(rpc: RpcClient, sessionId: string): Promise<PaneDraftStorage> {
  const row = await rpc.drafts.get({sessionId}).catch(() => null)
  let cache = row ? JSON.stringify({text: row.text, quote: null, grabs: row.grabs, attachments: []}) : null
  let selection: SelectionOffsets | null = null
  const write = debounce(
    (draft: PersistedDraft) => {
      const offsets = clampSelection(selection, draft.text)
      void rpc.drafts
        .set({
          sessionId,
          text: draft.text,
          selectionStart: offsets.start,
          selectionEnd: offsets.end,
          grabs: draft.grabs,
        })
        .catch(() => {})
    },
    {wait: WRITE_DELAY_MS},
  )
  return {
    storage: {
      getItem: () => cache,
      setItem: (_key, value) => {
        cache = value
        const parsed = parseDraft(value)
        if (parsed) write(parsed)
      },
    },
    noteSelection: (offsets) => {
      selection = offsets
    },
    restoredSelection: row ? clampSelection({start: row.selectionStart, end: row.selectionEnd}, row.text) : undefined,
  }
}
