import {Plugin} from '@conciv/plugin/experimental'
import {ToolCall} from '@conciv/plugin/experimental/builtin'
import {tanstackCards} from './cards.js'

export default Plugin.define({
  setup(ctx) {
    Object.entries(tanstackCards).forEach(([tool, card]) => ctx.add(ToolCall, {tools: [tool], card}))
  },
})
