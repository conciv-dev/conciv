import type {ExperimentalGenerateApi} from './generate.js'
import type {RpcCallOptions} from '@conciv/client'
import type {PluginInfo} from '@conciv/client'
import type {App} from '../app.js'
import type {PluginOptions} from '@conciv/protocol/options'
import type {Info, PublicRef} from '@conciv/protocol/schema/location'
import type {AgentDomain} from './agent.js'
import type {BundlerDomain} from './bundler.js'
import type {EventDomain} from './event.js'
import type {CredentialDomain, IntegrationDomain} from './integration.js'
import type {ModelDomain} from './model.js'
import type {PermissionDomain} from './permission.js'
import type {RpcDomain} from './rpc.js'
import type {Servers} from '@conciv/client'
import type {SessionDomain} from './session.js'
import type {JobDomain} from './job.js'
import type {SkillDomain} from './skill.js'
import type {StorageDomain} from './storage.js'
import type {ToolDomain} from './tool.js'
import type {SessionId} from '@conciv/types/chat-types'
import type {BrowserTabList} from '@conciv/protocol/schema/browser-tab'

export interface Context {
  readonly app: App | undefined
  readonly location: Info
  readonly options: PluginOptions
  readonly agent: AgentDomain
  readonly bundler: BundlerDomain
  readonly credential: CredentialDomain
  readonly event: EventDomain
  readonly experimental: {
    /** @remarks Not implemented yet. Always undefined in this version. */
    readonly generate: ExperimentalGenerateApi | undefined
  }
  readonly integration: IntegrationDomain
  readonly model: ModelDomain
  readonly permission: PermissionDomain
  readonly plugin: {
    readonly list: (requestOptions?: RpcCallOptions) => Promise<{location: PublicRef; data: PluginInfo[]}>
  }
  readonly rpc: RpcDomain
  readonly browserTabs: BrowserTabDomain
  readonly job: JobDomain
  readonly session: SessionDomain
  readonly skill: SkillDomain
  readonly storage: StorageDomain
  readonly tool: ToolDomain
  readonly servers: Servers
}

export interface BrowserTabDomain {
  readonly list: (sessionId: SessionId) => Promise<BrowserTabList>
  readonly sessions: () => Promise<SessionId[]>
}

export type Cleanup = () => Promise<void> | void

export interface Plugin {
  readonly id: string
  readonly setup: (context: Context) => Promise<Cleanup | void> | Cleanup | void
}

export function define(plugin: Plugin): Plugin {
  return plugin
}
