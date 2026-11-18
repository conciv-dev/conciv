import type {CommentRow, PinRow, ReadRow} from './rows.js'
import type {WhiteboardDb} from './db.js'

export type PinPatch = Partial<Pick<PinRow, 'x' | 'y' | 'pinState' | 'anchorX' | 'anchorY'>>

export function markThreadRead(
  db: WhiteboardDb,
  input: {room: string; accountId: string; threadId: string; reads: readonly ReadRow[]},
): void {
  const existing = input.reads.find((row) => row.threadId === input.threadId && row.accountId === input.accountId)
  if (existing) return void db.reads.update(existing.id, (draft) => void (draft.lastReadAt = Date.now()))
  db.reads.insert({
    id: crypto.randomUUID(),
    sessionId: input.room,
    threadId: input.threadId,
    accountId: input.accountId,
    lastReadAt: Date.now(),
  })
}

export function insertReply(
  db: WhiteboardDb,
  input: {room: string; accountId: string; parent: CommentRow; text: string},
): void {
  const now = Date.now()
  db.comments.insert({
    id: crypto.randomUUID(),
    sessionId: input.room,
    cid: crypto.randomUUID(),
    threadId: input.parent.threadId,
    parentId: input.parent.cid,
    parts: [{type: 'text', text: input.text}],
    authorKind: 'human',
    authorModel: null,
    authorId: input.accountId,
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

export function resolveThread(db: WhiteboardDb, parent: CommentRow): void {
  const now = Date.now()
  db.comments.update(parent.id, (draft) => {
    draft.status = 'resolved'
    draft.resolvedAt = now
    draft.updatedAt = now
  })
}

export function deleteThreadRows(
  db: WhiteboardDb,
  input: {parent: CommentRow; comments: readonly CommentRow[]; pins: readonly PinRow[]},
): void {
  input.comments
    .filter((comment) => comment.threadId === input.parent.threadId)
    .forEach((comment) => db.comments.delete(comment.id))
  const pin = input.pins.find((row) => row.cid === input.parent.cid)
  if (pin) db.pins.delete(pin.id)
}

export function movePinRow(db: WhiteboardDb, input: {pins: readonly PinRow[]; cid: string; patch: PinPatch}): void {
  const pin = input.pins.find((row) => row.cid === input.cid)
  if (pin) db.pins.update(pin.id, (draft) => void Object.assign(draft, input.patch))
}

export function detachCommentAnchor(db: WhiteboardDb, comment: CommentRow): void {
  db.comments.update(comment.id, (draft) => {
    draft.kind = 'floating'
    draft.anchor = null
    draft.anchorFile = null
  })
}
