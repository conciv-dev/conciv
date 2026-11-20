import {Effect} from 'effect'
import {Plugin} from '@conciv/plugin/effect'
import {Simctl} from './simctl.js'
import {register} from './tools.js'

export default Plugin.define({
  id: 'ios',
  effect: (ctx) => register(ctx).pipe(Effect.provide(Simctl.layer)),
})
