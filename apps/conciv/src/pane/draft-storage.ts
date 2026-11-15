import {z} from 'zod'
import {DraftItemSchema, type DraftItem, type DraftRow} from '@conciv/contract'
import type {WebStorage} from '@conciv/storage-history'
import type {AppData} from '../data/app-data.js'
import type {SelectionOffsets} from './composer-input-adapter.js'
import type {DraftSink} from './pane-attachments.js'
import {durableNote, NoteContextItem, noteValue} from '../composer/note-schema.js'

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
  items: z.array(DraftItemSchema).catch([]),
})

type PersistedDraft = z.infer<typeof PersistedDraftSchema>

export type ServerDraft = {snapshot: WebStorage; selection: SelectionOffsets}

export type PaneDraftStorage = {
  storage: WebStorage
  noteSelection: (offsets: SelectionOffsets) => void
  restore: (apply: (restored: ServerDraft, edited: boolean) => void, signal: AbortSignal) => Promise<void>
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
  return draft.text === '' && draft.attachments.length === 0 && draft.items.length === 0
}

function clampSelection(offsets: SelectionOffsets | null, text: string): SelectionOffsets {
  if (!offsets) return {start: text.length, end: text.length}
  return {start: Math.min(offsets.start, text.length), end: Math.min(offsets.end, text.length)}
}

function serializeRow(row: DraftRow): string {
  return JSON.stringify({text: row.text, quote: null, attachments: row.attachments, items: row.items})
}

function durableItem(item: DraftItem): DraftItem {
  const note = NoteContextItem.safeParse(item.value)

  return note.success ? {key: item.key, value: noteValue(durableNote(note.data))} : item
}

function serverDraft(row: DraftRow): ServerDraft {
  const serialized = serializeRow({...row, items: row.items.map(durableItem)})
  return {
    snapshot: {getItem: () => serialized, setItem: () => {}},
    selection: clampSelection({start: row.selectionStart, end: row.selectionEnd}, row.text),
  }
}

export async function appendDraft(appData: AppData, sessionId: string, text: string): Promise<void> {
  const row = await appData.readDraft(sessionId).catch((error: unknown) => {
    console.error('[conciv] could not read the saved draft', error)
    return null
  })
  const nextText = row?.text ? `${row.text}\n${text}` : text
  await appData.saveDraft({
    sessionId,
    text: nextText,
    selectionStart: nextText.length,
    selectionEnd: nextText.length,
    attachments: row?.attachments ?? [],
    items: row?.items ?? [],
  })
}

export function draftCacheSink(appData: AppData, sessionId: string): DraftSink {
  let written = Promise.resolve()
  const keep = (write: () => Promise<void>): void => {
    written = written
      .then(write)
      .catch((error: unknown) => console.error('[conciv] could not keep the queued message as a draft', error))
  }
  return {
    insert: (text) => keep(() => appendDraft(appData, sessionId, text)),
    addFile: () => {},
  }
}

export function makeDraftStorage(appData: AppData, sessionId: string): PaneDraftStorage {
  let cache: string | null = null
  let selection: SelectionOffsets | null = null
  let writable = false
  const persist = (draft: PersistedDraft) => {
    const offsets = clampSelection(selection, draft.text)
    appData
      .saveDraft({
        sessionId,
        text: draft.text,
        selectionStart: offsets.start,
        selectionEnd: offsets.end,
        attachments: draft.attachments,
        items: draft.items,
      })
      .catch(() => undefined)
  }
  const cached = () => (cache === null ? null : parseDraft(cache))
  return {
    storage: {
      getItem: () => {
        const row = appData.cachedDraft(sessionId)
        return row ? serializeRow(row) : cache
      },
      setItem: (_key, value) => {
        const stored = cached()
        cache = value
        const parsed = parseDraft(value)
        if (!parsed || !writable) return
        if (isCleared(parsed) && stored && isCleared(stored)) return
        persist(parsed)
      },
    },
    noteSelection: (offsets) => {
      selection = offsets
    },
    restore: async (apply, signal) => {
      const row = await appData.readDraft(sessionId).catch((error: unknown) => {
        if (!signal.aborted) console.error('[conciv] could not read the saved draft', error)
        return null
      })
      if (signal.aborted) return
      const typed = cached()
      const cleared = typed !== null && isCleared(typed)
      try {
        if (row && !cleared) apply(serverDraft(row), typed !== null)
      } finally {
        writable = true
        if (typed && (row || !cleared)) persist(typed)
      }
    },
  }
}
