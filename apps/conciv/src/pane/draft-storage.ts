import {z} from 'zod'
import {isEqual} from 'es-toolkit'
import type {DraftRow} from '@conciv/contract'
import type {WebStorage} from '@conciv/storage-history'
import type {AppData} from '../data/app-data.js'
import type {SelectionOffsets} from './composer-input-adapter.js'
import type {DraftSink} from './pane-attachments.js'

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
  return draft.text === '' && draft.attachments.length === 0
}

function clampSelection(offsets: SelectionOffsets | null, text: string): SelectionOffsets {
  if (!offsets) return {start: text.length, end: text.length}
  return {start: Math.min(offsets.start, text.length), end: Math.min(offsets.end, text.length)}
}

function serializeRow(row: DraftRow): string {
  return JSON.stringify({text: row.text, quote: null, attachments: row.attachments})
}

function serverDraft(row: DraftRow): ServerDraft {
  const serialized = serializeRow(row)
  return {
    snapshot: {getItem: () => serialized, setItem: () => {}},
    selection: clampSelection({start: row.selectionStart, end: row.selectionEnd}, row.text),
  }
}

type DraftPlace = 'first' | 'last'

async function keepInDraft(appData: AppData, sessionId: string, text: string, place: DraftPlace): Promise<void> {
  const row = await appData.readDraft(sessionId).catch((error: unknown) => {
    console.error('[conciv] could not read the saved draft', error)
    return null
  })
  const saved = row?.text ?? ''
  const nextText = saved === '' ? text : place === 'first' ? `${text}\n${saved}` : `${saved}\n${text}`
  const caret = place === 'first' ? text.length : nextText.length
  await appData.saveDraft({
    sessionId,
    text: nextText,
    selectionStart: caret,
    selectionEnd: caret,
    attachments: row?.attachments ?? [],
    updatedAt: Date.now(),
  })
}

export function appendDraft(appData: AppData, sessionId: string, text: string): Promise<void> {
  return keepInDraft(appData, sessionId, text, 'last')
}

export function prependDraft(appData: AppData, sessionId: string, text: string): Promise<void> {
  return keepInDraft(appData, sessionId, text, 'first')
}

type DraftWrite = (appData: AppData, sessionId: string, text: string) => Promise<void>

export type DraftWriteChain = (write: () => Promise<void>) => void

export function makeDraftWriteChain(): DraftWriteChain {
  let written = Promise.resolve()
  return (write) => {
    written = written
      .then(write)
      .catch((error: unknown) => console.error('[conciv] could not keep the queued message as a draft', error))
  }
}

export function draftCacheSink(
  keep: DraftWriteChain,
  appData: AppData,
  sessionId: string,
  write: DraftWrite,
): DraftSink {
  return {
    insert: (text) => keep(() => write(appData, sessionId, text)),
    addFile: () => {},
  }
}

export function makeDraftStorage(appData: AppData, sessionId: string): PaneDraftStorage {
  let cache: string | null = null
  let selection: SelectionOffsets | null = null
  let writable = false
  const draftRow = (draft: PersistedDraft) => {
    const offsets = clampSelection(selection, draft.text)
    return {
      sessionId,
      text: draft.text,
      selectionStart: offsets.start,
      selectionEnd: offsets.end,
      attachments: draft.attachments,
    }
  }
  const persist = (draft: PersistedDraft) => {
    void appData.saveDraft({...draftRow(draft), updatedAt: Date.now()})
  }
  const savedAlready = (draft: PersistedDraft): boolean => {
    const saved = appData.cachedDraft(sessionId)
    if (!saved) return false
    const {updatedAt: _updatedAt, ...savedRow} = saved
    return isEqual(savedRow, draftRow(draft))
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
        if (savedAlready(parsed)) return
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
