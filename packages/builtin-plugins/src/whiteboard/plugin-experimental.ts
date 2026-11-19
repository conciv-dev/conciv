import {Plugin, ToolRegistry} from '@conciv/plugin/experimental'
import {whiteboardFailedCard} from './card-shared.js'
import {whiteboardCards} from './cards.js'

export default Plugin.define({
  setup(ctx) {
    Object.entries(whiteboardCards).forEach(([name, render]) =>
      ctx.add(ToolRegistry, {name, render, errorComponent: whiteboardFailedCard}),
    )
  },
})
