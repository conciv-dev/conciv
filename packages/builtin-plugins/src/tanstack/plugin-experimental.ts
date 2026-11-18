import {Plugin, ToolRegistry} from '@conciv/plugin/experimental'
import {tanstackCards} from './cards.js'
import {TanstackFailedCard} from './card-shared.js'

export default Plugin.define({
  setup(ctx) {
    Object.entries(tanstackCards).forEach(([name, render]) =>
      ctx.add(ToolRegistry, {name, render, errorComponent: TanstackFailedCard}),
    )
  },
})
