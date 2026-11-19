import {createMemo, type Accessor} from 'solid-js'
import {createStore} from 'solid-js/store'
import {useLiveQuery} from '@tanstack/solid-db'
import {maxBy, uniq, uniqBy} from 'es-toolkit'
import type {MentionItem, MentionSegment} from '@conciv/ui-kit-tap'
import {screenToScene, type Viewport} from './coords.js'
import type {CommentRow, PinRow, ReadRow} from './rows.js'
import {useWhiteboardDb} from './db.js'
import {
  deleteThreadRows,
  insertComposedComment,
  detachCommentAnchor,
  insertReply,
  markThreadRead,
  movePinRow,
  resolveThread,
  type PinPatch,
} from './comment-writes.js'
import {createPinDrag} from './pin-drag.js'

export type CommentsModel = ReturnType<typeof createCommentsModel>

export type ComposeTarget = {source: {file: string; line: number | null} | null; screen: {x: number; y: number}}

export type InboxSort = 'date' | 'unread'

export type ChatCover = {
  threadOpen: Accessor<boolean>
  inboxOpen: Accessor<boolean>
  prompting: Accessor<boolean>
  addComment: (target: ComposeTarget, text: string, reveal: boolean) => void
}

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
    inbox: {open: boolean; sort: InboxSort; showResolved: boolean}
    pan: ((sceneX: number, sceneY: number) => void) | undefined
  }>({
    openCid: null,
    viewport: undefined,
    pinButtons: {},
    inbox: {open: false, sort: 'date', showResolved: false},
    pan: undefined,
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
  const inboxThreads = createMemo(() => {
    const byDate = comments()
      .filter((comment) => !comment.parentId && (state.inbox.showResolved || comment.status !== 'resolved'))
      .toSorted((left, right) => right.createdAt - left.createdAt)
    if (state.inbox.sort === 'date') return byDate
    return byDate.toSorted((left, right) => Number(isUnread(right.cid)) - Number(isUnread(left.cid)))
  })
  const aiLabel = (comment: CommentRow): string => comment.authorName ?? comment.authorModel ?? 'AI'
  const humanLabel = (comment: CommentRow): string =>
    comment.authorId && comment.authorId === accountId() ? 'You' : (comment.authorName ?? 'Human')
  const displayName = (comment: CommentRow): string =>
    comment.authorKind === 'ai' ? aiLabel(comment) : humanLabel(comment)
  const ownedBySelf = (comment: CommentRow): boolean =>
    comment.authorKind === 'human' && comment.authorId != null && comment.authorId === accountId()
  const participant = (comment: CommentRow): MentionItem | null => {
    if (comment.authorKind === 'ai') return {id: `ai:${aiLabel(comment)}`, label: aiLabel(comment)}
    return comment.authorId ? {id: comment.authorId, label: humanLabel(comment)} : null
  }
  const participants = createMemo(() =>
    uniqBy(
      [{id: accountId(), label: 'You'}, ...comments().flatMap((comment) => participant(comment) ?? [])],
      (item) => item.id,
    ),
  )

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
  const markAllRead = (): void => inboxThreads().forEach((thread) => markRead(thread.cid))
  const replyCount = (cid: string): number => Math.max(0, collectThread(cid).length - 1)
  const lastActivityAt = (cid: string): number | undefined =>
    maxBy(collectThread(cid), (comment) => comment.createdAt)?.createdAt
  const threadParticipants = (cid: string): string[] => uniq(collectThread(cid).map(displayName))
  const panToThread = (cid: string): void => {
    const pin = pins().find((row) => row.cid === cid)
    if (pin) state.pan?.(pin.x, pin.y)
  }

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

  const reply = (segments: MentionSegment[]): void => {
    const parent = openRoot()
    if (parent && segments.length > 0) insertReply(db, {room: room(), accountId: accountId(), parent, parts: segments})
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
  const addComment = (target: ComposeTarget, text: string, reveal: boolean): void => {
    const cid = crypto.randomUUID()
    const at = state.viewport ? screenToScene(state.viewport, target.screen.x, target.screen.y) : target.screen
    insertComposedComment(db, {room: room(), accountId: accountId(), cid, source: target.source, text, at})
    if (reveal) openThread(cid)
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
    participants,
    reply,
    resolve,
    deleteThread,
    removeComment,
    closeThread,
    toggleThread,
    openThread,
    registerPin,
    pinButton,
    openPinButton,
    movePin,
    detachAnchor,
    isUnread,
    inboxThreads,
    markAllRead,
    replyCount,
    lastActivityAt,
    threadParticipants,
    panToThread,
    inbox: () => state.inbox,
    inboxOpen: () => state.inbox.open,
    setInboxOpen: (open: boolean) => void setState('inbox', 'open', open),
    setInboxSort: (sort: InboxSort) => void setState('inbox', 'sort', sort),
    setShowResolved: (showResolved: boolean) => void setState('inbox', 'showResolved', showResolved),
    registerPan: (pan: (sceneX: number, sceneY: number) => void) => void setState('pan', () => pan),
    addComment,
    drag,
    prompting: drag.prompting,
    viewport: () => state.viewport,
    setViewport: (viewport: Viewport) => void setState('viewport', viewport),
  }
}
