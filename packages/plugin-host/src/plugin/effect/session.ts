import type {Session} from '../../schema/session.js'

export type SessionIdleBackground =
  | {
      readonly kind: 'shell'
      readonly sessionId: Session.Id
      readonly shellId: string
      readonly command: string
    }
  | {
      readonly kind: 'subagent'
      readonly sessionId: Session.Id
      readonly childSessionId: Session.Id
      readonly agent: string
      readonly description: string
    }
  | {
      readonly kind: 'image'
      readonly sessionId: Session.Id
      readonly path: string
      readonly model: string
    }

export interface SessionIdle {
  readonly sessionId: Session.Id
  readonly background: ReadonlyArray<SessionIdleBackground>
}

export interface SessionHooks {
  readonly 'experimental.idle': SessionIdle
}
