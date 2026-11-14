import type {ConcivEvent} from '../client/promise/index.js'
import type {SelectedEvent, SubscribeOptions} from '../client/promise/api.js'

type EventType = Exclude<ConcivEvent['type'], 'server.connected'>

export interface EventDomain {
  readonly subscribe: <Type extends EventType = EventType>(
    options?: SubscribeOptions<Type>,
  ) => AsyncIterable<SelectedEvent<ConcivEvent, Type>>
}
