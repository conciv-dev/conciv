import type {} from 'devframe'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {ServerApi} from './types.js'

export const CONCIV_HOST_SERVICE = 'conciv:host'

export type ConcivHost = Omit<ServerApi<never>, 'config'> & {
  latestSession: () => Promise<SessionId | null>
  config: (id: string) => unknown
  inSession: <Result>(id: SessionId | undefined, run: (id: SessionId) => Result) => Result
}

declare module 'devframe' {
  interface DevframeServicesRegistry {
    'conciv:host': ConcivHost
  }
}
