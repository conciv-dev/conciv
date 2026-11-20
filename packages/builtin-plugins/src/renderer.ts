import {compose} from '@conciv/plugin/experimental/host'
import type {Plugin} from '@conciv/plugin/experimental'
import {terminalDeclarations} from './terminal/stores.js'

export const builtins = compose({
  page: {
    windowEntry: () =>
      import('@conciv/plugin-page/renderer').then(({default: page}) => {
        const setup: Plugin.Setup<typeof page> = (ctx) => page.setup?.(ctx)
        return {default: setup}
      }),
  },
  terminal: {
    ...terminalDeclarations,
    windowEntry: () =>
      import('./terminal/plugin-experimental.js').then(({default: terminal}) => {
        const setup: Plugin.Setup<typeof terminal> = (ctx) => terminal.setup?.(ctx)
        return {default: setup}
      }),
  },
})
