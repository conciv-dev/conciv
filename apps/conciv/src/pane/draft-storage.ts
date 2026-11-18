import {z} from 'zod'
import {Mutex, keyBy, uniqBy} from 'es-toolkit'
import type {DraftRow} from '@conciv/contract'
import {DraftItemSchema, type DraftItem} from '@conciv/protocol/chat-types'
import type {WebStorage} from '@conciv/storage-history'
import type {AppData} from '../data/app-data.js'
import type {SelectionOffsets} from './composer-input-adapter.js'
import type {DraftSink} from './pane-attachments.js'
import {decodeNotes, durableNote, noteValue} from '../composer/note-schema.js'

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

const ClaimsNoteSchema = z.object({type: z.literal('note')})

function durableItems(items: readonly DraftItem[]): DraftItem[] {
  const notes = keyBy(decodeNotes(items), (entry) => entry.key)

  return items.flatMap((item) => {
    const note = notes[item.key]

    if (note) return [{key: item.key, value: noteValue(durableNote(note.note))}]

    return ClaimsNoteSchema.safeParse(item.value).success ? [] : [item]
  })
}

function serializeRow(row: DraftRow): string {
  return JSON.stringify({
    text: row.text,
    quote: null,
    attachments: row.attachments,
    items: durableItems(row.items),
  })
}

function serverDraft(row: DraftRow): ServerDraft {
  const serialized = serializeRow(row)
  return {
    snapshot: {getItem: () => serialized, setItem: () => {}},
    selection: clampSelection({start: row.selectionStart, end: row.selectionEnd}, row.text),
  }
}

type DraftPlace = 'first' | 'last'

function joinDraftText(saved: string, text: string, place: DraftPlace): string {
  if (saved === '') return text
  if (text === '') return saved
  return place === 'first' ? `${text}\n${saved}` : `${saved}\n${text}`
}

export type SavedDraft = {
  readonly text: string
  readonly selection: SelectionOffsets
  readonly items: readonly DraftItem[]
}

async function saveEditedDraft(
  appData: AppData,
  sessionId: string,
  edit: (draft: SavedDraft) => SavedDraft,
): Promise<void> {
  const row = await appData.readDraft(sessionId).catch((error: unknown) => {
    console.error('[conciv] could not read the saved draft', error)
    return null
  })
  const text = row?.text ?? ''
  const edited = edit({
    text,
    selection: clampSelection(row ? {start: row.selectionStart, end: row.selectionEnd} : null, text),
    items: row?.items ?? [],
  })
  await appData.saveDraft({
    sessionId,
    text: edited.text,
    selectionStart: edited.selection.start,
    selectionEnd: edited.selection.end,
    attachments: row?.attachments ?? [],
    items: [...edited.items],
  })
}

const keptDraftLock = new Mutex()

export async function editDraft(
  appData: AppData,
  sessionId: string,
  edit: (draft: SavedDraft) => SavedDraft,
): Promise<void> {
  await keptDraftLock.acquire()
  try {
    await saveEditedDraft(appData, sessionId, edit)
  } finally {
    keptDraftLock.release()
  }
}

function keepInDraft(
  appData: AppData,
  sessionId: string,
  kept: {text: string; items: readonly DraftItem[]},
  place: DraftPlace,
): Promise<void> {
  return editDraft(appData, sessionId, (draft) => {
    const text = joinDraftText(draft.text, kept.text, place)
    const caret = place === 'first' ? kept.text.length : text.length

    return {
      text,
      selection: {start: caret, end: caret},
      items: uniqBy([...draft.items, ...kept.items], (item) => item.key),
    }
  })
}

export function appendDraft(
  appData: AppData,
  sessionId: string,
  text: string,
  items: readonly DraftItem[] = [],
): Promise<void> {
  return keepInDraft(appData, sessionId, {text, items}, 'last')
}

export function prependDraft(
  appData: AppData,
  sessionId: string,
  text: string,
  items: readonly DraftItem[] = [],
): Promise<void> {
  return keepInDraft(appData, sessionId, {text, items}, 'first')
}

type DraftWrite = (appData: AppData, sessionId: string, text: string, items?: readonly DraftItem[]) => Promise<void>

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
    addItem: (item) => keep(() => write(appData, sessionId, '', [item])),
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
