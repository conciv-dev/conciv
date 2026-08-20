import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {ExtensionsCard} from './cards/extensions-card.js'
import {OpenCard} from './cards/open-card.js'
import {UiCard} from './cards/ui-card.js'

export {ExtensionsCard} from './cards/extensions-card.js'
export {OpenCard} from './cards/open-card.js'
export {UiCard} from './cards/ui-card.js'

export const concivToolCards: ToolCardEntry[] = [
  {names: ['conciv_ui'], render: UiCard, streamTitle: 'Rendering UI', display: 'standalone'},
  {names: ['open'], render: OpenCard, streamTitle: 'Opening a file'},
  {names: ['conciv_extensions'], render: ExtensionsCard},
]
