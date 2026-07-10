import type {AnyTool} from '@tanstack/ai'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import type {UiBus} from '../../runtime/ui-bus.js'
import type {UiAsks} from '../../runtime/ui-asks.js'
import type {SessionStore} from '../../store/session-store.js'
import type {TurnHub} from '../../runtime/turn-hub.js'
import type {PermissionGate} from './permission.js'

export type ChatRuntime = {
  cwd: string
  stateRoot: string
  harness: HarnessAdapter
  harnessEnv?: (sessionId?: string) => NodeJS.ProcessEnv
  claudeHome?: string
  systemText: string
  gate: PermissionGate
  uiBus: UiBus
  uiAsks: UiAsks
  store: SessionStore
  hub: TurnHub
  tools: (sessionId: string) => AnyTool[]
  onTurnStart?: (sessionId: string) => void
  onTurnEnd?: (sessionId: string) => Promise<void>
}

export type ChatEnv = {Variables: {chat: ChatRuntime}}
