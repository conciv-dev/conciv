import type {ConcivEvent} from '@conciv/client'
import type {SelectedEvent, SubscribeOptions} from '@conciv/client'

type EventType = Exclude<ConcivEvent['type'], 'server.connected'>

export interface EventDomain {
  readonly subscribe: <Type extends EventType = EventType>(
    options?: SubscribeOptions<Type>,
  ) => AsyncIterable<SelectedEvent<ConcivEvent, Type>>
}
