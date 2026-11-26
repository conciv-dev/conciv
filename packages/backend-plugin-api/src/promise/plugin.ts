import type {ExperimentalGenerateApi} from './generate.js'
import type {RpcCallOptions} from '@conciv/client'
import type {PluginInfo} from '@conciv/client'
import type {App} from '../app.js'
import type {PluginOptions} from '@conciv/protocol/options'
import type {Info, PublicRef} from '@conciv/protocol/schema/location'
import type {AgentDomain} from './agent.js'
import type {EventDomain} from './event.js'
import type {ModelDomain} from './model.js'
import type {PermissionDomain} from './permission.js'
import type {RpcDomain} from './rpc.js'
import type {Servers} from '@conciv/client'
import type {SessionDomain} from './session.js'
import type {SkillDomain} from './skill.js'
import type {StorageDomain} from './storage.js'
import type {ToolDomain} from './tool.js'

export interface Context {
  readonly app: App | undefined
  readonly location: Info
  readonly options: PluginOptions
  readonly agent: AgentDomain
  readonly event: EventDomain
  readonly experimental: {
    /** @remarks Not implemented yet. Always undefined in this version. */
    readonly generate: ExperimentalGenerateApi | undefined
  }
  readonly model: ModelDomain
  readonly permission: PermissionDomain
  readonly plugin: {
    readonly list: (requestOptions?: RpcCallOptions) => Promise<{location: PublicRef; data: PluginInfo[]}>
  }
  readonly rpc: RpcDomain
  readonly session: SessionDomain
  readonly skill: SkillDomain
  readonly storage: StorageDomain
  readonly tool: ToolDomain
  readonly servers: Servers
}

export type Cleanup = () => Promise<void> | void

export interface Plugin {
  readonly id: string
  readonly setup: (context: Context) => Promise<Cleanup | void> | Cleanup | void
}

export function define(plugin: Plugin): Plugin {
  return plugin
}
