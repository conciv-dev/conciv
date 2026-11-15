import {Plugin} from '@conciv/plugin'
import * as PageConnection from './connection.js'
import * as PageTools from './tools.js'

export default Plugin.define({
  id: 'conciv.page',
  async setup(ctx) {
    const connection = await PageConnection.make(ctx)
    await PageTools.register(ctx, connection)
    return connection.dispose
  },
})
