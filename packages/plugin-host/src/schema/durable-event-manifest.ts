export * as DurableEventManifest from './durable-event-manifest.js'

import {Event} from '@conciv/plugin/schema/event'
import {SessionEvent} from '@conciv/plugin/schema/session-event'

export const Durable = Event.durableMap([...SessionEvent.DurableDefinitions])
