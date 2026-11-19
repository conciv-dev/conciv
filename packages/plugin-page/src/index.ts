import {Effect} from 'effect'
import {Plugin} from '@conciv/plugin/effect'
import * as PageConnection from './connection.js'
import * as PageTools from './tools.js'

export default Plugin.define({
  id: 'conciv.page',
  effect: (ctx) =>
    Effect.gen(function* () {
      const connection = yield* PageConnection.make(ctx)
      yield* PageTools.register(ctx, connection)
    }),
})
