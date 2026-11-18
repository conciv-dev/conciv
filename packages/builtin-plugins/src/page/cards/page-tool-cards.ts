import type {ToolComponent} from '@conciv/plugin/experimental'
import {PAGE_SESSION_GROUP_KEY, type AttachmentCardSlot, type GroupEntry} from '@conciv/ui-kit-chat'
import {GRAB_MIME} from '@conciv/grab/grab-attachment'
import {ActCard} from './act-card.js'
import {ConsoleCard} from './console-card.js'
import {EditLiveCard} from './edit-live-card.js'
import {EffectCard} from './effect-card.js'
import {GrabCard} from './grab-card.js'
import {ReactCard} from './react-card.js'
import {ReadBulkCard} from './read-bulk-card.js'
import {ReadValueCard} from './read-value-card.js'
import {PageSessionCard} from './session-card.js'
import {PAGE_TOOL_PREFIX} from './page-tool-names.js'

function pageNames(verbs: string[]): string[] {
  return verbs.map((verb) => `${PAGE_TOOL_PREFIX}${verb}`)
}

export const pageToolCards: ReadonlyArray<{card: ToolComponent; tools: string[]}> = [
  {card: ReadValueCard, tools: pageNames(['route', 'exists', 'screenshot', 'hmr', 'text', 'value', 'attr'])},
  {card: ConsoleCard, tools: pageNames(['console'])},
  {card: ReadBulkCard, tools: pageNames(['dom', 'query', 'snapshot'])},
  {card: ReactCard, tools: pageNames(['locate', 'inspect', 'override', 'tree', 'find', 'track'])},
  {card: EffectCard, tools: pageNames(['effect'])},
  {
    card: ActCard,
    tools: pageNames([
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
    card: EditLiveCard,
    tools: pageNames([
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

export const pageSessionEntry: GroupEntry = {key: PAGE_SESSION_GROUP_KEY, render: PageSessionCard}

export const pageAttachmentCards: AttachmentCardSlot[] = [{mime: GRAB_MIME, render: GrabCard}]
