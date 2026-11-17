import {createContext, untrack, useContext, type Accessor, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {useLiveQuery} from '@tanstack/solid-db'
import type {Viewport} from '../../canvas/coords.js'
import type {CommentRow, PinRow, ReadRow} from '../../shared/rows.js'
import {useWhiteboardDb} from '../db.js'

export type Comment = CommentRow
export type Pin = PinRow

export type CommentsModel = ReturnType<typeof createCommentsModel>

const newest = (dates: number[]): number | undefined => (dates.length === 0 ? undefined : Math.max(...dates))

export function createCommentsModel(room: Accessor<string>) {
  const db = useWhiteboardDb()
  const accountId = (): string => db.accountId()

  const commentRows = useLiveQuery((q) => q.from({row: db.comments}))
  const pinRows = useLiveQuery((q) => q.from({row: db.pins}))
  const readRows = useLiveQuery((q) => q.from({row: db.reads}))
  const comments = (): CommentRow[] => commentRows() ?? []
  const pins = (): PinRow[] => pinRows() ?? []
  const reads = (): ReadRow[] => readRows() ?? []

  const [state, setState] = createStore<{openCid: string | null; viewport: Viewport | undefined}>({
    openCid: null,
    viewport: undefined,
  })

  const findRoot = (cid: string): Comment | undefined => comments().find((comment) => comment.cid === cid)

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

  return {
    comments,
    pins,
    findRoot,
    ownedBySelf,
    openCid: () => state.openCid,
    openThread,
    closeThread,
    isUnread,
    markRead,
    viewport: () => state.viewport,
    setViewport: (viewport: Viewport) => void setState('viewport', viewport),
  }
}

const CommentsContext = createContext<CommentsModel>()

export function CommentsProvider(props: {room: Accessor<string>; children: JSX.Element}): JSX.Element {
  const model = untrack(() => createCommentsModel(props.room))
  return <CommentsContext.Provider value={model}>{props.children}</CommentsContext.Provider>
}

export function useComments(): CommentsModel {
  const model = useContext(CommentsContext)
  if (!model) throw new Error('useComments must be used inside a CommentsProvider')
  return model
}
