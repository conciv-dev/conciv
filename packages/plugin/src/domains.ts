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
}

/** Build diagnostics, module graph and config from the user's bundler. */
export type BundlerDomain = BundlerBridge
