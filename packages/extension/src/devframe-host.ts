import type {SessionId} from '@conciv/protocol/chat-types'
import type {ServerApi} from './types.js'

export const CONCIV_HOST_SERVICE = 'conciv:host'

export type ConcivHost = Omit<ServerApi<Record<never, never>>, 'config' | 'basePath'> & {
  latestSession: () => Promise<SessionId | null>
}

declare module 'devframe' {
  interface DevframeServicesRegistry {
    'conciv:host': ConcivHost
  }
}
