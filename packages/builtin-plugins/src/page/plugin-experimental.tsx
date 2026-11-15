import {Plugin} from '@conciv/plugin/experimental'
import {Page, ReactTree} from '@conciv/plugin/experimental/page'
import {Definition} from '@conciv/plugin-page/rpc'
import {makeReactTree, pageMembers} from './contracts.js'

export default Plugin.define({
  setup(ctx) {
    ctx.provide(Page, {
      ...pageMembers,
      symbolicate: (input) => {
        const session = ctx.sessions.current()

        if (!session) return Promise.reject(new Error('Page.symbolicate needs a routed session'))

        return session.server.client.rpc(Definition).symbolicate({frames: [...input.frames]})
      },
    })
    ctx.provide(ReactTree, makeReactTree())
  },
})
