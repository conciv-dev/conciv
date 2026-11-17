import {z} from 'zod'
import {differenceBy, intersectionBy, isEqual, keyBy, union, without} from 'es-toolkit'
import {untrack} from 'solid-js'
import {createStore, unwrap} from 'solid-js/store'
import type {DraftRow} from '@conciv/contract'
import type {AttachmentState, ComposerDraft, ComposerDraftWriter} from '@conciv/ui-kit-chat'
import {encodeAttachments} from '@conciv/ui-kit-chat/draft-storage'
import {persistStore} from '../runtime/persistence/persist.js'
import {resolveBlobUrl, type BlobReference, type DraftStore} from '../runtime/persistence/drafts.js'
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

export type DraftApplyMode = 'fill' | 'merge' | 'replace'

export type DraftApply = (restored: RestoredDraft, mode: DraftApplyMode) => void

export type PaneDraftStorage = {
  storage: WebStorage
  writer: ComposerDraftWriter | undefined
  noteSelection: (offsets: SelectionOffsets) => void
  restore: (apply: DraftApply, signal: AbortSignal) => Promise<void>
  retry: () => void
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
  sent: z.array(z.number()).default([]),
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
    sent: [],
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

const MAX_INLINE_BYTES = 20 * 1024 * 1024

const NoLocalHydration = {getItem: () => null, setItem: () => {}, removeItem: () => {}}

function localAttachment(attachment: AttachmentState): LocalAttachment {
  const kept = {id: attachment.id, type: attachment.type, name: attachment.name, contentType: attachment.contentType}
  return attachment.blob ? {...kept, blob: {id: attachment.blob.id}} : kept
}

type DraftRowContent = Pick<DraftRow, 'text' | 'selectionStart' | 'selectionEnd'> & {
  attachments: readonly {id: string}[]
}

function sameAsRow(draft: DraftRowContent, row: DraftRow | null | undefined): boolean {
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

function sendableAttachments(
  draft: LocalDraft,
  filed: readonly {id: string}[],
  encoded: DraftRow['attachments'],
  row: DraftRow | null | undefined,
): DraftRow['attachments'] {
  const unfiled = differenceBy(draft.attachments, filed, (attachment) => attachment.id)
  const held = intersectionBy(row?.attachments ?? [], unfiled, (attachment) => attachment.id)
  const byId = keyBy([...held, ...encoded], (attachment) => attachment.id)
  return draft.attachments.flatMap((attachment) => byId[attachment.id] ?? [])
}

type LocalDraftWriter = {
  writer: ComposerDraftWriter
  typed: () => DraftContent | null
  feed: () => void
  resend: () => void
  read: () => Promise<LocalDraft | null>
  takeStored: (stored: LocalDraft) => void
  settle: (verdict: DraftReconcile, row: DraftRow | null, edited: boolean) => void
}

function makeLocalDraftWriter(
  appData: AppData,
  drafts: DraftStore,
  sessionId: string,
  selection: () => SelectionOffsets | null,
  sendable: () => boolean,
): LocalDraftWriter {
  const [document, setDocument] = createStore<{draft: LocalDraft | null; files: PendingDraftAttachment[]}>({
    draft: null,
    files: [],
  })
  const send = (recorded: LocalDraft, attachments: DraftRow['attachments']) => {
    const current = document.draft
    if (!current || appData.sessionDeleted(sessionId)) return
    const updatedAt = Date.now()
    persisted.setStore('draft', 'sent', (sent) => union(sent, [updatedAt]))
    void keepLocally(drafts, sessionId, structuredClone(unwrap(current)))
      .then(() =>
        appData.saveDraft({
          sessionId,
          text: recorded.text,
          selectionStart: recorded.selectionStart,
          selectionEnd: recorded.selectionEnd,
          attachments,
          updatedAt,
        }),
      )
      .then((saved) => {
        persisted.setStore('draft', (latest) => latest && settledDraft(latest, updatedAt, saved))
      })
  }
  const sendChanged = (
    recorded: LocalDraft,
    attachments: DraftRow['attachments'],
    row: DraftRow | null | undefined,
  ) => {
    if (sameAsRow({...recorded, attachments}, row)) return
    if (row === null && isEmptied(recorded)) return
    send(recorded, attachments)
  }
  const encoded = (
    then: (recorded: LocalDraft, attachments: DraftRow['attachments'], row: DraftRow | null | undefined) => void,
  ) => {
    const draft = document.draft
    if (!draft || appData.sessionDeleted(sessionId)) return
    const recorded = structuredClone(unwrap(draft))
    const files = [...unwrap(document.files)]
    void encodeAttachments(files).then((encodedFiles) => {
      const row = appData.cachedDraft(sessionId)
      then(recorded, sendableAttachments(recorded, files, encodedFiles, row), row)
    })
  }
  const feed = () => {
    if (sendable()) encoded(sendChanged)
  }
  const resend = () => encoded(send)
  const persisted = persistStore({
    store: document,
    setStore: setDocument,
    name: sessionId,
    storage: NoLocalHydration,
    serialize: (value) => JSON.stringify(value.draft),
    deserialize: () => ({draft: null, files: []}),
    write: (_value, serialized) =>
      appData.sessionDeleted(sessionId)
        ? Promise.resolve()
        : drafts.setDocument(sessionId, JSON.parse(serialized)).finally(feed),
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
      sent: untrack(() => document.draft?.sent ?? []),
    })
  }
  const read = () => readLocalDraft(drafts, sessionId)
  const takeStored = (stored: LocalDraft) => {
    if (document.draft) return persisted.setStore('draft', 'syncedAt', stored.syncedAt)
    persisted.setStore('draft', structuredClone(stored))
  }
  const settle = (verdict: DraftReconcile, row: DraftRow | null, edited: boolean) => {
    if (!edited && verdict.kind === 'cleared') return persisted.setStore('draft', structuredClone(EMPTY_LOCAL_DRAFT))
    if (!edited && verdict.kind === 'engine' && row) return persisted.setStore('draft', rowLocalDraft(row))
    if (!document.draft) return
    if (verdict.kind === 'cleared') return persisted.setStore('draft', 'syncedAt', undefined)
    if (row) persisted.setStore('draft', 'syncedAt', row.updatedAt)
  }
  return {writer, typed: () => document.draft, feed, resend, read, takeStored, settle}
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

async function readKeptFiles(stored: LocalDraft | null): Promise<AttachmentState[]> {
  if (!stored) return []
  return (await Promise.all(stored.attachments.map(readLocalFiles))).flat()
}

function localRestored(stored: LocalDraft, kept: AttachmentState[], row: DraftRow | null): RestoredDraft {
  const missing = differenceBy(stored.attachments, kept, (attachment) => attachment.id)
  const fromRow = intersectionBy(row?.attachments ?? [], missing, (attachment) => attachment.id)
  return restoredDraft(stored.text, {start: stored.selectionStart, end: stored.selectionEnd}, fromRow, kept)
}

const CLEARED_DRAFT = restoredDraft('', {start: 0, end: 0}, [], [])

function rowRestored(
  verdict: DraftReconcile,
  stored: LocalDraft | null,
  kept: AttachmentState[],
  row: DraftRow | null,
): RestoredDraft | null {
  if (verdict.kind === 'engine' && row) {
    return restoredDraft(row.text, {start: row.selectionStart, end: row.selectionEnd}, row.attachments, [])
  }
  if (verdict.kind === 'cleared') return CLEARED_DRAFT
  if (verdict.kind === 'local' && stored) return localRestored(stored, kept, row)
  return null
}

function applyMode(verdict: DraftReconcile, edited: boolean, shown: LocalDraft | null): DraftApplyMode {
  if (edited) return 'merge'
  if (shown && (verdict.kind === 'engine' || verdict.kind === 'cleared')) return 'replace'
  return 'fill'
}

type DraftPlace = 'first' | 'last'

type RestorePhase = {kind: 'reading'} | {kind: 'unread'; shown: LocalDraft | null} | {kind: 'read'}

type DraftContent = {text: string; attachments: readonly {id: string}[]}

export function sameContent(draft: DraftContent, other: DraftContent): boolean {
  return (
    draft.text === other.text &&
    isEqual(
      draft.attachments.map((attachment) => attachment.id),
      other.attachments.map((attachment) => attachment.id),
    )
  )
}

function typedSince(typed: DraftContent | null, shown: DraftContent | null): boolean {
  if (!typed) return false
  return !shown || !sameContent(typed, shown)
}

function maySend(phase: RestorePhase, typed: DraftContent | null): boolean {
  if (phase.kind === 'unread') return typedSince(typed, phase.shown)
  return phase.kind === 'read'
}

const EMPTY_LOCAL_DRAFT: LocalDraft = {text: '', selectionStart: 0, selectionEnd: 0, attachments: [], sent: []}

function settledDraft(draft: LocalDraft, updatedAt: number, saved: boolean): LocalDraft {
  if (!saved) return {...draft, sent: without(draft.sent, updatedAt)}
  return {...draft, syncedAt: updatedAt, sent: draft.sent.slice(draft.sent.indexOf(updatedAt) + 1)}
}

function withSent(draft: LocalDraft, updatedAt: number): LocalDraft {
  return {...draft, sent: union(draft.sent, [updatedAt])}
}

function isEmptied(typed: DraftContent): boolean {
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
  const updatedAt = Date.now()
  if (drafts) await keepLocally(drafts, sessionId, withSent({...base, ...selection}, updatedAt))
  const saving = appData.saveDraft({sessionId, ...selection, attachments: encoded, updatedAt})
  if (!drafts) await saving
}

export async function keepDraftImage(drafts: DraftStore, file: File): Promise<BlobReference | undefined> {
  if (file.size > MAX_INLINE_BYTES) {
    console.warn(`[conciv] ${file.name} is over ${MAX_INLINE_BYTES} bytes, so the local draft keeps no copy of it`)
    return undefined
  }
  return drafts.putBlob(file).catch((error: unknown) => {
    console.error('[conciv] could not keep the attached image in the local draft store', error)
    return undefined
  })
}

async function keepImageInDraft(appData: AppData, sessionId: string, file: File): Promise<void> {
  const drafts = appData.drafts
  const {base, encoded} = await readKeptBase(appData, sessionId)
  const attachment = {id: crypto.randomUUID(), type: 'image', name: file.name}
  const updatedAt = Date.now()
  if (drafts) {
    const blob = await keepDraftImage(drafts, file)
    const local = {...attachment, contentType: file.type}
    const kept = blob ? {...local, blob: {id: blob.id}} : local
    await keepLocally(drafts, sessionId, withSent({...base, attachments: [...base.attachments, kept]}, updatedAt))
  }
  const {text, selectionStart, selectionEnd} = base
  const added = await encodeAttachments([{...attachment, file}])
  const saving = appData.saveDraft({
    sessionId,
    text,
    selectionStart,
    selectionEnd,
    attachments: [...encoded, ...added],
    updatedAt,
  })
  if (!drafts) await saving
}

export async function readMovedDraft(appData: AppData, sessionId: string): Promise<string> {
  const stored = appData.drafts ? await readLocalDraft(appData.drafts, sessionId) : null
  if (stored) return stored.text
  return (await appData.readDraft(sessionId))?.text ?? ''
}

export async function clearMovedDraft(appData: AppData, sessionId: string): Promise<void> {
  await appData.drafts?.removeItem(sessionId).catch((error: unknown) => {
    console.error('[conciv] could not remove the local draft of the deleted session', error)
  })
  await appData.saveDraft({
    sessionId,
    text: '',
    selectionStart: 0,
    selectionEnd: 0,
    attachments: [],
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
    addFile: (file) => keep(() => keepImageInDraft(appData, sessionId, file)),
  }
}

export function makeDraftStorage(appData: AppData, sessionId: string): PaneDraftStorage {
  let cache: string | null = null
  let selection: SelectionOffsets | null = null
  let phase: RestorePhase = {kind: 'reading'}
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
        () => mayPersist(),
      )
    : undefined
  const typedDraft = (): DraftContent | null => (local ? local.typed() : cached())
  const mayPersist = (): boolean => maySend(phase, typedDraft())
  const readStored = () => (local ? local.read() : Promise.resolve(null))
  const show = (stored: LocalDraft | null, kept: AttachmentState[], apply: DraftApply): LocalDraft | null => {
    if (!stored || !local) return null
    const typed = typedDraft()
    local.takeStored(stored)
    if (!(typed && isEmptied(typed))) apply(localRestored(stored, kept, null), typed ? 'merge' : 'fill')
    return stored
  }
  const keepUnread = (shown: LocalDraft | null) => {
    phase = {kind: 'unread', shown}
    const typed = typedDraft()
    if (typed && !isEmptied(typed) && mayPersist()) persistTyped()
  }
  const reconcileRow = (
    stored: LocalDraft | null,
    kept: AttachmentState[],
    shown: LocalDraft | null,
    row: DraftRow | null,
    apply: DraftApply,
  ) => {
    const verdict = reconcileDraft(stored, row, sameAsRow)
    const typed = typedDraft()
    const edited = typedSince(typed, shown)
    try {
      local?.settle(verdict, row, edited)
      const restored = rowRestored(verdict, stored, kept, row)
      if (restored && !(edited && typed && isEmptied(typed))) apply(restored, applyMode(verdict, edited, shown))
    } finally {
      phase = {kind: 'read'}
      if (local) local.feed()
      else if (typed && (row || !isEmptied(typed))) persistTyped()
    }
  }
  const readRow = (signal: AbortSignal): Promise<{row: DraftRow | null} | undefined> =>
    appData.readDraft(sessionId).then(
      (row) => ({row}),
      (error: unknown) => {
        if (!signal.aborted) console.error('[conciv] could not read the saved draft, the local draft stays', error)
        return undefined
      },
    )
  const retry = () => {
    if (local) return local.resend()
    const row = appData.cachedDraft(sessionId)
    if (row) void appData.saveDraft({...row, updatedAt: Date.now()})
  }
  return {
    writer: local?.writer,
    retry,
    storage: {
      getItem: () => {
        const row = appData.cachedDraft(sessionId)
        return row ? serializeRow(row) : cache
      },
      setItem: (_key, value) => {
        const stored = cached()
        cache = value
        const parsed = parseDraft(value)
        if (!parsed || !mayPersist()) return
        if (isCleared(parsed) && stored && isCleared(stored)) return
        if (savedAlready(parsed)) return
        persist(parsed)
      },
    },
    noteSelection: (offsets) => {
      selection = offsets
    },
    restore: async (apply, signal) => {
      const reading = readRow(signal)
      const stored = await readStored()
      const kept = await readKeptFiles(stored)
      if (signal.aborted) return
      const shown = show(stored, kept, apply)
      const read = await reading
      if (signal.aborted) return
      if (!read) return keepUnread(shown)
      reconcileRow(stored, kept, shown, read.row, apply)
    },
  }
}
