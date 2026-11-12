import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import type {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import type {HarnessConnectContext} from '@conciv/protocol/harness-types'
import type {TtyCommand} from '@conciv/protocol/terminal-types'

/** The running app, as a plugin's engine part sees it in `ctx.app`. */
export interface App {
  /** The app's name, `conciv`. */
  readonly name: string
  /** The app version, e.g. `0.0.22`. */
  readonly version: string
  /** The release channel. */
  readonly channel: string
}

export interface Location {
  readonly directory: string
}

export type ListInput = {readonly location?: {readonly directory?: string | undefined} | undefined}

export interface RequestOptions {
  readonly signal?: AbortSignal
  readonly headers?: RequestInit['headers']
  /** Reports every chunk a streaming response receives, including keepalive comments that yield no event. */
  readonly onActivity?: () => void
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
