import {createContext, createMemo, createSignal, useContext, type Accessor, type JSX} from 'solid-js'
import {useLiveQuery} from '@tanstack/solid-db'
import {getHostApi} from '@conciv/extension'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import type {MentionSegment} from '@conciv/ui-kit-tap'
import {useWhiteboardDb} from '../db.js'
import type {CommentRow, JsonValue, PinRow} from '../../shared/rows.js'
import {screenToScene, sceneToScreen, type Viewport} from '../../canvas/coords.js'

export type Comment = CommentRow
export type Pin = PinRow
export type Participant = {id: string; label: string}
export type CommentSource = {file: string; line: number | null} | null
export type ComposeTarget = {source: CommentSource; screen: {x: number; y: number}}
export type Rect = {x: number; y: number; width: number; height: number}

export type CommentsModel = ReturnType<typeof createCommentsModel>

const toParts = (segments: MentionSegment[]): JsonValue =>
  segments.map((segment) =>
    segment.type === 'mention'
      ? {type: 'mention', id: segment.id, label: segment.label}
      : {type: 'text', text: segment.text},
  ) as unknown as JsonValue

const newest = (dates: number[]): number | undefined =>
  dates.reduce<number | undefined>((latest, date) => (date > (latest ?? -1) ? date : latest), undefined)

export function createCommentsModel(
  room: Accessor<string>,
  apiBase: string,
  canvasOpen: Accessor<boolean>,
  onComposeSettled: (outcome: 'added' | 'cancelled') => void,
) {
  const db = useWhiteboardDb()
  const accountId = (): string => db.accountId()
  const ctx: ToolViewCtx = {apiBase, harnessId: '', sendMessage: () => {}}

  const commentRows = useLiveQuery((q) => q.from({row: db.comments}))
  const pinRows = useLiveQuery((q) => q.from({row: db.pins}))
  const readRows = useLiveQuery((q) => q.from({row: db.reads}))
  const comments = (): CommentRow[] => commentRows() ?? []
  const pins = (): PinRow[] => pinRows() ?? []

  const [openCid, setOpenCid] = createSignal<string | null>(null)
  const [viewport, setViewport] = createSignal<Viewport>()
  const [composeTarget, setComposeTarget] = createSignal<ComposeTarget | null>(null)
  const [pendingAnchor, setPendingAnchor] = createSignal<{x: number; y: number} | null>(null)
  const [inboxOpen, setInboxOpen] = createSignal(false)
  const [sortMode, setSortMode] = createSignal<'date' | 'unread'>('date')
  const [showResolved, setShowResolved] = createSignal(false)
  const pinEls = new Map<string, HTMLButtonElement>()
  let panFn: ((sceneX: number, sceneY: number) => void) | undefined

  const rootOf = (cid: string): Comment | undefined => comments().find((comment) => comment.cid === cid)
  const threadOf = (cid: string): Comment[] => {
    const threadId = rootOf(cid)?.threadId
    if (!threadId) return []
    return comments()
      .filter((comment) => comment.threadId === threadId)
      .toSorted((left, right) => left.createdAt - right.createdAt)
  }
  const roots = createMemo(() => comments().filter((comment) => !comment.parentId))
  const orderedThreads = createMemo(() => {
    const visible = roots().filter((root) => showResolved() || root.status !== 'resolved')
    const byDate = visible.toSorted((left, right) => right.createdAt - left.createdAt)
    return sortMode() === 'date'
      ? byDate
      : byDate.toSorted((left, right) => Number(isUnread(right.cid)) - Number(isUnread(left.cid)))
  })
  const aiLabel = (comment: Comment): string => comment.authorName ?? comment.authorModel ?? 'AI'
  const participantKey = (comment: Comment): string =>
    comment.authorKind === 'ai' ? `ai:${aiLabel(comment)}` : (comment.authorId ?? 'human')
  const threadParticipants = (cid: string): Participant[] => {
    const seen = new Map<string, Participant>()
    threadOf(cid).forEach((comment) => {
      const key = participantKey(comment)
      if (!seen.has(key)) seen.set(key, {id: key, label: displayName(comment)})
    })
    return [...seen.values()]
  }
  const replyCount = (cid: string): number => Math.max(0, threadOf(cid).length - 1)
  const lastActivityAt = (cid: string): number | undefined => newest(threadOf(cid).map((comment) => comment.createdAt))

  const humanParticipant = (comment: Comment, self: string): Participant | null =>
    comment.authorId
      ? {id: comment.authorId, label: comment.authorId === self ? 'You' : (comment.authorName ?? 'Human')}
      : null
  const participantOf = (comment: Comment, self: string): Participant | null =>
    comment.authorKind === 'ai'
      ? {id: `ai:${aiLabel(comment)}`, label: aiLabel(comment)}
      : humanParticipant(comment, self)
  const participants = createMemo<Participant[]>(() => {
    const seen = new Map<string, Participant>()
    const self = accountId()
    if (self) seen.set(self, {id: self, label: 'You'})
    comments().forEach((comment) => {
      const entry = participantOf(comment, self)
      if (entry) seen.set(entry.id, entry)
    })
    return [...seen.values()]
  })
  const humanLabel = (comment: Comment): string =>
    comment.authorId && comment.authorId === accountId() ? 'You' : (comment.authorName ?? 'Human')
  const displayName = (comment: Comment): string =>
    comment.authorKind === 'ai' ? aiLabel(comment) : humanLabel(comment)
  const ownedBySelf = (comment: Comment): boolean =>
    comment.authorKind === 'human' && comment.authorId != null && comment.authorId === accountId()

  const readAt = (threadId: string): number | undefined =>
    (readRows() ?? []).find((row) => row.threadId === threadId && row.accountId === accountId())?.lastReadAt
  const newestForeign = (threadId: string): number | undefined =>
    newest(
      comments()
        .filter((comment) => comment.threadId === threadId && !ownedBySelf(comment))
        .map((comment) => comment.createdAt),
    )
  const isUnread = (threadId: string): boolean => {
    const foreign = newestForeign(threadId)
    if (!foreign) return false
    const since = readAt(threadId)
    return !since || foreign > since
  }
  const markRead = (threadId: string): void => {
    const self = accountId()
    if (!self) return
    const existing = (readRows() ?? []).find((row) => row.threadId === threadId && row.accountId === self)
    if (existing) return void db.reads.update(existing.id, (draft) => void (draft.lastReadAt = Date.now()))
    db.reads.insert({id: crypto.randomUUID(), sessionId: room(), threadId, accountId: self, lastReadAt: Date.now()})
  }
  const markAllRead = (): void => orderedThreads().forEach((thread) => markRead(thread.cid))

  const openThread = (cid: string): void => {
    setPendingAnchor(null)
    setOpenCid(cid)
    markRead(cid)
  }
  const closeThread = (): void => {
    setPendingAnchor(null)
    setOpenCid(null)
  }
  const stepIndex = (): number => orderedThreads().findIndex((thread) => thread.cid === openCid())
  const stepThread = (delta: number): void => {
    const target = orderedThreads()[stepIndex() + delta]
    if (stepIndex() >= 0 && target) openThread(target.cid)
  }
  const canStep = (delta: number): boolean => stepIndex() >= 0 && orderedThreads()[stepIndex() + delta] !== undefined

  const movePin = (cid: string, patch: Partial<Pick<Pin, 'x' | 'y' | 'pinState' | 'anchorX' | 'anchorY'>>): void => {
    const pin = pins().find((row) => row.cid === cid)
    if (pin) db.pins.update(pin.id, (draft) => Object.assign(draft, patch))
  }
  const detachAnchor = (cid: string): void => {
    const comment = rootOf(cid)
    if (comment)
      db.comments.update(comment.id, (draft) => {
        draft.kind = 'floating'
        draft.anchor = null
        draft.anchorFile = null
      })
  }

  const registerPin = (cid: string, element: HTMLButtonElement | null): void => {
    if (element) pinEls.set(cid, element)
    else pinEls.delete(cid)
  }
  const openPinEl = (): HTMLButtonElement | null => {
    const cid = openCid()
    return cid ? (pinEls.get(cid) ?? null) : null
  }
  const pinElementRect = (): Rect | null => {
    const rect = openPinEl()?.getBoundingClientRect()
    return rect ? {x: rect.x, y: rect.y, width: rect.width, height: rect.height} : null
  }
  const pinSceneRect = (): Rect | null => {
    const cid = openCid()
    const pin = cid ? pins().find((row) => row.cid === cid) : undefined
    const view = viewport()
    if (!pin || !view) return null
    const point = sceneToScreen(view, pin.x, pin.y)
    return {x: point.x, y: point.y, width: 0, height: 0}
  }
  const pendingRect = (): Rect | null => {
    const pending = pendingAnchor()
    return pending ? {x: pending.x, y: pending.y, width: 0, height: 0} : null
  }
  const missingAnchor = (): null => {
    if (openCid()) console.warn('whiteboard: thread anchor is null while open; the popover will misposition to 0,0')
    return null
  }
  const anchorRect = (): Rect | null => pinElementRect() ?? pinSceneRect() ?? pendingRect() ?? missingAnchor()
  const registerPan = (fn: (sceneX: number, sceneY: number) => void): void => void (panFn = fn)
  const panToThread = (cid: string): void => {
    const pin = pins().find((row) => row.cid === cid)
    if (pin) panFn?.(pin.x, pin.y)
  }

  const startCompose = (target: ComposeTarget): void => void setComposeTarget(target)
  const cancelCompose = (): void => {
    setComposeTarget(null)
    onComposeSettled('cancelled')
  }
  const anchorOf = (source: CommentSource): JsonValue | null =>
    source ? ({source: {file: source.file, line: source.line ?? 1, column: 1}} as JsonValue) : null
  const newComment = (target: ComposeTarget, cid: string, text: string): void => {
    const now = Date.now()
    db.comments.insert({
      id: crypto.randomUUID(),
      sessionId: room(),
      cid,
      threadId: cid,
      parentId: null,
      parts: [{type: 'text', text}] as JsonValue,
      authorKind: 'human',
      authorModel: null,
      authorId: accountId(),
      authorName: null,
      authorAvatar: null,
      status: 'open',
      kind: target.source ? 'source-linked' : 'floating',
      anchor: anchorOf(target.source),
      anchorFile: target.source?.file ?? null,
      anchorComponent: null,
      anchorHash: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    })
  }
  const newPin = (target: ComposeTarget, cid: string): void => {
    const view = viewport()
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
  const revealThread = (target: ComposeTarget, cid: string): void => {
    if (!canvasOpen()) return
    openThread(cid)
    setPendingAnchor(target.screen)
  }
  const createComment = (target: ComposeTarget, text: string): void => {
    const cid = crypto.randomUUID()
    newComment(target, cid, text)
    newPin(target, cid)
    setComposeTarget(null)
    revealThread(target, cid)
    onComposeSettled('added')
  }

  const reply = (segments: MentionSegment[]): void => {
    const parent = rootOf(openCid() ?? '')
    if (!parent || segments.length === 0) return
    const now = Date.now()
    db.comments.insert({
      id: crypto.randomUUID(),
      sessionId: room(),
      cid: crypto.randomUUID(),
      threadId: parent.threadId,
      parentId: parent.cid,
      parts: toParts(segments),
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
    const parent = rootOf(openCid() ?? '')
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
    const parent = rootOf(openCid() ?? '')
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

  const toggleInbox = (): void => void setInboxOpen((value) => !value)
  const closeInbox = (): void => void setInboxOpen(false)

  return {
    ctx,
    comments,
    pins,
    rootOf,
    threadOf,
    orderedThreads,
    participants,
    threadParticipants,
    replyCount,
    lastActivityAt,
    displayName,
    ownedBySelf,
    openCid,
    openThread,
    closeThread,
    stepThread,
    canStep,
    isUnread,
    markRead,
    markAllRead,
    movePin,
    detachAnchor,
    inboxOpen,
    toggleInbox,
    closeInbox,
    sortMode,
    setSortMode,
    showResolved,
    setShowResolved,
    viewport,
    setViewport,
    registerPan,
    panToThread,
    registerPin,
    anchorRect,
    openPinEl,
    composeTarget,
    startCompose,
    cancelCompose,
    createComment,
    reply,
    resolve,
    deleteThread,
    removeComment,
  }
}

const CommentsContext = createContext<CommentsModel>()

export function CommentsProvider(props: {
  room: Accessor<string>
  apiBase: string
  canvasOpen: Accessor<boolean>
  onComposeSettled: (outcome: 'added' | 'cancelled') => void
  children: JSX.Element
}): JSX.Element {
  const {Suppress} = getHostApi()
  const model = createCommentsModel(props.room, props.apiBase, props.canvasOpen, props.onComposeSettled)
  return (
    <CommentsContext.Provider value={model}>
      <Suppress when={model.openCid() !== null || model.composeTarget() !== null}>{props.children}</Suppress>
    </CommentsContext.Provider>
  )
}

export function useComments(): CommentsModel {
  const model = useContext(CommentsContext)
  if (!model) throw new Error('useComments must be used inside a CommentsProvider')
  return model
}
