import {Effect} from 'effect'
import {Plugin} from '@conciv/backend-plugin-api/effect'

export default Plugin.define({
  id: 'compaction-answer',
  effect: (ctx) =>
    ctx.session.hook('compaction', (input) =>
      Effect.sync(() => {
        input.result = {summary: 'The user said hello and the plugin summarized it'}
      }),
    ),
})
