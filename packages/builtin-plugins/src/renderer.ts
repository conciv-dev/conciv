import {compose} from '@conciv/plugin/experimental/host'

export const builtins = compose({
  page: {
    windowEntry: () =>
      import('./page/plugin-experimental.js').then((module) => ({
        default: (ctx: never) => module.default.setup?.(ctx),
      })),
  },
})

export {pageAttachmentCards, pageSessionEntry, pageToolCards} from './page/cards/page-tool-cards.js'
