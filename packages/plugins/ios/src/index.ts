import {Effect} from 'effect'
import {Plugin} from '@conciv/plugin/effect'
import * as Simctl from './server/simctl.js'
import {register} from './server/tools.js'

export default Plugin.define({
  id: 'ios',
  effect: (ctx) =>
    Effect.gen(function* () {
      yield* register(ctx, yield* Simctl.Service)
    }).pipe(Effect.provide(Simctl.layer)),
})
