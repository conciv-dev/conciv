import type {Event} from '../../schema/event.js'
import type {EventManifest} from '../../schema/event-manifest.js'
import type {Location} from '../../schema/location.js'
import type {Stream} from 'effect'

type RpcEvent = {
  readonly id: Event.Id
  readonly created: number
  readonly metadata?: {readonly [x: string]: unknown}
  readonly type: `rpc.${string}`
  readonly location: Location.PublicRef
  readonly data: {readonly [x: string]: unknown}
}

type EventSubscribeOutput = EventManifest.ServerEvent | RpcEvent

type SelectedEvent<A extends {readonly type: string}, Type extends string> = A extends unknown
  ? [Extract<Type, A['type']>] extends [never]
    ? never
    : A
  : never

type EventType = EventSubscribeOutput['type']

export interface EventDomain {
  readonly subscribe: <Type extends EventType = EventType>(input?: {
    readonly types?: ReadonlyArray<Type>
  }) => Stream.Stream<SelectedEvent<EventSubscribeOutput, Type>, unknown>
}
