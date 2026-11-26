export const RETAINED_BLOB_GRACE_MS = 30_000

export type DraftBlobSlot =
  | {readonly status: 'permanent'; readonly blob: Blob; readonly url: string}
  | {readonly status: 'pinned'; readonly blob: Blob; readonly url: string}
  | {readonly status: 'grace'; readonly blob: Blob; readonly url: string; readonly attempt: number}

export type DraftDocumentSlot = {
  readonly storeId: number
  readonly latestMutation: number
  readonly revision: number
  readonly committed: ReadonlySet<string>
  readonly saves: ReadonlyMap<number, ReadonlySet<string>>
}

export type DraftRetentionState = {
  readonly nextAttempt: number
  readonly nextStoreId: number
  readonly latestStoreId: number | undefined
  readonly blobs: ReadonlyMap<string, DraftBlobSlot>
  readonly documents: ReadonlyMap<string, DraftDocumentSlot>
  readonly aliases: ReadonlyMap<string, string>
}

type DocumentRef = {readonly storeId: number; readonly key: string}

export type DraftRetentionEvent =
  | {readonly type: 'store.registered'}
  | {
      readonly type: 'blob.materialized'
      readonly id: string
      readonly blob: Blob
      readonly url: string
      readonly graceMs: number | undefined
    }
  | {readonly type: 'blob.touched'; readonly id: string; readonly graceMs: number | undefined}
  | {readonly type: 'alias.recorded'; readonly from: string; readonly to: string}
  | (DocumentRef & {
      readonly type: 'load.succeeded'
      readonly revision: number
      readonly ids: ReadonlySet<string>
      readonly graceMs: number
    })
  | (DocumentRef & {readonly type: 'save.started'; readonly ids: ReadonlySet<string>; readonly graceMs: number})
  | (DocumentRef & {
      readonly type: 'save.referenced'
      readonly attempt: number
      readonly ids: ReadonlySet<string>
      readonly graceMs: number
    })
  | (DocumentRef & {
      readonly type: 'save.committed'
      readonly attempt: number
      readonly ids: ReadonlySet<string>
      readonly graceMs: number
    })
  | (DocumentRef & {readonly type: 'save.aborted'; readonly attempt: number; readonly graceMs: number})
  | (DocumentRef & {readonly type: 'remove.started'})
  | (DocumentRef & {readonly type: 'remove.committed'; readonly attempt: number; readonly graceMs: number})
  | {readonly type: 'grace.expired'; readonly id: string; readonly attempt: number}

export type DraftRetentionEffect =
  | {readonly type: 'timer.arm'; readonly id: string; readonly attempt: number; readonly delayMs: number}
  | {readonly type: 'timer.cancel'; readonly id: string}
  | {readonly type: 'url.revoke'; readonly url: string}

export type DraftRetentionTransition = {
  readonly state: DraftRetentionState
  readonly effects: readonly DraftRetentionEffect[]
}

const none: readonly DraftRetentionEffect[] = []

export function createDraftRetentionState(): DraftRetentionState {
  return {
    nextAttempt: 1,
    nextStoreId: 1,
    latestStoreId: undefined,
    blobs: new Map(),
    documents: new Map(),
    aliases: new Map(),
  }
}

export function transitionDraftRetention(
  state: DraftRetentionState,
  event: DraftRetentionEvent,
): DraftRetentionTransition {
  if (event.type === 'store.registered')
    return {state: {...state, nextStoreId: state.nextStoreId + 1, latestStoreId: state.nextStoreId}, effects: none}

  if (event.type === 'blob.materialized') return materialized(state, event)

  if (event.type === 'blob.touched') return touched(state, event.id, event.graceMs)

  if (event.type === 'alias.recorded') return aliased(state, event.from, event.to)

  if (event.type === 'grace.expired') return expired(state, event.id, event.attempt)

  const name = documentName(event)

  const doc = state.documents.get(name) ?? {
    storeId: event.storeId,
    latestMutation: 0,
    revision: 0,
    committed: new Set(),
    saves: new Map(),
  }
  if (event.type === 'save.started') {
    const attempt = state.nextAttempt
    const saves = new Map(doc.saves).set(attempt, resolveIds(state, event.ids))

    return reconcile(
      {...state, nextAttempt: attempt + 1},
      name,
      {...doc, latestMutation: attempt, revision: attempt, saves},
      event.graceMs,
    )
  }

  if (event.type === 'remove.started') {
    const attempt = state.nextAttempt
    const documents = new Map(state.documents).set(name, {...doc, latestMutation: attempt, revision: attempt})

    return {state: {...state, nextAttempt: attempt + 1, documents}, effects: none}
  }

  if (event.type === 'load.succeeded') {
    if (doc.revision !== event.revision) return {state, effects: none}

    return reconcile(state, name, {...doc, committed: resolveIds(state, event.ids)}, event.graceMs)
  }

  if (event.type === 'remove.committed') {
    if (doc.latestMutation !== event.attempt) return {state, effects: none}

    return reconcile(
      {...state, nextAttempt: state.nextAttempt + 1},
      name,
      {...doc, revision: state.nextAttempt, committed: new Set()},
      event.graceMs,
    )
  }

  const current = doc.saves.get(event.attempt)

  if (!current) return {state, effects: none}

  if (event.type === 'save.referenced') {
    if (doc.latestMutation !== event.attempt) return {state, effects: none}

    const ids = new Set([...current, ...resolveIds(state, event.ids)])

    return reconcile(state, name, {...doc, saves: new Map(doc.saves).set(event.attempt, ids)}, event.graceMs)
  }

  const saves = new Map(doc.saves)
  saves.delete(event.attempt)
  if (event.type === 'save.aborted' || doc.latestMutation !== event.attempt)
    return reconcile(state, name, {...doc, saves}, event.graceMs)

  return reconcile(
    {...state, nextAttempt: state.nextAttempt + 1},
    name,
    {...doc, revision: state.nextAttempt, saves, committed: resolveIds(state, event.ids)},
    event.graceMs,
  )
}

export function selectRetainedBlob(state: DraftRetentionState, id: string) {
  const slot = state.blobs.get(resolveBlobAlias(state, id))

  return slot && {blob: slot.blob, url: slot.url}
}

export function resolveBlobAlias(state: DraftRetentionState, id: string) {
  return state.aliases.get(id) ?? id
}

export function selectDocumentRevision(state: DraftRetentionState, storeId: number, key: string) {
  return state.documents.get(documentName({storeId, key}))?.revision ?? 0
}

export function selectLatestMutation(state: DraftRetentionState, storeId: number, key: string) {
  return state.documents.get(documentName({storeId, key}))?.latestMutation ?? 0
}

export function isCurrentSave(state: DraftRetentionState, storeId: number, key: string, attempt: number) {
  const doc = state.documents.get(documentName({storeId, key}))

  return doc?.latestMutation === attempt && doc.saves.has(attempt)
}

export function selectBlobStoreId(state: DraftRetentionState, id: string) {
  const target = resolveBlobAlias(state, id)
  const owner = [...state.documents.values()].findLast((doc) => references(doc, id) || references(doc, target))

  return owner?.storeId ?? state.latestStoreId
}

function materialized(
  state: DraftRetentionState,
  event: Extract<DraftRetentionEvent, {type: 'blob.materialized'}>,
): DraftRetentionTransition {
  const existing = state.blobs.get(event.id)
  if (existing) {
    const touch = touched(state, event.id, event.graceMs)

    return {state: touch.state, effects: [{type: 'url.revoke', url: event.url}, ...touch.effects]}
  }

  const blobs = new Map(state.blobs)

  if (event.graceMs === undefined) {
    blobs.set(event.id, {status: 'permanent', blob: event.blob, url: event.url})

    return {state: {...state, blobs}, effects: none}
  }

  if (referenced(state.documents, event.id)) {
    blobs.set(event.id, {status: 'pinned', blob: event.blob, url: event.url})

    return {state: {...state, blobs}, effects: none}
  }

  const attempt = state.nextAttempt
  blobs.set(event.id, {status: 'grace', blob: event.blob, url: event.url, attempt})

  return {
    state: {...state, nextAttempt: attempt + 1, blobs},
    effects: [{type: 'timer.arm', id: event.id, attempt, delayMs: event.graceMs}],
  }
}
function touched(state: DraftRetentionState, id: string, graceMs: number | undefined): DraftRetentionTransition {
  const slot = state.blobs.get(id)

  if (!slot || slot.status === 'permanent') return {state, effects: none}

  if (graceMs === undefined)
    return {
      state: {...state, blobs: new Map(state.blobs).set(id, {status: 'permanent', blob: slot.blob, url: slot.url})},
      effects: slot.status === 'grace' ? [{type: 'timer.cancel', id}] : none,
    }

  if (slot.status === 'pinned') return {state, effects: none}

  const attempt = state.nextAttempt

  return {
    state: {...state, nextAttempt: attempt + 1, blobs: new Map(state.blobs).set(id, {...slot, attempt})},
    effects: [{type: 'timer.arm', id, attempt, delayMs: graceMs}],
  }
}
function aliased(state: DraftRetentionState, from: string, to: string): DraftRetentionTransition {
  if (from === to || state.aliases.get(from) === to) return {state, effects: none}

  const aliases = new Map([...state.aliases].map(([key, value]) => [key, value === from ? to : value]))
  aliases.set(from, to)

  return {state: {...state, aliases}, effects: none}
}

function expired(state: DraftRetentionState, id: string, attempt: number): DraftRetentionTransition {
  const slot = state.blobs.get(id)

  if (slot?.status !== 'grace' || slot.attempt !== attempt) return {state, effects: none}

  const blobs = new Map(state.blobs)
  blobs.delete(id)

  return {
    state: {...state, blobs, aliases: new Map([...state.aliases].filter(([, value]) => value !== id))},
    effects: [{type: 'url.revoke', url: slot.url}],
  }
}

function reconcile(
  state: DraftRetentionState,
  name: string,
  doc: DraftDocumentSlot,
  graceMs: number,
): DraftRetentionTransition {
  const previous = state.documents.get(name)
  const documents = new Map(state.documents).set(name, doc)
  const touchedIds = new Set([...ids(previous), ...ids(doc)])
  const blobs = new Map(state.blobs)
  const effects: DraftRetentionEffect[] = []
  let attempt = state.nextAttempt

  touchedIds.forEach((id) => {
    const slot = blobs.get(id)

    if (!slot || slot.status === 'permanent') return

    const live = referenced(documents, id)

    if (live && slot.status === 'grace') {
      blobs.set(id, {status: 'pinned', blob: slot.blob, url: slot.url})
      effects.push({type: 'timer.cancel', id})
    }

    if (!live && slot.status === 'pinned') {
      blobs.set(id, {status: 'grace', blob: slot.blob, url: slot.url, attempt})
      effects.push({type: 'timer.arm', id, attempt, delayMs: graceMs})
      attempt++
    }
  })

  return {
    state: {...state, nextAttempt: attempt, documents, blobs: effects.length ? blobs : state.blobs},
    effects,
  }
}

function resolveIds(state: DraftRetentionState, ids: ReadonlySet<string>): ReadonlySet<string> {
  if (!state.aliases.size) return ids

  return new Set([...ids].map((id) => resolveBlobAlias(state, id)))
}

function ids(doc: DraftDocumentSlot | undefined) {
  if (!doc) return []

  return [...doc.committed, ...[...doc.saves.values()].flatMap((save) => [...save])]
}

function references(doc: DraftDocumentSlot, id: string) {
  return doc.committed.has(id) || [...doc.saves.values()].some((save) => save.has(id))
}

function referenced(documents: ReadonlyMap<string, DraftDocumentSlot>, id: string) {
  return [...documents.values()].some((doc) => references(doc, id))
}

function documentName(ref: DocumentRef) {
  return `${ref.storeId}\0${ref.key}`
}
