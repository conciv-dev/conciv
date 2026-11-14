import {join} from 'node:path'
import {Plugin} from '@conciv/plugin'
import {createStore} from './server/db/store.js'

export default Plugin.define({
  id: 'whiteboard',
  async setup(ctx) {
    const store = await createStore(join(ctx.storage.directory, 'whiteboard'))
    return () => {
      store.close()
    }
  },
})
