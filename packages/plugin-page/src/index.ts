import {Plugin} from '@conciv/plugin'
import {Definition} from './rpc.js'
import {symbolicateFrames} from './symbolicate.js'

export {symbolicateFrame, symbolicateFrames} from './symbolicate.js'

export default Plugin.define({
  id: 'conciv.page',
  async setup(ctx) {
    const registration = await ctx.rpc.register(Definition, {
      symbolicate: (input) => symbolicateFrames(input.frames, ctx.location.directory),
    })
    return () => registration.dispose()
  },
})
