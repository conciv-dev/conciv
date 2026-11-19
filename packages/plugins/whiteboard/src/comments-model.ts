import {createMemo, type Accessor} from 'solid-js'
import {createStore} from 'solid-js/store'
import {useLiveQuery} from '@tanstack/solid-db'
import {maxBy} from 'es-toolkit'
import type {Viewport} from './coords.js'
import type {CommentRow, PinRow, ReadRow} from './rows.js'
import {useWhiteboardDb} from './db.js'
import {
  deleteThreadRows,
  detachCommentAnchor,
  insertReply,
  markThreadRead,
  movePinRow,
  resolveThread,
  type PinPatch,
} from './comment-writes.js'
import {createPinDrag} from './pin-drag.js'

export type CommentsModel = ReturnType<typeof createCommentsModel>

export type ChatCover = {threadOpen: Accessor<boolean>; prompting: Accessor<boolean>}

export function createCommentsModel(room: Accessor<string>) {
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

  const findRoot = (cid: string): CommentRow | undefined => comments().find((comment) => comment.cid === cid)

  const collectThread = (cid: string): CommentRow[] => {
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
  const aiLabel = (comment: CommentRow): string => comment.authorName ?? comment.authorModel ?? 'AI'
  const humanLabel = (comment: CommentRow): string =>
    comment.authorId && comment.authorId === accountId() ? 'You' : (comment.authorName ?? 'Human')
  const displayName = (comment: CommentRow): string =>
    comment.authorKind === 'ai' ? aiLabel(comment) : humanLabel(comment)
  const ownedBySelf = (comment: CommentRow): boolean =>
    comment.authorKind === 'human' && comment.authorId != null && comment.authorId === accountId()

  const readAt = (threadId: string): number | undefined =>
    reads().find((row) => row.threadId === threadId && row.accountId === accountId())?.lastReadAt
  const newestForeign = (threadId: string): number | undefined =>
    maxBy(
      comments().filter((comment) => comment.threadId === threadId && !ownedBySelf(comment)),
      (comment) => comment.createdAt,
    )?.createdAt
  const isUnread = (threadId: string): boolean => {
    const foreign = newestForeign(threadId)
    if (foreign === undefined) return false
    const since = readAt(threadId)
    return since === undefined || foreign > since
  }
  const markRead = (threadId: string): void =>
    markThreadRead(db, {room: room(), accountId: accountId(), threadId, reads: reads()})

  const openThread = (cid: string): void => {
    setState('openCid', cid)
    markRead(cid)
  }
  const closeThread = (): void => {
    setState('openCid', null)
  }
  const toggleThread = (cid: string): void => (state.openCid === cid ? closeThread() : openThread(cid))
  const registerPin = (cid: string, button: HTMLButtonElement | undefined): void =>
    void setState('pinButtons', cid, button)
  const pinButton = (cid: string): HTMLButtonElement | undefined => state.pinButtons[cid]
  const openPinButton = (): HTMLButtonElement | undefined =>
    state.openCid === null ? undefined : pinButton(state.openCid)

  const stepIndex = (): number => orderedThreads().findIndex((thread) => thread.cid === state.openCid)
  const stepThread = (delta: number): void => {
    const threads = orderedThreads()
    if (stepIndex() < 0) return
    const target = threads[(stepIndex() + delta + threads.length) % threads.length]
    if (target) openThread(target.cid)
  }
  const openRoot = (): CommentRow | undefined => (state.openCid === null ? undefined : findRoot(state.openCid))
  const threadOpen = createMemo(() => openRoot() !== undefined)

  const reply = (text: string): void => {
    const parent = openRoot()
    if (parent) insertReply(db, {room: room(), accountId: accountId(), parent, text})
  }
  const resolve = (): void => {
    const parent = openRoot()
    if (!parent) return
    resolveThread(db, parent)
    closeThread()
  }
  const deleteThread = (parent: CommentRow): void => {
    deleteThreadRows(db, {parent, comments: comments(), pins: pins()})
    if (state.openCid === parent.cid) closeThread()
  }
  const removeComment = (comment: CommentRow): void => {
    if (comment.cid === comment.threadId) return deleteThread(comment)
    db.comments.delete(comment.id)
  }

  const movePin = (cid: string, patch: PinPatch): void => movePinRow(db, {pins: pins(), cid, patch})
  const detachAnchor = (cid: string): void => {
    const comment = findRoot(cid)
    if (comment) detachCommentAnchor(db, comment)
  }
  const drag = createPinDrag({detachAnchor, movePin, pinButton, closeThread, toggleThread})

  return {
    pins,
    findRoot,
    collectThread,
    displayName,
    ownedBySelf,
    openRoot,
    threadOpen,
    stepThread,
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
    drag,
    prompting: drag.prompting,
    viewport: () => state.viewport,
    setViewport: (viewport: Viewport) => void setState('viewport', viewport),
  }
}
