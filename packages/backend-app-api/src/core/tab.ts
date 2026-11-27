import {Context, Schema, type Effect, type Scope, type Stream} from 'effect'
import type {SessionId} from '@conciv/types/chat-types'
import type {BrowserTabOpen, BrowserTabList, BrowserTabsChange} from '@conciv/protocol/schema/browser-tab'
import type {NotFoundError} from './session/errors.js'

export const UnavailableError = Schema.TaggedStruct('Tab.UnavailableError', {
  message: Schema.String,
})
export type UnavailableError = typeof UnavailableError.Type & globalThis.Error

export const makeUnavailableError = (message: string): UnavailableError =>
  Object.assign(new globalThis.Error(message), UnavailableError.make({message}), {name: 'Tab.UnavailableError'})

export type Outcome = 'closed' | 'replaced'

export interface Interface {
  readonly open: (input: BrowserTabOpen) => Effect.Effect<Outcome, NotFoundError | UnavailableError, Scope.Scope>
  readonly update: (input: BrowserTabOpen) => Effect.Effect<void, UnavailableError>
  readonly list: (sessionId: SessionId) => Effect.Effect<BrowserTabList>
  readonly sessions: () => Effect.Effect<SessionId[]>
  readonly changes: Stream.Stream<BrowserTabsChange>
}

export const Service = Context.Service<Interface>('@conciv/Tab')
