import {Plugin, ToolRegistry} from '@conciv/plugin/experimental'
import {recorderCards} from './cards.js'

export default Plugin.define({
  setup(ctx) {
    Object.entries(recorderCards).forEach(([name, entry]) => ctx.add(ToolRegistry, {name, ...entry}))
  },
})
