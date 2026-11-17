import {createContext, createMemo, untrack, useContext, type Accessor, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {useLiveQuery} from '@tanstack/solid-db'
import {screenToScene, type Viewport} from '../../canvas/coords.js'
import type {CommentRow, PinRow, ReadRow} from '../../shared/rows.js'
import {useWhiteboardDb} from '../db.js'

export type Comment = CommentRow
export type Pin = PinRow
export type CommentSource = {file: string; line: number | null} | null
export type ComposeTarget = {source: CommentSource; screen: {x: number; y: number}}

export type CommentsModel = ReturnType<typeof createCommentsModel>

const newest = (dates: number[]): number | undefined => (dates.length === 0 ? undefined : Math.max(...dates))

export function createCommentsModel(
  room: Accessor<string>,
  onComposeSettled: (outcome: 'added' | 'cancelled') => void,
) {
  const db = useWhiteboardDb()
  const accountId = (): string => db.accountId()

  const commentRows = useLiveQuery((q) => q.from({row: db.comments}))
  const pinRows = useLiveQuery((q) => q.from({row: db.pins}))
  const readRows = useLiveQuery((q) => q.from({row: db.reads}))
  const comments = (): CommentRow[] => commentRows() ?? []
  const pins = (): PinRow[] => pinRows() ?? []
  const reads = (): ReadRow[] => readRows() ?? []

  const [state, setState] = createStore<{
    openCid: string | null
    viewport: Viewport | undefined
    composeTarget: ComposeTarget | null
    pinButtons: Partial<Record<string, HTMLButtonElement>>
  }>({
    openCid: null,
    viewport: undefined,
    composeTarget: null,
    pinButtons: {},
  })

  const findRoot = (cid: string): Comment | undefined => comments().find((comment) => comment.cid === cid)

  const collectThread = (cid: string): Comment[] => {
    const threadId = findRoot(cid)?.threadId
    if (!threadId) return []
    return comments()
      .filter((comment) => comment.threadId === threadId)
      .toSorted((left, right) => left.createdAt - right.createdAt)
  }
  const orderedThreads = createMemo(() =>
    comments()
      .filter((comment) => !comment.parentId && comment.status !== 'resolved')
      .toSorted((left, right) => right.createdAt - left.createdAt),
  )
  const aiLabel = (comment: Comment): string => comment.authorName ?? comment.authorModel ?? 'AI'
  const humanLabel = (comment: Comment): string =>
    comment.authorId && comment.authorId === accountId() ? 'You' : (comment.authorName ?? 'Human')
  const displayName = (comment: Comment): string =>
    comment.authorKind === 'ai' ? aiLabel(comment) : humanLabel(comment)
  const ownedBySelf = (comment: Comment): boolean =>
    comment.authorKind === 'human' && comment.authorId != null && comment.authorId === accountId()

  const readAt = (threadId: string): number | undefined =>
    reads().find((row) => row.threadId === threadId && row.accountId === accountId())?.lastReadAt
  const newestForeign = (threadId: string): number | undefined =>
    newest(
      comments()
        .filter((comment) => comment.threadId === threadId && !ownedBySelf(comment))
        .map((comment) => comment.createdAt),
    )
  const isUnread = (threadId: string): boolean => {
    const foreign = newestForeign(threadId)
    if (foreign === undefined) return false
    const since = readAt(threadId)
    return since === undefined || foreign > since
  }
  const markRead = (threadId: string): void => {
    const self = accountId()
    const existing = reads().find((row) => row.threadId === threadId && row.accountId === self)
    if (existing) return void db.reads.update(existing.id, (draft) => void (draft.lastReadAt = Date.now()))
    db.reads.insert({id: crypto.randomUUID(), sessionId: room(), threadId, accountId: self, lastReadAt: Date.now()})
  }

  const openThread = (cid: string): void => {
    setState('openCid', cid)
    markRead(cid)
  }
  const closeThread = (): void => void setState('openCid', null)
  const toggleThread = (cid: string): void => (state.openCid === cid ? closeThread() : openThread(cid))
  const registerPin = (cid: string, button: HTMLButtonElement | undefined): void =>
    void setState('pinButtons', cid, button)
  const openPinButton = (): HTMLButtonElement | undefined =>
    state.openCid === null ? undefined : state.pinButtons[state.openCid]

  const stepIndex = (): number => orderedThreads().findIndex((thread) => thread.cid === state.openCid)
  const stepThread = (delta: number): void => {
    const target = orderedThreads()[stepIndex() + delta]
    if (stepIndex() >= 0 && target) openThread(target.cid)
  }
  const canStep = (delta: number): boolean => stepIndex() >= 0 && orderedThreads()[stepIndex() + delta] !== undefined
  const openRoot = (): Comment | undefined => (state.openCid === null ? undefined : findRoot(state.openCid))

  const reply = (text: string): void => {
    const parent = openRoot()
    if (!parent) return
    const now = Date.now()
    db.comments.insert({
      id: crypto.randomUUID(),
      sessionId: room(),
      cid: crypto.randomUUID(),
      threadId: parent.threadId,
      parentId: parent.cid,
      parts: [{type: 'text', text}],
      authorKind: 'human',
      authorModel: null,
      authorId: accountId(),
      authorName: null,
      authorAvatar: null,
      status: 'open',
      kind: 'floating',
      anchor: null,
      anchorFile: null,
      anchorComponent: null,
      anchorHash: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    })
  }
  const resolve = (): void => {
    const parent = openRoot()
    if (!parent) return
    const now = Date.now()
    db.comments.update(parent.id, (draft) => {
      draft.status = 'resolved'
      draft.resolvedAt = now
      draft.updatedAt = now
    })
    closeThread()
  }
  const deleteThread = (): void => {
    const parent = openRoot()
    if (!parent) return
    comments()
      .filter((comment) => comment.threadId === parent.threadId)
      .forEach((comment) => db.comments.delete(comment.id))
    const pin = pins().find((row) => row.cid === parent.cid)
    if (pin) db.pins.delete(pin.id)
    closeThread()
  }
  const removeComment = (comment: Comment): void => {
    if (comment.cid === comment.threadId) return deleteThread()
    db.comments.delete(comment.id)
  }

  const movePin = (cid: string, patch: Partial<Pick<Pin, 'x' | 'y' | 'pinState' | 'anchorX' | 'anchorY'>>): void => {
    const pin = pins().find((row) => row.cid === cid)
    if (pin) db.pins.update(pin.id, (draft) => void Object.assign(draft, patch))
  }

  const startCompose = (target: ComposeTarget): void => void setState('composeTarget', target)
  const cancelCompose = (): void => {
    setState('composeTarget', null)
    onComposeSettled('cancelled')
  }
  const newComment = (target: ComposeTarget, cid: string, text: string): void => {
    const now = Date.now()
    db.comments.insert({
      id: crypto.randomUUID(),
      sessionId: room(),
      cid,
      threadId: cid,
      parentId: null,
      parts: [{type: 'text', text}],
      authorKind: 'human',
      authorModel: null,
      authorId: accountId(),
      authorName: null,
      authorAvatar: null,
      status: 'open',
      kind: target.source ? 'source-linked' : 'floating',
      anchor: target.source ? {source: {file: target.source.file, line: target.source.line ?? 1, column: 1}} : null,
      anchorFile: target.source?.file ?? null,
      anchorComponent: null,
      anchorHash: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    })
  }
  const newPin = (target: ComposeTarget, cid: string): void => {
    const view = state.viewport
    const center = view ? screenToScene(view, target.screen.x, target.screen.y) : target.screen
    db.pins.insert({
      id: crypto.randomUUID(),
      room: room(),
      cid,
      x: center.x,
      y: center.y,
      elementId: null,
      pinState: 'locked',
      anchorX: null,
      anchorY: null,
    })
  }
  const createComment = (target: ComposeTarget, text: string): void => {
    const cid = crypto.randomUUID()
    newComment(target, cid, text)
    newPin(target, cid)
    setState('composeTarget', null)
    onComposeSettled('added')
  }

  return {
    comments,
    pins,
    findRoot,
    collectThread,
    orderedThreads,
    displayName,
    ownedBySelf,
    openRoot,
    stepThread,
    canStep,
    reply,
    resolve,
    deleteThread,
    removeComment,
    openCid: () => state.openCid,
    openThread,
    closeThread,
    toggleThread,
    registerPin,
    openPinButton,
    movePin,
    isUnread,
    markRead,
    composeTarget: () => state.composeTarget,
    startCompose,
    cancelCompose,
    createComment,
    viewport: () => state.viewport,
    setViewport: (viewport: Viewport) => void setState('viewport', viewport),
  }
}

const CommentsContext = createContext<CommentsModel>()

export function CommentsProvider(props: {
  room: Accessor<string>
  onComposeSettled: (outcome: 'added' | 'cancelled') => void
  children: JSX.Element
}): JSX.Element {
  const model = untrack(() => createCommentsModel(props.room, props.onComposeSettled))
  return <CommentsContext.Provider value={model}>{props.children}</CommentsContext.Provider>
}

export function useComments(): CommentsModel {
  const model = useContext(CommentsContext)
  if (!model) throw new Error('useComments must be used inside a CommentsProvider')
  return model
}
