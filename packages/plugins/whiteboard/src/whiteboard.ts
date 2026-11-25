import {Plugin, type Rpc} from '@conciv/backend-plugin-api/effect'
import {Effect, Stream} from 'effect'
import {z} from 'zod'
import {Whiteboard} from './rpc.js'
import {enrichComments} from './enrich-worker.js'
import {whiteboardHandlers} from './rpc-handlers.js'
import {layer, WhiteboardStore, type Store, type WhiteboardEvent} from './store.js'
import {info} from './skill.js'
import {makeAgentCursor} from './agent-cursor.js'
import {makeRenderer} from './preview.js'
import {CONFIRMATION_RULES} from './refusal.js'
import {register} from './tools.js'
import {COMMIT_DEADLINE_MS, EXPORT_DEADLINE_MS} from './canvas-tools.js'
import {unreadable} from './anchor-confine.js'

const loadResolver = (root: string) =>
  Effect.tryPromise({try: () => import('./anchor-resolver.js'), catch: unreadable(root)}).pipe(
    Effect.map((module) => module.createReactAnchorResolver({root})),
  )

const autoCommitDraft = Effect.fn('whiteboard.autoCommitDraft')(function* (store: Store, room: string) {
  const drafts = yield* store.listElements('draft', room)
  if (!drafts.length) return false
  const pendingCommits = (yield* store.pending.list(room)).filter((row) => row.kind === 'commit')
  if (pendingCommits.length) return false
  yield* store.pending.insert(room, {id: crypto.randomUUID(), room, kind: 'commit', stage: 'live', payload: {}})
  return true
})

const DRAW_DEADLINE_MS = 8_000
const AGENT_CURSOR_MS = 50
const WhiteboardOptions = z.object({
  drawDeadlineMs: z.number().positive().default(DRAW_DEADLINE_MS).catch(DRAW_DEADLINE_MS),
  exportDeadlineMs: z.number().positive().default(EXPORT_DEADLINE_MS).catch(EXPORT_DEADLINE_MS),
  commitDeadlineMs: z.number().positive().default(COMMIT_DEADLINE_MS).catch(COMMIT_DEADLINE_MS),
  agentCursorMs: z.number().positive().default(AGENT_CURSOR_MS).catch(AGENT_CURSOR_MS),
})

type Announcement = Rpc.EventInput<typeof Whiteboard>

const announcement = (event: WhiteboardEvent): Announcement => {
  if (event.table === 'cursor') return ['cursor', event.cursor]
  const {room, table, key, type, cursor} = event
  return ['changed', {room, table, key, type, cursor}]
}

function reportUnannounced([name]: Announcement) {
  return (error: unknown) => Effect.logError(`[whiteboard] a ${name} event was not announced`, error)
}

export default Plugin.define({
  id: 'whiteboard',
  effect: (ctx) =>
    Effect.gen(function* () {
      const {agentCursorMs, ...deadlines} = yield* Effect.sync(() => WhiteboardOptions.parse(ctx.options))
      const store = yield* WhiteboardStore
      const resolver = yield* Effect.cached(loadResolver(ctx.location.directory))
      const renderer = yield* Effect.cached(makeRenderer)
      const registration = yield* ctx.rpc.register(Whiteboard, whiteboardHandlers(store)).pipe(Effect.orDie)
      const changes = yield* store.follow
      yield* changes.pipe(
        Stream.map(announcement),
        Stream.runForEach((announced) =>
          registration.events
            .emit(...announced)
            .pipe(Effect.catch(reportUnannounced(announced)), Effect.catchDefect(reportUnannounced(announced))),
        ),
        Effect.forkScoped({startImmediately: true}),
      )
      yield* enrichComments(store, resolver)
      yield* ctx.agent.transform((editor) =>
        editor.list().forEach((agent) => agent.permissions.push(...CONFIRMATION_RULES)),
      )
      const moveAgentCursor = yield* makeAgentCursor(ctx.session, store, agentCursorMs)
      yield* register(ctx, store, resolver, renderer, deadlines, moveAgentCursor)
      yield* ctx.skill.transform((editor) => editor.add(info))
      yield* ctx.session.hook('experimental.idle', ({sessionId}) =>
        autoCommitDraft(store, sessionId).pipe(
          Effect.catch((error) => Effect.logError(`[whiteboard] the draft of ${sessionId} was not committed`, error)),
        ),
      )
    }).pipe(Effect.provide(layer(ctx.storage))),
})
