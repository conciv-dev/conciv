export * as DurableEventManifest from './durable-event-manifest.js'

import {Event} from '@conciv/protocol/schema/event'
import {SessionEvent} from '@conciv/protocol/schema/session-event'

export const Durable = Event.durableMap([...SessionEvent.DurableDefinitions])
