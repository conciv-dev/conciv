// The browser's comment data access: thin glue over core's shared, loopback-gated /api/tools/run (the
// browser NEVER talks to the comment store directly — core is the sole client). Optimistic UI state is
// layered in the Solid component; this client is just the typed transport. (A @tanstack/db-backed
// optimistic collection is the eventual upgrade behind this same shape.)
export type CommentRecord = {
  id: string
  threadId: string
  parentId?: string | null
  parts: {type: string; text?: string}[]
  authorKind: 'human' | 'ai'
  status: 'open' | 'resolved' | 'drifted' | 'orphaned'
  kind: 'source-linked' | 'floating'
  anchorFile?: string | null
  anchorComponent?: string | null
} & Record<string, unknown>

export type CommentClient = {
  list: (filter?: {allSessions?: boolean; file?: string; status?: string}) => Promise<CommentRecord[]>
  create: (input: Record<string, unknown>) => Promise<CommentRecord>
  reply: (input: {parentId: string; parts: unknown[]}) => Promise<CommentRecord>
  resolve: (id: string) => Promise<CommentRecord>
  remove: (id: string) => Promise<void>
}

export function createCommentClient(opts: {base: string}): CommentClient {
  const runTool = async (name: string, input: unknown): Promise<unknown> => {
    const res = await fetch(`${opts.base}/api/tools/run`, {
      method: 'POST',
      credentials: 'include',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({name, input}),
    })
    if (!res.ok) throw new Error(`tool ${name} failed: ${res.status}`)
    return (await res.json()).result
  }
  return {
    list: async (filter) => ((await runTool('comment.list', filter ?? {})) as {comments: CommentRecord[]}).comments,
    create: async (input) => (await runTool('comment.create', input)) as CommentRecord,
    reply: async (input) => (await runTool('comment.reply', input)) as CommentRecord,
    resolve: async (id) => (await runTool('comment.resolve', {id})) as CommentRecord,
    remove: async (id) => {
      await runTool('comment.delete', {id})
    },
  }
}
