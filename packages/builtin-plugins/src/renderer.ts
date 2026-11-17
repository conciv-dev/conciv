import {compose} from '@conciv/plugin/experimental/host'
import type {Plugin} from '@conciv/plugin/experimental'

export const builtins = compose({
  page: {
    windowEntry: () =>
      import('./page/plugin-experimental.js').then(({default: page}) => {
        const setup: Plugin.Setup<typeof page> = (ctx) => page.setup?.(ctx)
        return {default: setup}
      }),
  },
  'test-runner-card': {
    windowEntry: () =>
      import('./test-runner/plugin-experimental.js').then(({default: card}) => {
        const setup: Plugin.Setup<typeof card> = (ctx) => card.setup?.(ctx)
        return {default: setup}
      }),
  },
})

export {pageAttachmentCards, pageSessionEntry} from './page/cards/page-tool-cards.js'
export {PAGE_ACT_TOOL_NAMES, PAGE_TOOL_PREFIX, builtinToolMeta} from './page/cards/page-tool-names.js'
