import {Schema} from 'effect'
import * as EventDefinition from './event.js'
import {SessionId} from './session-id.js'

const BrowserTab = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  title: Schema.String,
  focused: Schema.Boolean,
  visible: Schema.Boolean,
})

const Ref = {
  sessionID: SessionId,
  tabId: Schema.String,
}

const options = {
  durable: {
    aggregate: 'sessionID',
    version: 1,
  },
} as const

export const Opened = EventDefinition.durable({
  type: 'tab.opened',
  ...options,
  schema: {...Ref, connectionId: Schema.String, tab: BrowserTab},
})
export type Opened = typeof Opened.Type

export const Updated = EventDefinition.durable({
  type: 'tab.updated',
  ...options,
  schema: {...Ref, tab: BrowserTab},
})
export type Updated = typeof Updated.Type

export const Closed = EventDefinition.durable({
  type: 'tab.closed',
  ...options,
  schema: {...Ref, connectionId: Schema.String},
})
export type Closed = typeof Closed.Type

export const Definitions = EventDefinition.inventory(Opened, Updated, Closed)
