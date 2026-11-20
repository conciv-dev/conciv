import {compose} from '@conciv/plugin/experimental/host'
import type {Plugin} from '@conciv/plugin/experimental'

export const builtins = compose({
  page: {
    windowEntry: () =>
      import('@conciv/plugin-page/renderer').then(({default: page}) => {
        const setup: Plugin.Setup<typeof page> = (ctx) => page.setup?.(ctx)
        return {default: setup}
      }),
  },
})
