import {createContext, createMemo, createSignal, onCleanup, useContext, type Accessor, type JSX} from 'solid-js'
import {useAll, useDb, useSession} from 'jazz-tools/solid'
import type {JsonValue} from 'jazz-tools'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import type {MentionSegment} from '@conciv/ui-kit-tap'
import {app} from '../../shared/schema.js'
import {screenToScene, sceneToScreen, type Viewport} from '../../canvas/coords.js'

export type Comment = {
  id: string
  cid: string
  threadId: string
  parentId?: string
  parts: JsonValue
  authorKind: 'human' | 'ai'
  authorModel?: string
  authorId?: string
  authorName?: string
  authorAvatar?: string
  status: 'open' | 'resolved' | 'drifted' | 'orphaned'
  kind: 'source-linked' | 'floating'
  anchor?: JsonValue
  anchorFile?: string
  createdAt: Date
  updatedAt: Date
}
export type Pin = {
  id: string
  cid: string
  x: number
  y: number
  pinState: 'locked' | 'offset'
  anchorX?: number
  anchorY?: number
}
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

const newest = (dates: Date[]): Date | undefined =>
  dates.reduce<Date | undefined>(
    (latest, date) => (date.getTime() > (latest?.getTime() ?? -1) ? date : latest),
    undefined,
  )

// The single source of truth for the comments overlay: subscriptions, selection, ordering, read-state,
// viewport, the pin DOM registry, and every Jazz write. Views read it through useComments() and stay
// presentational — no business logic, no prop-drilling.
export function createCommentsModel(
  room: Accessor<string>,
  apiBase: string,
  suppressWhile: (active: () => boolean) => () => void,
) {
  const db = useDb()
  const session = useSession()
  const accountId = (): string | undefined => session()?.user_id
  const ctx: ToolViewCtx = {apiBase, harnessId: '', sendMessage: () => {}}

  const commentRows = useAll(() => ({query: app.comments.where({sessionId: room()})}))
  const pinRows = useAll(() => ({query: app.pins.where({room: room()})}))
  const readRows = useAll(() => ({query: app.reads.where({sessionId: room()})}))
  const comments = (): Comment[] => (commentRows.data ?? []) as Comment[]
  const pins = (): Pin[] => (pinRows.data ?? []) as Pin[]

  const [openCid, setOpenCid] = createSignal<string | null>(null)
  const [viewport, setViewport] = createSignal<Viewport>()
  const [composeTarget, setComposeTarget] = createSignal<ComposeTarget | null>(null)
  const [pendingAnchor, setPendingAnchor] = createSignal<{x: number; y: number} | null>(null)
  const [inboxOpen, setInboxOpen] = createSignal(false)
  const [sortMode, setSortMode] = createSignal<'date' | 'unread'>('date')
  const [showResolved, setShowResolved] = createSignal(false)
  const pinEls = new Map<string, HTMLButtonElement>()
  let panFn: ((sceneX: number, sceneY: number) => void) | undefined

  onCleanup(suppressWhile(() => openCid() !== null || composeTarget() !== null))

  const rootOf = (cid: string): Comment | undefined => comments().find((comment) => comment.cid === cid)
  const threadOf = (cid: string): Comment[] => {
    const threadId = rootOf(cid)?.threadId
    if (!threadId) return []
    return comments()
      .filter((comment) => comment.threadId === threadId)
      .toSorted((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
  }
  const roots = createMemo(() => comments().filter((comment) => !comment.parentId))
  const orderedThreads = createMemo(() => {
    const visible = roots().filter((root) => showResolved() || root.status !== 'resolved')
    const byDate = visible.toSorted((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    return sortMode() === 'date'
      ? byDate
      : byDate.toSorted((left, right) => Number(isUnread(right.cid)) - Number(isUnread(left.cid)))
  })
  const threadParticipants = (cid: string): Participant[] => {
    const seen = new Map<string, Participant>()
    threadOf(cid).forEach((comment) => {
      const key =
        comment.authorKind === 'ai'
          ? `ai:${comment.authorName ?? comment.authorModel ?? 'AI'}`
          : (comment.authorId ?? 'human')
      if (!seen.has(key)) seen.set(key, {id: key, label: displayName(comment)})
    })
    return [...seen.values()]
  }
  const replyCount = (cid: string): number => Math.max(0, threadOf(cid).length - 1)
  const lastActivityAt = (cid: string): Date | undefined => newest(threadOf(cid).map((comment) => comment.createdAt))

  const participants = createMemo<Participant[]>(() => {
    const seen = new Map<string, Participant>()
    const self = accountId()
    if (self) seen.set(self, {id: self, label: 'You'})
    comments().forEach((comment) => {
      if (comment.authorKind === 'ai') {
        const label = comment.authorName ?? comment.authorModel ?? 'AI'
        seen.set(`ai:${label}`, {id: `ai:${label}`, label})
      } else if (comment.authorId) {
        seen.set(comment.authorId, {
          id: comment.authorId,
          label: comment.authorId === self ? 'You' : (comment.authorName ?? 'Human'),
        })
      }
    })
    return [...seen.values()]
  })
  const displayName = (comment: Comment): string =>
    comment.authorKind === 'ai'
      ? (comment.authorName ?? comment.authorModel ?? 'AI')
      : comment.authorId && comment.authorId === accountId()
        ? 'You'
        : (comment.authorName ?? 'Human')
  const ownedBySelf = (comment: Comment): boolean =>
    comment.authorKind === 'human' && comment.authorId != null && comment.authorId === accountId()

  const readAt = (threadId: string): Date | undefined =>
    (readRows.data ?? []).find((row) => row.threadId === threadId && row.accountId === accountId())?.lastReadAt
  const newestForeign = (threadId: string): Date | undefined =>
    newest(
      comments()
        .filter((comment) => comment.threadId === threadId && !ownedBySelf(comment))
        .map((comment) => comment.createdAt),
    )
  const isUnread = (threadId: string): boolean => {
    const foreign = newestForeign(threadId)
    if (!foreign) return false
    const since = readAt(threadId)
    return !since || foreign.getTime() > since.getTime()
  }
  const markRead = (threadId: string): void => {
    const self = accountId()
    if (!self) return
    const existing = (readRows.data ?? []).find((row) => row.threadId === threadId && row.accountId === self)
    const now = new Date()
    if (existing) db().update(app.reads, existing.id, {lastReadAt: now})
    else db().insert(app.reads, {sessionId: room(), threadId, accountId: self, lastReadAt: now})
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
    if (pin) db().update(app.pins, pin.id, patch)
  }
  const detachAnchor = (cid: string): void => {
    const comment = rootOf(cid)
    if (comment) db().update(app.comments, comment.id, {kind: 'floating', anchor: undefined, anchorFile: undefined})
  }

  const registerPin = (cid: string, element: HTMLButtonElement | null): void => {
    if (element) pinEls.set(cid, element)
    else pinEls.delete(cid)
  }
  const openPinEl = (): HTMLButtonElement | null => {
    const cid = openCid()
    return cid ? (pinEls.get(cid) ?? null) : null
  }
  const anchorRect = (): Rect | null => {
    const rect = openPinEl()?.getBoundingClientRect()
    if (rect) return {x: rect.x, y: rect.y, width: rect.width, height: rect.height}
    const cid = openCid()
    const pin = cid ? pins().find((row) => row.cid === cid) : undefined
    const view = viewport()
    if (pin && view) {
      const point = sceneToScreen(view, pin.x, pin.y)
      return {x: point.x, y: point.y, width: 0, height: 0}
    }
    const pending = pendingAnchor()
    if (pending) return {x: pending.x, y: pending.y, width: 0, height: 0}
    if (cid) console.warn('whiteboard: thread anchor is null while open; the popover will misposition to 0,0')
    return null
  }
  const registerPan = (fn: (sceneX: number, sceneY: number) => void): void => void (panFn = fn)
  const panToThread = (cid: string): void => {
    const pin = pins().find((row) => row.cid === cid)
    if (pin) panFn?.(pin.x, pin.y)
  }

  const startCompose = (target: ComposeTarget): void => void setComposeTarget(target)
  const cancelCompose = (): void => void setComposeTarget(null)
  const createComment = (target: ComposeTarget, text: string): void => {
    const cid = crypto.randomUUID()
    const now = new Date()
    const view = viewport()
    const center = view ? screenToScene(view, target.screen.x, target.screen.y) : target.screen
    db().insert(app.comments, {
      sessionId: room(),
      cid,
      threadId: cid,
      parts: [{type: 'text', text}] as JsonValue,
      authorKind: 'human',
      authorId: accountId(),
      status: 'open',
      kind: target.source ? 'source-linked' : 'floating',
      anchor: target.source
        ? ({source: {file: target.source.file, line: target.source.line ?? 1, column: 1}} as JsonValue)
        : undefined,
      anchorFile: target.source?.file ?? undefined,
      createdAt: now,
      updatedAt: now,
    })
    db().insert(app.pins, {room: room(), cid, x: center.x, y: center.y, pinState: 'locked'})
    setComposeTarget(null)
    openThread(cid)
    setPendingAnchor(target.screen)
  }

  const reply = (segments: MentionSegment[]): void => {
    const parent = rootOf(openCid() ?? '')
    if (!parent || segments.length === 0) return
    const now = new Date()
    db().insert(app.comments, {
      sessionId: room(),
      cid: crypto.randomUUID(),
      threadId: parent.threadId,
      parentId: parent.cid,
      parts: toParts(segments),
      authorKind: 'human',
      authorId: accountId(),
      status: 'open',
      kind: 'floating',
      createdAt: now,
      updatedAt: now,
    })
  }
  const resolve = (): void => {
    const parent = rootOf(openCid() ?? '')
    if (!parent) return
    const now = new Date()
    db().update(app.comments, parent.id, {status: 'resolved', resolvedAt: now, updatedAt: now})
    closeThread()
  }
  const deleteThread = (): void => {
    const parent = rootOf(openCid() ?? '')
    if (!parent) return
    comments()
      .filter((comment) => comment.threadId === parent.threadId)
      .forEach((comment) => db().delete(app.comments, comment.id))
    const pin = pins().find((row) => row.cid === parent.cid)
    if (pin) db().delete(app.pins, pin.id)
    closeThread()
  }
  const removeComment = (comment: Comment): void => {
    if (comment.cid === comment.threadId) return deleteThread()
    db().delete(app.comments, comment.id)
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
  suppressWhile: (active: () => boolean) => () => void
  children: JSX.Element
}): JSX.Element {
  const model = createCommentsModel(props.room, props.apiBase, props.suppressWhile)
  return <CommentsContext.Provider value={model}>{props.children}</CommentsContext.Provider>
}

export function useComments(): CommentsModel {
  const model = useContext(CommentsContext)
  if (!model) throw new Error('useComments must be used inside a CommentsProvider')
  return model
}
