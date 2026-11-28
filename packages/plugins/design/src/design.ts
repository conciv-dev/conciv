import {Effect} from 'effect'
import {FetchHttpClient} from 'effect/http'
import {Plugin} from '@conciv/backend-plugin-api/effect'
import {startDesign} from './engine/start.js'

export default Plugin.define({
  id: 'design',
  effect: (ctx) => startDesign(ctx).pipe(Effect.provide(FetchHttpClient.layer)),
})
