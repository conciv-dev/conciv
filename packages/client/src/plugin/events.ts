import type {ServerEvent} from '@conciv/protocol/schema/event-manifest'
import type {PublicRef} from '@conciv/protocol/schema/location'

export type RpcEvent = {
  id: string
  created: number
  metadata?: Record<string, unknown> | undefined
  type: `rpc.${string}`
  location: PublicRef
  data: Record<string, unknown>
}

type ServerConnected = {
  id: string
  metadata?: Record<string, unknown> | undefined
  location?: PublicRef | undefined
  type: 'server.connected'
  data: {}
}

export type ConcivEvent = ServerEvent | RpcEvent | ServerConnected
