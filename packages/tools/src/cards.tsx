import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {OpenCard} from './cards/open-card.js'
import {UiCard} from './cards/ui-card.js'

export {OpenCard} from './cards/open-card.js'
export {UiCard} from './cards/ui-card.js'

export const concivToolCards: ToolCardEntry[] = [
  {
    names: ['conciv_ui'],
    render: UiCard,
    hasEmbeddedBody: () => true,
    display: 'standalone',
  },
  {names: ['open'], render: OpenCard, hasEmbeddedBody: () => true},
]
