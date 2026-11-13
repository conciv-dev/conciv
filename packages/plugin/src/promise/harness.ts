import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import type {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import type {HarnessConnectContext} from '@conciv/protocol/harness-types'
import type {TtyCommand} from '@conciv/protocol/terminal-types'

export type ServerHarness = {
  id: string
  ttyCommand?: (ctx: HarnessConnectContext) => TtyCommand
  release?: (sessionId: SessionId) => void
  transcriptExists?: (token: HarnessSessionId) => boolean
  transcriptMessages?: (token: HarnessSessionId) => Promise<ChatMessage[]>
}

export interface HarnessDomain {
  get(sessionId: SessionId): ServerHarness
  /**
   * The CLI's own session id for a conciv session: what the CLI resumes from. Recorded by the engine when a chat
   * turn or `recordToken` starts the CLI session.
   *
   * @returns Null until the session has started a CLI session.
   */
  resumeToken(sessionId: SessionId): Promise<HarnessSessionId | null>
  recordToken(sessionId: SessionId, token: HarnessSessionId): Promise<void>
  readonly mcpUrl: string | undefined
}
