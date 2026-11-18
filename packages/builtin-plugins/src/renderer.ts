import {compose} from '@conciv/plugin/experimental/host'
import type {Plugin} from '@conciv/plugin/experimental'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {pageToolMeta} from './page/cards/page-tool-names.js'
import {tanstackToolMeta} from './tanstack/tanstack-tool-names.js'
import {terminalDeclarations} from './terminal/stores.js'

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
  'tanstack-card': {
    windowEntry: () =>
      import('./tanstack/plugin-experimental.js').then(({default: card}) => {
        const setup: Plugin.Setup<typeof card> = (ctx) => card.setup?.(ctx)
        return {default: setup}
      }),
  },
  'whiteboard-card': {
    windowEntry: () =>
      import('./whiteboard/plugin-experimental.js').then(({default: card}) => {
        const setup: Plugin.Setup<typeof card> = (ctx) => card.setup?.(ctx)
        return {default: setup}
      }),
  },
  'recorder-card': {
    windowEntry: () =>
      import('./recorder/plugin-experimental.js').then(({default: card}) => {
        const setup: Plugin.Setup<typeof card> = (ctx) => card.setup?.(ctx)
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

export {pageAttachmentCards, pageSessionEntry} from './page/cards/page-tool-cards.js'
export {PAGE_ACT_TOOL_NAMES, PAGE_TOOL_PREFIX} from './page/cards/page-tool-names.js'

export function builtinToolMeta(name: string): ToolViewMeta | undefined {
  return pageToolMeta(name) ?? tanstackToolMeta(name)
}
