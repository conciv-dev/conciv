import {join} from 'node:path'
import {Plugin} from '@conciv/plugin'
import {concivStateDir} from '@conciv/protocol/state-types'
import {Whiteboard} from './rpc.js'
import {createStore} from './server/db/store.js'
import {whiteboardHandlers} from './server/rpc-handlers.js'

export default Plugin.define({
  id: 'whiteboard',
  async setup(ctx) {
    const store = await createStore(join(concivStateDir(ctx.location.directory), 'whiteboard'))
    await ctx.rpc.register(Whiteboard, whiteboardHandlers(store))
    return () => {
      store.close()
    }
  },
})
