import {z} from 'zod'
import {differenceBy, intersectionBy, isEqual, keyBy, union} from 'es-toolkit'
import {untrack} from 'solid-js'
import {createStore, unwrap} from 'solid-js/store'
import type {DraftRow} from '@conciv/contract'
import type {AttachmentState, ComposerDraft, ComposerDraftWriter} from '@conciv/ui-kit-chat'
import {encodeAttachments} from '@conciv/ui-kit-chat/draft-storage'
import {persistStore} from '../runtime/persistence/persist.js'
import {resolveBlobUrl, type BlobReference, type DraftStore} from '../runtime/persistence/drafts.js'
import {
  dropLeavingCopy,
  keepLeavingCopy,
  readLeavingCopy,
  settleLeavingCopy,
} from '../runtime/persistence/leaving-copy.js'
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
  keptHere: (draft: DraftContent) => boolean
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

function newestStamp(draft: LocalDraft): number {
  return Math.max(draft.syncedAt ?? 0, ...draft.sent)
}

function preferLeavingCopy(sessionId: string, stored: LocalDraft | null): LocalDraft | null {
  const copy = readLeavingCopy(sessionId, LocalDraftSchema)
  if (!copy) return stored
  if (!stored || (!sameContent(stored, copy.draft) && newestStamp(stored) < copy.stamp)) return copy.draft
  dropLeavingCopy(sessionId)
  return stored
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

const UNSENT = Promise.resolve(false)

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

type DraftSendKind = 'feed' | 'retry'

type LocalDraftWriter = {
  writer: ComposerDraftWriter
  typed: () => DraftContent | null
  feed: () => void
  resend: () => void
  read: () => Promise<LocalDraft | null>
  kept: () => LocalDraft | null
  takeStored: (stored: LocalDraft) => void
  settle: (verdict: DraftReconcile, row: DraftRow | null, edited: boolean) => void
}

function makeLocalDraftWriter(
  appData: AppData,
  drafts: DraftStore,
  keep: DraftWriteChain,
  sessionId: string,
  selection: () => SelectionOffsets | null,
  sendable: () => boolean,
): LocalDraftWriter {
  const [document, setDocument] = createStore<{draft: LocalDraft | null; files: PendingDraftAttachment[]}>({
    draft: null,
    files: [],
  })
  const storedRead = readLocalDraft(drafts, sessionId).then((stored) => preferLeavingCopy(sessionId, stored))
  void storedRead.then((read) => {
    if (!read || !document.draft) return
    persisted.setStore(
      'draft',
      (draft) => draft && {...draft, syncedAt: read.syncedAt, sent: union(read.sent, draft.sent)},
    )
  })
  const writeDocument = () =>
    storedRead.then(() => {
      const writtenAt = Date.now()
      return drafts
        .setDocument(sessionId, structuredClone(unwrap(document.draft)))
        .then(() => settleLeavingCopy(sessionId, writtenAt))
    })
  const writeLeaving = () => {
    if (document.draft) keepLeavingCopy(sessionId, unwrap(document.draft))
    return writeDocument()
  }
  const send = (recorded: LocalDraft, attachments: DraftRow['attachments'], kind: DraftSendKind) => {
    const current = document.draft
    if (!current || !sameContent(current, recorded) || appData.sessionDeleted(sessionId)) return
    const updatedAt = Date.now()
    persisted.setStore('draft', 'sent', (sent) => [...sent, updatedAt])
    void keep(() =>
      writeDocument()
        .catch((error: unknown) => {
          console.error('[conciv] could not keep the draft stamp in the local draft', error)
        })
        .then(() => {
          const latest = document.draft
          if (!latest || !sameContent(latest, recorded)) return {saving: UNSENT}
          if (kind === 'feed' && sameAsRow({...recorded, attachments}, appData.cachedDraft(sessionId)))
            return {saving: UNSENT}
          const saving = appData.saveDraft({
            sessionId,
            text: recorded.text,
            selectionStart: recorded.selectionStart,
            selectionEnd: recorded.selectionEnd,
            attachments,
            updatedAt,
          })
          return {saving}
        }),
    )
      .then(({saving}) => saving)
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
    send(recorded, attachments, 'feed')
  }
  const encoded = (
    then: (recorded: LocalDraft, attachments: DraftRow['attachments'], row: DraftRow | null | undefined) => void,
  ) => {
    const draft = document.draft
    if (!draft || appData.sessionDeleted(sessionId) || appData.lockedOut()) return
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
  const sendAgain = (recorded: LocalDraft, attachments: DraftRow['attachments']) => send(recorded, attachments, 'retry')
  const resend = () => encoded(sendAgain)
  const persisted = persistStore({
    store: document,
    setStore: setDocument,
    name: sessionId,
    storage: NoLocalHydration,
    delay: 0,
    serialize: (value) => JSON.stringify(value.draft),
    deserialize: () => ({draft: null, files: []}),
    write: () => keep(writeDocument).finally(feed),
    writeLeaving: () => writeLeaving().finally(feed),
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
  const read = () => storedRead
  const kept = (): LocalDraft | null => {
    const state = persisted.state()
    if (state.status === 'hydrating' || state.status === 'disposed' || state.last === undefined) return null
    const parsed = LocalDraftSchema.safeParse(JSON.parse(state.last))
    return parsed.success ? parsed.data : null
  }
  const takeStored = (stored: LocalDraft) => {
    if (document.draft) return persisted.setStore('draft', 'syncedAt', stored.syncedAt)
    persisted.setStore('draft', structuredClone(stored))
  }
  const settle = (verdict: DraftReconcile, row: DraftRow | null, edited: boolean) => {
    if (!edited && verdict.kind === 'cleared') return persisted.setStore('draft', structuredClone(EMPTY_LOCAL_DRAFT))
    if (!edited && verdict.kind === 'engine' && row) return persisted.setStore('draft', rowLocalDraft(row))
    if (!document.draft) return
    if (verdict.kind === 'cleared') return persisted.setStore('draft', 'syncedAt', undefined)
    if (row) persisted.setStore('draft', (draft) => draft && settledDraft(draft, row.updatedAt, true))
  }
  return {writer, typed: () => document.draft, feed, resend, read, kept, takeStored, settle}
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

export type DraftContent = {text: string; attachments: readonly {id: string}[]}

export function sameContent(draft: DraftContent, other: DraftContent): boolean {
  return (
    draft.text === other.text &&
    isEqual(
      draft.attachments.map((attachment) => attachment.id),
      other.attachments.map((attachment) => attachment.id),
    )
  )
}

function holdsDraft(kept: DraftContent | null | undefined, draft: DraftContent): boolean {
  if (!kept) return false
  return (
    kept.text === draft.text &&
    differenceBy(draft.attachments, kept.attachments, (attachment) => attachment.id).length === 0
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

function withoutOneSend(sent: number[], updatedAt: number): number[] {
  const at = sent.indexOf(updatedAt)
  if (at === -1) return sent
  return sent.toSpliced(at, 1)
}

function settledDraft(draft: LocalDraft, updatedAt: number, saved: boolean): LocalDraft {
  if (!saved) return {...draft, sent: withoutOneSend(draft.sent, updatedAt)}
  return {...draft, syncedAt: updatedAt, sent: draft.sent.slice(draft.sent.indexOf(updatedAt) + 1)}
}

function withSent(draft: LocalDraft, updatedAt: number): LocalDraft {
  return {...draft, sent: [...draft.sent, updatedAt]}
}

function isEmptied(typed: DraftContent): boolean {
  return typed.text === '' && typed.attachments.length === 0
}

type KeptBase = {base: LocalDraft; encoded: DraftRow['attachments'] | undefined}

async function readLocalOnlyEncoded(stored: LocalDraft): Promise<DraftRow['attachments'] | undefined> {
  const files = (await readKeptFiles(stored)).flatMap(({id, type, name, file}) =>
    file ? [{id, type, name, file}] : [],
  )
  if (differenceBy(stored.attachments, files, (attachment) => attachment.id).length > 0) return undefined
  return sendableAttachments(stored, files, await encodeAttachments(files), undefined)
}

async function readKeptBase(appData: AppData, sessionId: string): Promise<KeptBase> {
  const stored = appData.drafts ? await readLocalDraft(appData.drafts, sessionId) : null
  if (!stored) {
    const row = await appData.readDraft(sessionId).catch((error: unknown) => {
      console.error('[conciv] could not read the saved draft', error)
      return null
    })
    return row ? {base: rowLocalDraft(row), encoded: row.attachments} : {base: EMPTY_LOCAL_DRAFT, encoded: []}
  }
  const row = appData.cachedDraft(sessionId)
  if (row === undefined) return {base: stored, encoded: await readLocalOnlyEncoded(stored)}
  if (stored.syncedAt !== undefined && row === null) return {base: EMPTY_LOCAL_DRAFT, encoded: []}
  return {base: stored, encoded: row?.attachments ?? []}
}

function joinReturned(saved: string, text: string, place: DraftPlace): {text: string; caret: number} {
  if (saved === '') return {text, caret: text.length}
  if (place === 'first') return {text: `${text}\n${saved}`, caret: text.length}
  const joined = `${saved}\n${text}`
  return {text: joined, caret: joined.length}
}

function keepLocally(drafts: DraftStore, sessionId: string, draft: LocalDraft): Promise<boolean> {
  return drafts.setDocument(sessionId, draft).then(
    () => true,
    (error: unknown) => {
      console.error('[conciv] could not keep the returned text in the local draft', error)
      return false
    },
  )
}

export type MovedDraft = {text: string; attachments: LocalAttachment[]; encoded: DraftRow['attachments']}

const NOTHING_MOVED: MovedDraft = {text: '', attachments: [], encoded: []}

export function movesNothing(moved: MovedDraft | undefined): boolean {
  return !moved || isEmptied(moved)
}

function addToDraft(base: LocalDraft, added: MovedDraft, place: DraftPlace): LocalDraft {
  const attachments = [...base.attachments, ...added.attachments]
  if (added.text === '') return {...base, attachments}
  const {text, caret} = joinReturned(base.text, added.text, place)
  return {...base, text, selectionStart: caret, selectionEnd: caret, attachments}
}

type KeptSave = {updatedAt: number; keptLocally: boolean; saving: Promise<boolean>}

function keepInDraft(
  appData: AppData,
  keep: DraftWriteChain,
  sessionId: string,
  place: DraftPlace,
  readAdded: () => Promise<MovedDraft>,
): Promise<KeptSave> {
  return keep(async () => {
    const drafts = appData.drafts
    const {base, encoded} = await readKeptBase(appData, sessionId)
    const added = await readAdded()
    const draft = addToDraft(base, added, place)
    const updatedAt = Date.now()
    if (encoded === undefined) {
      const keptLocally = drafts ? await keepLocally(drafts, sessionId, draft) : false
      return {updatedAt, keptLocally, saving: UNSENT}
    }
    const keptLocally = drafts ? await keepLocally(drafts, sessionId, withSent(draft, updatedAt)) : false
    const saving = appData.saveDraft({
      sessionId,
      text: draft.text,
      selectionStart: draft.selectionStart,
      selectionEnd: draft.selectionEnd,
      attachments: [...encoded, ...added.encoded],
      updatedAt,
    })
    return {updatedAt, keptLocally, saving}
  })
}

async function settleKept(drafts: DraftStore, sessionId: string, updatedAt: number, saved: boolean): Promise<void> {
  const stored = await readLocalDraft(drafts, sessionId)
  if (!stored?.sent.includes(updatedAt)) return
  await keepLocally(drafts, sessionId, settledDraft(stored, updatedAt, saved))
}

export function settleKeptSave(appData: AppData, keep: DraftWriteChain, sessionId: string, kept: KeptSave): void {
  const drafts = appData.drafts
  if (!drafts) return
  void kept.saving.then((saved) => keep(() => settleKept(drafts, sessionId, kept.updatedAt, saved)))
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

async function readAddedImage(drafts: DraftStore | null, file: File): Promise<MovedDraft> {
  const attachment = {id: crypto.randomUUID(), type: 'image', name: file.name}
  const blob = drafts ? await keepDraftImage(drafts, file) : undefined
  const local = {...attachment, contentType: file.type}
  return {
    text: '',
    attachments: [blob ? {...local, blob: {id: blob.id}} : local],
    encoded: await encodeAttachments([{...attachment, file}]),
  }
}

function keepImageInDraft(appData: AppData, keep: DraftWriteChain, sessionId: string, file: File): Promise<KeptSave> {
  return keepInDraft(appData, keep, sessionId, 'last', () => readAddedImage(appData.drafts, file))
}

function readRowMoved(row: DraftRow | null): MovedDraft {
  if (!row) return NOTHING_MOVED
  return {text: row.text, attachments: rowLocalDraft(row).attachments, encoded: row.attachments}
}

async function readStoredMoved(appData: AppData, sessionId: string, stored: LocalDraft): Promise<MovedDraft> {
  const files = (await readKeptFiles(stored)).flatMap(({id, type, name, file}) =>
    file ? [{id, type, name, file}] : [],
  )
  const unfiled = differenceBy(stored.attachments, files, (attachment) => attachment.id)
  const row =
    unfiled.length === 0
      ? null
      : await appData.readDraft(sessionId).catch((error: unknown) => {
          console.error('[conciv] could not read the saved images of the deleted session draft', error)
          return null
        })
  const encoded = sendableAttachments(stored, files, await encodeAttachments(files), row)
  return {text: stored.text, attachments: stored.attachments, encoded}
}

export async function readMovedDraft(appData: AppData, keep: DraftWriteChain, sessionId: string): Promise<MovedDraft> {
  const {drafts} = appData
  const stored = drafts ? await keep(() => readLocalDraft(drafts, sessionId)) : null
  if (stored) return readStoredMoved(appData, sessionId, stored)
  return readRowMoved(await appData.readDraft(sessionId))
}

export async function clearMovedDraft(appData: AppData, keep: DraftWriteChain, sessionId: string): Promise<void> {
  const {drafts} = appData
  if (drafts)
    await keep(() =>
      drafts.removeItem(sessionId).catch((error: unknown) => {
        console.error('[conciv] could not remove the local draft of the deleted session', error)
      }),
    )
  await appData.saveDraft({
    sessionId,
    text: '',
    selectionStart: 0,
    selectionEnd: 0,
    attachments: [],
    updatedAt: Date.now(),
  })
}

export async function carryMovedDraft(
  appData: AppData,
  keep: DraftWriteChain,
  sessionId: string,
  moved: MovedDraft,
): Promise<void> {
  const kept = await keepInDraft(appData, keep, sessionId, 'first', () => Promise.resolve(moved))
  settleKeptSave(appData, keep, sessionId, kept)
  if (kept.keptLocally || (await kept.saving)) return
  throw new Error('neither this browser nor the engine holds the moved draft')
}

const textAdded = (text: string) => (): Promise<MovedDraft> => Promise.resolve({...NOTHING_MOVED, text})

export function appendDraft(
  appData: AppData,
  keep: DraftWriteChain,
  sessionId: string,
  text: string,
): Promise<KeptSave> {
  return keepInDraft(appData, keep, sessionId, 'last', textAdded(text))
}

export function prependDraft(
  appData: AppData,
  keep: DraftWriteChain,
  sessionId: string,
  text: string,
): Promise<KeptSave> {
  return keepInDraft(appData, keep, sessionId, 'first', textAdded(text))
}

type DraftWrite = (appData: AppData, keep: DraftWriteChain, sessionId: string, text: string) => Promise<KeptSave>

export type DraftWriteChain = <T>(step: () => Promise<T>) => Promise<T>

export function makeDraftWriteChain(): DraftWriteChain {
  let written: Promise<unknown> = Promise.resolve()
  return (step) => {
    const queued = written.then(step)
    written = queued.catch((error: unknown) => console.error('[conciv] a local draft step failed', error))
    return queued
  }
}

export function draftCacheSink(
  keep: DraftWriteChain,
  appData: AppData,
  sessionId: string,
  write: DraftWrite,
): DraftSink {
  const logKeepFailure = (error: unknown) =>
    console.error('[conciv] could not keep the queued message as a draft', error)
  const settleLater = (kept: KeptSave): void => settleKeptSave(appData, keep, sessionId, kept)
  return {
    insert: (text) => void write(appData, keep, sessionId, text).then(settleLater).catch(logKeepFailure),
    addFile: (file) => void keepImageInDraft(appData, keep, sessionId, file).then(settleLater).catch(logKeepFailure),
  }
}

export function makeDraftStorage(appData: AppData, keep: DraftWriteChain, sessionId: string): PaneDraftStorage {
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
        keep,
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
    keptHere: (draft) => holdsDraft(local?.kept(), draft),
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
