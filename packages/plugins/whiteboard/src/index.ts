import {join} from 'node:path'
import {Plugin} from '@conciv/plugin'
import {z} from 'zod'
import {concivStateDir} from '@conciv/protocol/state-types'
import {Whiteboard} from './rpc.js'
import {autoCommitDraft} from './server/auto-commit.js'
import {createStore} from './server/db/store.js'
import {startCommentEnrichment} from './server/enrich-worker.js'
import {whiteboardHandlers} from './server/rpc-handlers.js'
import {info} from './skill.js'
import {CONFIRMATION_RULES} from './tool/refusal.js'
import {register} from './tools.js'

const DRAW_DEADLINE_MS = 8_000
const WhiteboardOptions = z.object({
  drawDeadlineMs: z.number().positive().default(DRAW_DEADLINE_MS).catch(DRAW_DEADLINE_MS),
})

function databaseDirectory(location: Plugin.Context['location']): string {
  return join(concivStateDir(location.directory), 'whiteboard')
}

async function releaseOnFailure<T>(release: () => Promise<void> | void, step: () => Promise<T>): Promise<T> {
  return step().catch(async (error: unknown) => {
    await release()
    throw error
  })
}

export default Plugin.define({
  id: 'whiteboard',
  async setup(ctx) {
    const directory = ctx.location.directory
    const store = await createStore(databaseDirectory(ctx.location))
    const closeStore = () => store.close()
    const registration = await releaseOnFailure(closeStore, () =>
      ctx.rpc.register(Whiteboard, whiteboardHandlers(store)),
    )
    const stopAnnouncing = store.onEvent((event) => {
      if (event.table === 'cursor') return
      const {room, table, key, type, cursor} = event
      registration.events.emit('changed', {room, table, key, type, cursor}).catch((error: unknown) => {
        console.error(`[whiteboard] change ${table} ${key} was not announced: ${String(error)}`)
      })
    })
    const stopEnrichment = startCommentEnrichment(store, directory)
    const stop = async () => {
      const drained = stopEnrichment()
      stopAnnouncing()
      await drained
      closeStore()
    }
    await releaseOnFailure(stop, async () => {
      await ctx.agent.transform((editor) =>
        editor.list().forEach((agent) => agent.permissions.push(...CONFIRMATION_RULES)),
      )
      await register(ctx.tool, store, directory, ctx.permission, WhiteboardOptions.parse(ctx.options).drawDeadlineMs)
      await ctx.skill.transform((editor) => editor.add(info))
      await ctx.session.hook('experimental.idle', async ({sessionId}) => {
        await autoCommitDraft(store, sessionId)
      })
    })
    return stop
  },
})
