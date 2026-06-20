import {DatabaseSync} from 'node:sqlite'
import {mkdirSync} from 'node:fs'
import {join} from 'node:path'

// The durable comment store. Core is the sole client (the browser never touches it — our security
// model forbids browser->backend, which is exactly TrailBase's Record-API value, so direct SQLite is
// the natural fit). On-disk at <stateRoot>/.mandarax/comments.db, FTS5 over parts text, inspectable by
// the `trail` binary over the same file. The factory is the swap seam (trail-over-HTTP later).
export type CommentInput = {
  id: string
  sessionId: string
  previewId: string
  threadId: string
  parentId?: string | null
  parts: unknown
  authorKind: 'human' | 'ai'
  authorModel?: string | null
  kind: 'source-linked' | 'floating'
  anchor?: unknown
  anchorFile?: string | null
  anchorComponent?: string | null
  anchorHash?: string | null
}

export type Comment = Omit<CommentInput, 'parts' | 'anchor'> & {
  parts: unknown
  anchor: unknown
  status: 'open' | 'resolved' | 'drifted' | 'orphaned'
  resolvedAt?: number | null
  resolvedBy?: string | null
  createdAt: number
  updatedAt: number
}

export type ListFilter = {sessionId?: string; file?: string; status?: Comment['status']}

export type CommentStore = {
  create: (input: CommentInput, now?: number) => Comment
  get: (id: string) => Comment | null
  list: (filter?: ListFilter) => Comment[]
  search: (query: string, sessionId?: string) => Comment[]
  setStatus: (id: string, status: Comment['status'], by?: string, now?: number) => Comment
  delete: (id: string) => void
  close: () => void
}

type Row = {
  id: string
  session_id: string
  preview_id: string
  thread_id: string
  parent_id: string | null
  parts: string
  author_kind: string
  author_model: string | null
  status: string
  kind: string
  anchor: string | null
  anchor_file: string | null
  anchor_component: string | null
  anchor_hash: string | null
  resolved_at: number | null
  resolved_by: string | null
  created_at: number
  updated_at: number
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  preview_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  parent_id TEXT,
  parts TEXT NOT NULL,
  author_kind TEXT NOT NULL,
  author_model TEXT,
  status TEXT NOT NULL,
  kind TEXT NOT NULL,
  anchor TEXT,
  anchor_file TEXT,
  anchor_component TEXT,
  anchor_hash TEXT,
  resolved_at INTEGER,
  resolved_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS comments_session ON comments(session_id);
CREATE INDEX IF NOT EXISTS comments_file ON comments(anchor_file);
CREATE INDEX IF NOT EXISTS comments_status ON comments(status);
CREATE VIRTUAL TABLE IF NOT EXISTS comments_fts USING fts5(id UNINDEXED, body);
`

// Flatten a parts array to searchable text (text parts only; tool parts are not full-text indexed).
function partsText(parts: unknown): string {
  if (!Array.isArray(parts)) return ''
  return parts
    .map((p) => (p && typeof p === 'object' && 'text' in p ? String((p as {text: unknown}).text) : ''))
    .join(' ')
    .trim()
}

function toComment(r: Row): Comment {
  return {
    id: r.id,
    sessionId: r.session_id,
    previewId: r.preview_id,
    threadId: r.thread_id,
    parentId: r.parent_id,
    parts: JSON.parse(r.parts),
    authorKind: r.author_kind as Comment['authorKind'],
    authorModel: r.author_model,
    status: r.status as Comment['status'],
    kind: r.kind as Comment['kind'],
    anchor: r.anchor ? JSON.parse(r.anchor) : null,
    anchorFile: r.anchor_file,
    anchorComponent: r.anchor_component,
    anchorHash: r.anchor_hash,
    resolvedAt: r.resolved_at,
    resolvedBy: r.resolved_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function createCommentStore(opts: {stateRoot: string; now?: () => number}): CommentStore {
  const dir = join(opts.stateRoot, '.mandarax')
  mkdirSync(dir, {recursive: true})
  const db = new DatabaseSync(join(dir, 'comments.db'))
  db.exec(SCHEMA)
  const clock = opts.now ?? Date.now

  const readRow = (id: string) => db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as Row | undefined

  return {
    create: (input, now = clock()) => {
      db.prepare(
        `INSERT INTO comments
          (id, session_id, preview_id, thread_id, parent_id, parts, author_kind, author_model,
           status, kind, anchor, anchor_file, anchor_component, anchor_hash, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        input.id,
        input.sessionId,
        input.previewId,
        input.threadId,
        input.parentId ?? null,
        JSON.stringify(input.parts ?? []),
        input.authorKind,
        input.authorModel ?? null,
        'open',
        input.kind,
        input.anchor === undefined ? null : JSON.stringify(input.anchor),
        input.anchorFile ?? null,
        input.anchorComponent ?? null,
        input.anchorHash ?? null,
        now,
        now,
      )
      db.prepare('INSERT INTO comments_fts (id, body) VALUES (?, ?)').run(input.id, partsText(input.parts))
      return toComment(readRow(input.id)!)
    },
    get: (id) => {
      const r = readRow(id)
      return r ? toComment(r) : null
    },
    list: (filter = {}) => {
      const clauses: string[] = []
      const params: unknown[] = []
      if (filter.sessionId) {
        clauses.push('session_id = ?')
        params.push(filter.sessionId)
      }
      if (filter.file) {
        clauses.push('anchor_file = ?')
        params.push(filter.file)
      }
      if (filter.status) {
        clauses.push('status = ?')
        params.push(filter.status)
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
      const rows = db.prepare(`SELECT * FROM comments ${where} ORDER BY created_at ASC`).all(...params) as Row[]
      return rows.map(toComment)
    },
    search: (query, sessionId) => {
      const rows = db
        .prepare(
          `SELECT c.* FROM comments c JOIN comments_fts f ON f.id = c.id
           WHERE comments_fts MATCH ? ${sessionId ? 'AND c.session_id = ?' : ''} ORDER BY c.created_at ASC`,
        )
        .all(...(sessionId ? [query, sessionId] : [query])) as Row[]
      return rows.map(toComment)
    },
    setStatus: (id, status, by, now = clock()) => {
      const resolved = status === 'resolved'
      db.prepare('UPDATE comments SET status = ?, resolved_at = ?, resolved_by = ?, updated_at = ? WHERE id = ?').run(
        status,
        resolved ? now : null,
        resolved ? (by ?? null) : null,
        now,
        id,
      )
      return toComment(readRow(id)!)
    },
    delete: (id) => {
      db.prepare('DELETE FROM comments WHERE id = ?').run(id)
      db.prepare('DELETE FROM comments_fts WHERE id = ?').run(id)
    },
    close: () => {
      if (db.isOpen) db.close()
    },
  }
}
