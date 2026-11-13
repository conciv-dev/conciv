import type {Session} from '../../schema/session.js'

export type SessionIdleBackground =
  | {
      readonly kind: 'shell'
      readonly sessionID: Session.ID
      readonly shellID: string
      readonly command: string
    }
  | {
      readonly kind: 'subagent'
      readonly sessionID: Session.ID
      readonly childSessionID: Session.ID
      readonly agent: string
      readonly description: string
    }
  | {
      readonly kind: 'image'
      readonly sessionID: Session.ID
      readonly path: string
      readonly model: string
    }

export interface SessionIdle {
  readonly sessionID: Session.ID
  readonly background: ReadonlyArray<SessionIdleBackground>
}

export interface SessionHooks {
  readonly 'experimental.idle': SessionIdle
}
