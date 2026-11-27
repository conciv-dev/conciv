import {Context, type Effect, type Scope, type Stream} from 'effect'
import type {EvlogError} from 'evlog'
import type {SessionId} from '@conciv/types/chat-types'
import type {BrowserTabOpen, BrowserTabList, BrowserTabsChange} from '@conciv/protocol/schema/browser-tab'

export type Outcome = 'closed' | 'replaced'

export interface Interface {
  readonly open: (input: BrowserTabOpen) => Effect.Effect<Outcome, EvlogError, Scope.Scope>
  readonly update: (input: BrowserTabOpen) => Effect.Effect<void, EvlogError>
  readonly list: (sessionId: SessionId) => Effect.Effect<BrowserTabList>
  readonly sessions: () => Effect.Effect<SessionId[]>
  readonly changes: Stream.Stream<BrowserTabsChange>
}

export const Service = Context.Service<Interface>('@conciv/Tab')
