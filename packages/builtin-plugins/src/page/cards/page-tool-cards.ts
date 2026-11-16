import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {PAGE_TOOL_PREFIX} from '@conciv/extension-page/defs'
import {PAGE_SESSION_GROUP_KEY, type GroupEntry} from '@conciv/ui-kit-chat'
import {actCard} from './act-card.js'
import {consoleCard} from './console-card.js'
import {editLiveCard} from './edit-live-card.js'
import {effectCard} from './effect-card.js'
import {reactCard} from './react-card.js'
import {readBulkCard} from './read-bulk-card.js'
import {readValueCard} from './read-value-card.js'
import {SessionCard} from './session-card.js'

function pageNames(verbs: string[]): string[] {
  return verbs.map((verb) => `${PAGE_TOOL_PREFIX}${verb}`)
}

export const pageToolCards: ToolCardEntry[] = [
  {...readValueCard, names: pageNames(['route', 'exists', 'screenshot', 'hmr', 'text', 'value', 'attr'])},
  {...consoleCard, names: pageNames(['console'])},
  {...readBulkCard, names: pageNames(['dom', 'query', 'snapshot'])},
  {...reactCard, names: pageNames(['locate', 'inspect', 'override', 'tree', 'find', 'track'])},
  {...effectCard, names: pageNames(['effect'])},
  {
    ...actCard,
    names: pageNames([
      'wait',
      'reload',
      'click',
      'hover',
      'scroll',
      'submit',
      'fill',
      'select',
      'check',
      'uncheck',
      'press',
      'queue',
    ]),
  },
  {
    ...editLiveCard,
    names: pageNames([
      'setattr',
      'removeattr',
      'addclass',
      'removeclass',
      'setstyle',
      'settext',
      'sethtml',
      'remove',
      'insert',
      'css',
      'eval',
    ]),
  },
]

export const pageSessionEntry: GroupEntry = {key: PAGE_SESSION_GROUP_KEY, render: SessionCard}
