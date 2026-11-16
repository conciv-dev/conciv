import {z} from 'zod'
import {differenceBy, intersectionBy, isEqual} from 'es-toolkit'
import {untrack} from 'solid-js'
import {createStore, unwrap} from 'solid-js/store'
import type {DraftRow} from '@conciv/contract'
import type {AttachmentState, ComposerDraft, ComposerDraftWriter} from '@conciv/ui-kit-chat'
import {persistStore} from '../runtime/persistence/persist.js'
import {resolveBlobUrl, type DraftStore} from '../runtime/persistence/drafts.js'
import type {WebStorage} from '@conciv/storage-history'
import type {AppData, PendingDraftAttachment} from '../data/app-data.js'
import type {SelectionOffsets} from './composer-input-adapter.js'
import type {DraftSink} from './pane-attachments.js'
import {reconcileDraft, type DraftReconcile} from './draft-reconcile.js'

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

export type RestoredDraft = {snapshot: WebStorage; selection: SelectionOffsets; attachments: AttachmentState[]}

export type PaneDraftStorage = {
  storage: WebStorage
  writer: ComposerDraftWriter | undefined
  noteSelection: (offsets: SelectionOffsets) => void
  restore: (apply: (restored: RestoredDraft, edited: boolean) => void, signal: AbortSignal) => Promise<void>
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

const LocalAttachmentSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  contentType: z.string().optional(),
  blob: z.object({id: z.string()}).optional(),
})

const LocalDraftSchema = z.object({
  text: z.string(),
  selectionStart: z.number(),
  selectionEnd: z.number(),
  attachments: z.array(LocalAttachmentSchema),
  syncedAt: z.number().optional(),
})

type LocalAttachment = z.infer<typeof LocalAttachmentSchema>

type LocalDraft = z.infer<typeof LocalDraftSchema>

function parseLocalDraft(raw: string | null): LocalDraft | null {
  if (raw === null) return null
  const parsed = LocalDraftSchema.safeParse(JSON.parse(raw))
  if (parsed.success) return parsed.data
  console.error('[conciv] the local draft is not a draft, read as absent', parsed.error)
  return null
}

function rowLocalDraft(row: DraftRow): LocalDraft {
  return {
    text: row.text,
    selectionStart: row.selectionStart,
    selectionEnd: row.selectionEnd,
    attachments: row.attachments.map(({id, type, name, contentType}) => ({id, type, name, contentType})),
    syncedAt: row.updatedAt,
  }
}

function readLocalDraft(drafts: DraftStore, sessionId: string): Promise<LocalDraft | null> {
  return drafts
    .getItem(sessionId)
    .then(parseLocalDraft)
    .catch((error: unknown) => {
      console.error('[conciv] could not read the local draft', error)
      return null
    })
}

function chosenDraft(verdict: DraftReconcile, stored: LocalDraft | null, row: DraftRow | null): LocalDraft | null {
  if (verdict.kind === 'local') return stored
  if (verdict.kind === 'engine' && row) return rowLocalDraft(row)
  return null
}

async function readLocalFile(attachment: LocalAttachment): Promise<AttachmentState[]> {
  const blob = attachment.blob
  if (!blob) return []
  const url = await resolveBlobUrl(blob)
  if (!url) {
    console.error(`[conciv] the local draft has no bytes for ${attachment.name}`)
    return []
  }
  const bytes = await fetch(url).then((response) => response.blob())
  return [
    {
      id: attachment.id,
      type: attachment.type,
      name: attachment.name,
      contentType: attachment.contentType,
      blob: {id: blob.id, url},
      file: new File([bytes], attachment.name, {type: attachment.contentType ?? bytes.type}),
      status: {type: 'requires-action', reason: 'composer-send'},
    },
  ]
}

function readLocalFiles(attachment: LocalAttachment): Promise<AttachmentState[]> {
  return readLocalFile(attachment).catch((error: unknown) => {
    console.error(`[conciv] could not read ${attachment.name} from the local draft`, error)
    return []
  })
}

const NoLocalHydration = {getItem: () => null, setItem: () => {}, removeItem: () => {}}

function localAttachment(attachment: AttachmentState): LocalAttachment {
  const kept = {id: attachment.id, type: attachment.type, name: attachment.name, contentType: attachment.contentType}
  return attachment.blob ? {...kept, blob: {id: attachment.blob.id}} : kept
}

function sameAsRow(draft: LocalDraft, row: DraftRow | null | undefined): boolean {
  if (!row) return false
  return (
    row.text === draft.text &&
    row.selectionStart === draft.selectionStart &&
    row.selectionEnd === draft.selectionEnd &&
    isEqual(
      row.attachments.map((attachment) => attachment.id),
      draft.attachments.map((attachment) => attachment.id),
    )
  )
}

type LocalDraftWriter = {
  writer: ComposerDraftWriter
  typed: () => {text: string; attachments: readonly unknown[]} | null
  feed: () => void
  read: () => Promise<LocalDraft | null>
  settle: (verdict: DraftReconcile, stored: LocalDraft | null, row: DraftRow | null) => void
}

function makeLocalDraftWriter(
  appData: AppData,
  drafts: DraftStore,
  sessionId: string,
  selection: () => SelectionOffsets | null,
  writable: () => boolean,
): LocalDraftWriter {
  const [document, setDocument] = createStore<{draft: LocalDraft | null; files: PendingDraftAttachment[]}>({
    draft: null,
    files: [],
  })
  const feed = () => {
    const draft = document.draft
    if (!draft || !writable() || sameAsRow(draft, appData.cachedDraft(sessionId))) return
    const updatedAt = Date.now()
    void appData
      .saveDraft({
        sessionId,
        text: draft.text,
        selectionStart: draft.selectionStart,
        selectionEnd: draft.selectionEnd,
        attachments: [],
        pending: [...unwrap(document.files)],
        updatedAt,
      })
      .then((saved) => {
        if (saved) persisted.setStore('draft', 'syncedAt', updatedAt)
      })
  }
  const persisted = persistStore({
    store: document,
    setStore: setDocument,
    name: sessionId,
    storage: NoLocalHydration,
    serialize: (value) => JSON.stringify(value.draft),
    deserialize: () => ({draft: null, files: []}),
    write: (_value, serialized) => drafts.setDocument(sessionId, JSON.parse(serialized)).finally(feed),
  })
  const writer: ComposerDraftWriter = (_key, draft: ComposerDraft) => {
    const offsets = clampSelection(selection(), draft.draft)
    persisted.setStore(
      'files',
      draft.attachments.flatMap(({id, type, name, file}) => (file ? [{id, type, name, file}] : [])),
    )
    persisted.setStore('draft', {
      text: draft.draft,
      selectionStart: offsets.start,
      selectionEnd: offsets.end,
      attachments: draft.attachments.map(localAttachment),
      syncedAt: untrack(() => document.draft?.syncedAt),
    })
  }
  const read = () => readLocalDraft(drafts, sessionId)
  const settle = (verdict: DraftReconcile, stored: LocalDraft | null, row: DraftRow | null) => {
    if (verdict.kind === 'cleared' && !document.draft) {
      void drafts.removeItem(sessionId).catch((error: unknown) => {
        console.error('[conciv] could not clear the local draft the engine dropped', error)
      })
      return
    }
    const base = chosenDraft(verdict, stored, row)
    if (!base) return
    if (document.draft) return persisted.setStore('draft', 'syncedAt', base.syncedAt)
    persisted.setStore('draft', base)
  }
  return {writer, typed: () => document.draft, feed, read, settle}
}

function serializeDraft(text: string, attachments: DraftRow['attachments']): string {
  return JSON.stringify({text, quote: null, attachments})
}

function serializeRow(row: DraftRow): string {
  return serializeDraft(row.text, row.attachments)
}

function restoredDraft(
  text: string,
  offsets: SelectionOffsets,
  encoded: DraftRow['attachments'],
  attachments: AttachmentState[],
): RestoredDraft {
  const serialized = serializeDraft(text, encoded)
  return {
    snapshot: {getItem: () => serialized, setItem: () => {}},
    selection: clampSelection(offsets, text),
    attachments,
  }
}

async function readRestoredDraft(
  verdict: DraftReconcile,
  stored: LocalDraft | null,
  row: DraftRow | null,
): Promise<RestoredDraft | null> {
  if (verdict.kind === 'engine' && row) {
    return restoredDraft(row.text, {start: row.selectionStart, end: row.selectionEnd}, row.attachments, [])
  }
  if (verdict.kind !== 'local' || !stored) return null
  const kept = (await Promise.all(stored.attachments.map(readLocalFiles))).flat()
  const missing = differenceBy(stored.attachments, kept, (attachment) => attachment.id)
  const fromRow = intersectionBy(row?.attachments ?? [], missing, (attachment) => attachment.id)
  return restoredDraft(stored.text, {start: stored.selectionStart, end: stored.selectionEnd}, fromRow, kept)
}

type DraftPlace = 'first' | 'last'

const EMPTY_LOCAL_DRAFT: LocalDraft = {text: '', selectionStart: 0, selectionEnd: 0, attachments: []}

function isEmptied(typed: {text: string; attachments: readonly unknown[]}): boolean {
  return typed.text === '' && typed.attachments.length === 0
}

async function readKeptBase(
  appData: AppData,
  sessionId: string,
): Promise<{base: LocalDraft; encoded: DraftRow['attachments']}> {
  const stored = appData.drafts ? await readLocalDraft(appData.drafts, sessionId) : null
  if (!stored) {
    const row = await appData.readDraft(sessionId).catch((error: unknown) => {
      console.error('[conciv] could not read the saved draft', error)
      return null
    })
    return row ? {base: rowLocalDraft(row), encoded: row.attachments} : {base: EMPTY_LOCAL_DRAFT, encoded: []}
  }
  const row = appData.cachedDraft(sessionId)
  const encoded = row?.attachments ?? []
  if (stored.syncedAt !== undefined && row === null) return {base: EMPTY_LOCAL_DRAFT, encoded}
  return {base: stored, encoded}
}

function joinReturned(saved: string, text: string, place: DraftPlace): {text: string; caret: number} {
  if (saved === '') return {text, caret: text.length}
  if (place === 'first') return {text: `${text}\n${saved}`, caret: text.length}
  const joined = `${saved}\n${text}`
  return {text: joined, caret: joined.length}
}

function keepLocally(drafts: DraftStore, sessionId: string, draft: LocalDraft): Promise<void> {
  return drafts.setDocument(sessionId, draft).catch((error: unknown) => {
    console.error('[conciv] could not keep the returned text in the local draft', error)
  })
}

async function keepInDraft(appData: AppData, sessionId: string, text: string, place: DraftPlace): Promise<void> {
  const drafts = appData.drafts
  const {base, encoded} = await readKeptBase(appData, sessionId)
  const {text: nextText, caret} = joinReturned(base.text, text, place)
  const selection = {text: nextText, selectionStart: caret, selectionEnd: caret}
  if (drafts) await keepLocally(drafts, sessionId, {...base, ...selection})
  const saving = appData.saveDraft({sessionId, ...selection, attachments: encoded, updatedAt: Date.now()})
  if (!drafts) await saving
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
  const persistTyped = () => {
    if (local) return local.feed()
    const typed = cached()
    if (typed) persist(typed)
  }
  const savedAlready = (draft: PersistedDraft): boolean => {
    const saved = appData.cachedDraft(sessionId)
    if (!saved) return false
    const {updatedAt: _updatedAt, ...savedRow} = saved
    return isEqual(savedRow, draftRow(draft))
  }
  const cached = () => (cache === null ? null : parseDraft(cache))
  const local = appData.drafts
    ? makeLocalDraftWriter(
        appData,
        appData.drafts,
        sessionId,
        () => selection,
        () => writable,
      )
    : undefined
  const typedDraft = () => (local ? local.typed() : cached())
  const readStored = () => (local ? local.read() : Promise.resolve(null))
  const land = (
    settle: () => void,
    restored: RestoredDraft | null,
    row: DraftRow | null,
    apply: (restored: RestoredDraft, edited: boolean) => void,
  ) => {
    const typed = typedDraft()
    const cleared = typed !== null && isEmptied(typed)
    try {
      settle()
      if (restored && !cleared) apply(restored, typed !== null)
    } finally {
      writable = true
      if (typed && (row || !cleared)) persistTyped()
    }
  }
  const readRow = (signal: AbortSignal) =>
    appData.readDraft(sessionId).catch((error: unknown) => {
      if (!signal.aborted) console.error('[conciv] could not read the saved draft', error)
      return null
    })
  return {
    writer: local?.writer,
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
      const [row, stored] = await Promise.all([readRow(signal), readStored()])
      if (signal.aborted) return
      const verdict = reconcileDraft(stored, row, sameAsRow)
      const restored = await readRestoredDraft(verdict, stored, row)
      if (signal.aborted) return
      land(() => local?.settle(verdict, stored, row), restored, row, apply)
    },
  }
}
