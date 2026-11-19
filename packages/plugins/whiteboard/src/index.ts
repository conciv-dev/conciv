import {join} from 'node:path'
import {Plugin, type Rpc} from '@conciv/plugin/effect'
import type {Context} from '@conciv/plugin/effect/plugin'
import {Effect, Queue, Stream} from 'effect'
import {z} from 'zod'
import {concivStateDir} from '@conciv/protocol/state-types'
import {Whiteboard} from './rpc.js'
import {autoCommitDraft} from './server/auto-commit.js'
import {createStore} from './server/db/store.js'
import {enrichComments} from './server/enrich-worker.js'
import {whiteboardHandlers} from './server/rpc-handlers.js'
import {info} from './skill.js'
import {CONFIRMATION_RULES} from './tool/refusal.js'
import {register} from './tools.js'

const DRAW_DEADLINE_MS = 8_000
const WhiteboardOptions = z.object({
  drawDeadlineMs: z.number().positive().default(DRAW_DEADLINE_MS).catch(DRAW_DEADLINE_MS),
})

type Announcement = Rpc.EventInput<typeof Whiteboard>

function databaseDirectory(location: Context['location']): string {
  return join(concivStateDir(location.directory), 'whiteboard')
}

function reportUnannounced([, change]: Announcement) {
  return (error: unknown) =>
    Effect.sync(() => {
      console.error(`[whiteboard] change ${change.table} ${change.key} was not announced: ${String(error)}`)
    })
}

export default Plugin.define({
  id: 'whiteboard',
  effect: (ctx) =>
    Effect.gen(function* () {
      const directory = ctx.location.directory
      const {drawDeadlineMs} = yield* Effect.sync(() => WhiteboardOptions.parse(ctx.options))
      const store = yield* Effect.acquireRelease(
        Effect.promise(() => createStore(databaseDirectory(ctx.location))),
        (opened) => Effect.sync(() => opened.close()),
      )
      const registration = yield* ctx.rpc.register(Whiteboard, whiteboardHandlers(store)).pipe(Effect.orDie)
      const announcements = yield* Queue.unbounded<Announcement>()
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          store.onEvent((event) => {
            if (event.table === 'cursor') return
            const {room, table, key, type, cursor} = event
            Queue.offerUnsafe(announcements, ['changed', {room, table, key, type, cursor}])
          }),
        ),
        (stopAnnouncing) => Effect.sync(stopAnnouncing),
      )
      yield* Stream.fromQueue(announcements).pipe(
        Stream.runForEach((announcement) =>
          registration.events
            .emit(...announcement)
            .pipe(Effect.catch(reportUnannounced(announcement)), Effect.catchDefect(reportUnannounced(announcement))),
        ),
        Effect.forkScoped({startImmediately: true}),
      )
      yield* enrichComments(store, directory)
      yield* ctx.agent.transform((editor) =>
        editor.list().forEach((agent) => agent.permissions.push(...CONFIRMATION_RULES)),
      )
      yield* register(ctx, store, directory, drawDeadlineMs)
      yield* ctx.skill.transform((editor) => editor.add(info))
      yield* ctx.session.hook('experimental.idle', ({sessionId}) =>
        Effect.promise(() => autoCommitDraft(store, sessionId)),
      )
    }),
})
