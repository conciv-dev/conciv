import {join} from 'node:path'
import {Plugin} from '@conciv/plugin'
import {concivStateDir} from '@conciv/protocol/state-types'
import {Whiteboard} from './rpc.js'
import {autoCommitDraft} from './server/auto-commit.js'
import {createStore} from './server/db/store.js'
import {startCommentEnrichment} from './server/enrich-worker.js'
import {whiteboardHandlers} from './server/rpc-handlers.js'
import {register} from './tools.js'

export default Plugin.define({
  id: 'whiteboard',
  async setup(ctx) {
    const directory = ctx.location.directory
    const store = await createStore(join(concivStateDir(directory), 'whiteboard'))
    const registration = await ctx.rpc.register(Whiteboard, whiteboardHandlers(store))
    const stopAnnouncing = store.onEvent((event) => {
      if (event.table === 'cursor') return
      const {room, table, key, type, cursor} = event
      registration.events.emit('changed', {room, table, key, type, cursor}).catch((error: unknown) => {
        console.error(`[whiteboard] change ${table} ${key} was not announced: ${String(error)}`)
      })
    })
    const stopEnrichment = startCommentEnrichment(store, directory)
    await register(ctx.tool, store, directory)
    await ctx.session.hook('experimental.idle', async ({sessionId}) => {
      await autoCommitDraft(store, sessionId)
    })
    return () => {
      stopEnrichment()
      stopAnnouncing()
      store.close()
    }
  },
})
