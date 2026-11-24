import {Effect} from 'effect'
import {Plugin} from '@conciv/plugin/effect'
import {PageConnection} from './connection.js'
import {addPictures, makeGrabStore} from './grabs.js'
import {PageTools} from './tools.js'
import {makeSymbolicator} from './symbolicate.js'

export default Plugin.define({
  id: '@conciv/plugin-page',
  effect: (ctx) =>
    Effect.gen(function* () {
      const symbolicator = yield* makeSymbolicator({root: ctx.location.directory})
      const grabs = makeGrabStore(ctx.location.directory)
      const connection = yield* PageConnection.make(ctx, symbolicator, grabs)
      yield* PageTools.register(ctx, connection, symbolicator)
      yield* ctx.session.hook('prompt', addPictures(grabs))
    }),
})
