import {Effect} from 'effect'
import {Plugin} from '@conciv/plugin/effect'
import {PageConnection} from './connection.js'
import {addPictures, makeGrabStore} from './grabs.js'
import {PageTools} from './tools.js'

export default Plugin.define({
  id: 'conciv.page',
  effect: (ctx) =>
    Effect.gen(function* () {
      const grabs = makeGrabStore(ctx.location.directory)
      const connection = yield* PageConnection.make(ctx, grabs)
      yield* PageTools.register(ctx, connection)
      yield* ctx.session.hook('prompt', addPictures(grabs))
    }),
})
