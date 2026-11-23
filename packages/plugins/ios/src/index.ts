import {Effect} from 'effect'
import {Plugin} from '@conciv/plugin/effect'
import {pairDevEndpoint} from './dev-endpoint.js'
import {serveGrabs} from './grabs.js'
import {Simctl} from './simctl.js'
import {register} from './tools.js'

export default Plugin.define({
  id: 'ios',
  effect: (ctx) =>
    Effect.gen(function* () {
      yield* pairDevEndpoint(ctx).pipe(
        Effect.catch((error) => Effect.logError('[ios] writing the dev endpoint file failed', {error})),
      )
      yield* serveGrabs(ctx)
      yield* register(ctx).pipe(Effect.provide(Simctl.layer))
    }),
})
