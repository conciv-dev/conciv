import {createContext, createMemo, onCleanup, untrack, useContext, type Accessor, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {useLiveQuery} from '@tanstack/solid-db'
import type {Viewport} from '../../canvas/coords.js'
import type {CommentRow, PinRow, ReadRow} from '../../shared/rows.js'
import {useWhiteboardDb} from '../db.js'

export type Comment = CommentRow
export type Pin = PinRow

export type CommentsModel = ReturnType<typeof createCommentsModel>

const newest = (dates: number[]): number | undefined => (dates.length === 0 ? undefined : Math.max(...dates))

export function createCommentsModel(room: Accessor<string>, onThreadChange: (open: boolean) => void) {
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
    pinButtons: Partial<Record<string, HTMLButtonElement>>
  }>({
    openCid: null,
    viewport: undefined,
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
    onThreadChange(true)
    markRead(cid)
  }
  const closeThread = (): void => {
    setState('openCid', null)
    onThreadChange(false)
  }
  const toggleThread = (cid: string): void => (state.openCid === cid ? closeThread() : openThread(cid))
  const registerPin = (cid: string, button: HTMLButtonElement | undefined): void =>
    void setState('pinButtons', cid, button)
  const pinButton = (cid: string): HTMLButtonElement | undefined => state.pinButtons[cid]
  const openPinButton = (): HTMLButtonElement | undefined =>
    state.openCid === null ? undefined : pinButton(state.openCid)

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
  const deleteThread = (parent: Comment): void => {
    comments()
      .filter((comment) => comment.threadId === parent.threadId)
      .forEach((comment) => db.comments.delete(comment.id))
    const pin = pins().find((row) => row.cid === parent.cid)
    if (pin) db.pins.delete(pin.id)
    if (state.openCid === parent.cid) closeThread()
  }
  const removeComment = (comment: Comment): void => {
    if (comment.cid === comment.threadId) return deleteThread(comment)
    db.comments.delete(comment.id)
  }

  const movePin = (cid: string, patch: Partial<Pick<Pin, 'x' | 'y' | 'pinState' | 'anchorX' | 'anchorY'>>): void => {
    const pin = pins().find((row) => row.cid === cid)
    if (pin) db.pins.update(pin.id, (draft) => void Object.assign(draft, patch))
  }
  const detachAnchor = (cid: string): void => {
    const comment = findRoot(cid)
    if (comment)
      db.comments.update(comment.id, (draft) => {
        draft.kind = 'floating'
        draft.anchor = null
        draft.anchorFile = null
      })
  }

  return {
    pins,
    findRoot,
    collectThread,
    displayName,
    ownedBySelf,
    openRoot,
    stepThread,
    canStep,
    reply,
    resolve,
    deleteThread,
    removeComment,
    closeThread,
    toggleThread,
    registerPin,
    pinButton,
    openPinButton,
    movePin,
    detachAnchor,
    isUnread,
    viewport: () => state.viewport,
    setViewport: (viewport: Viewport) => void setState('viewport', viewport),
  }
}

const CommentsContext = createContext<CommentsModel>()

export function CommentsProvider(props: {
  room: Accessor<string>
  onThreadChange: (open: boolean) => void
  children: JSX.Element
}): JSX.Element {
  const model = untrack(() => createCommentsModel(props.room, props.onThreadChange))
  onCleanup(() => props.onThreadChange(false))
  return <CommentsContext.Provider value={model}>{props.children}</CommentsContext.Provider>
}

export function useComments(): CommentsModel {
  const model = useContext(CommentsContext)
  if (!model) throw new Error('useComments must be used inside a CommentsProvider')
  return model
}
