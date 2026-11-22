import type {CommentRow} from '../src/rows.js'

export function humanSourceComment(
  cid: string,
  source: Pick<CommentRow, 'anchor' | 'anchorFile' | 'anchorComponent' | 'anchorHash'>,
): Omit<CommentRow, 'sessionId'> {
  return {
    id: `${cid}-row`,
    cid,
    threadId: cid,
    parentId: null,
    parts: [{type: 'text', text: 'This button looks disabled'}],
    authorKind: 'human',
    authorModel: null,
    authorId: null,
    authorName: null,
    authorAvatar: null,
    status: 'open',
    kind: 'source-linked',
    ...source,
    createdAt: 1,
    updatedAt: 1,
    resolvedAt: null,
  }
}
