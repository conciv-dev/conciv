import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import type {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import type {HarnessConnectContext} from '@conciv/protocol/harness-types'
import type {TtyCommand} from '@conciv/protocol/terminal-types'

export interface RequestOptions {
  readonly signal?: AbortSignal
}

export type ServerHarness = {
  id: string
  ttyCommand?: (ctx: HarnessConnectContext) => TtyCommand
  release?: (sessionId: SessionId) => void
  transcriptExists?: (token: HarnessSessionId) => boolean
  transcriptMessages?: (token: HarnessSessionId) => Promise<ChatMessage[]>
}

/** Which CLI runs a session, and its terminal command. */
export interface HarnessDomain {
  get(sessionId: SessionId): ServerHarness
  /**
   * The CLI's own session id for a conciv session: what the CLI resumes from. Recorded by the engine when a chat
   * turn or `recordToken` starts the CLI session.
   *
   * @returns Null until the session has started a CLI session.
   */
  resumeToken(sessionId: SessionId): Promise<HarnessSessionId | null>
  /** Records the CLI session id a plugin started for a conciv session, so chat turns and later reads resume it. */
  recordToken(sessionId: SessionId, token: HarnessSessionId): Promise<void>
  /**
   * The engine's MCP endpoint under its agent-token base path, for a CLI the plugin starts itself
   * (`HarnessConnectContext.mcpUrl`). Read it each time: undefined until the engine listens, which is after setup
   * and before any RPC call reaches the plugin, and in a host that does not know its own address.
   */
  readonly mcpUrl: string | undefined
}

/** Build diagnostics, module graph and config from the user's bundler. */
export type BundlerDomain = BundlerBridge
