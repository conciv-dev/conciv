import {join} from 'node:path'
import {Plugin} from '@conciv/plugin'
import {concivStateDir} from '@conciv/protocol/state-types'
import {Whiteboard} from './rpc.js'
import {createStore} from './server/db/store.js'
import {whiteboardHandlers} from './server/rpc-handlers.js'
import {register} from './tools.js'

export default Plugin.define({
  id: 'whiteboard',
  async setup(ctx) {
    const store = await createStore(join(concivStateDir(ctx.location.directory), 'whiteboard'))
    const registration = await ctx.rpc.register(Whiteboard, whiteboardHandlers(store))
    const stopAnnouncing = store.onEvent((event) => {
      if (event.table === 'cursor') return
      const {room, table, key, type, cursor} = event
      registration.events.emit('changed', {room, table, key, type, cursor}).catch((error: unknown) => {
        console.error(`[whiteboard] change ${table} ${key} was not announced: ${String(error)}`)
      })
    })
    await register(ctx.tool, store)
    return () => {
      stopAnnouncing()
      store.close()
    }
  },
})
