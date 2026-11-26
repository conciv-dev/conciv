import * as Event from '@conciv/protocol/schema/event'
import * as SessionEvent from '@conciv/protocol/schema/session-event'

export const Durable = Event.durableMap([...SessionEvent.DurableDefinitions])
