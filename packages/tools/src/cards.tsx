import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {ExtensionsCard, extensionsRowProjection} from './cards/extensions-card.js'
import {OpenCard, openRowProjection} from './cards/open-card.js'
import {UiCard} from './cards/ui-card.js'

export {ExtensionsCard, extensionsRowProjection} from './cards/extensions-card.js'
export {OpenCard, openRowProjection} from './cards/open-card.js'
export {UiCard} from './cards/ui-card.js'

export const concivToolCards: ToolCardEntry[] = [
  {names: ['conciv_ui'], render: UiCard, streamTitle: 'Rendering UI', display: 'standalone'},
  {names: ['open'], render: OpenCard, row: openRowProjection, streamTitle: 'Opening a file'},
  {names: ['conciv_extensions'], render: ExtensionsCard, row: extensionsRowProjection},
]
