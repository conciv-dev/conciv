import type {ExperimentalGenerateApi} from '../client/promise/api.js'
import type {RequestOptions} from '../client/promise/generated/client.js'
import type {PluginInfo} from '../client/promise/generated/types.js'
import type {App} from '../app.js'
import type {Servers} from '../experimental/host-apis.js'
import type {PluginOptions} from '../options.js'
import type {Info, PublicRef} from '../schema/location.js'
import type {AgentDomain} from './agent.js'
import type {BundlerDomain} from './bundler.js'
import type {EventDomain} from './event.js'
import type {HarnessDomain} from './harness.js'
import type {ModelDomain} from './model.js'
import type {PermissionDomain} from './permission.js'
import type {RpcDomain} from './rpc.js'
import type {SessionDomain} from './session.js'
import type {SkillDomain} from './skill.js'
import type {StorageDomain} from './storage.js'
import type {ToolDomain} from './tool.js'

export interface Context {
  /** @remarks Not implemented yet. Always undefined in this version. */
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
    readonly list: (requestOptions?: RequestOptions) => Promise<{location: PublicRef; data: PluginInfo[]}>
  }
  readonly rpc: RpcDomain
  readonly session: SessionDomain
  readonly skill: SkillDomain
  readonly storage: StorageDomain
  readonly tool: ToolDomain
  readonly servers: Servers
  readonly harness: HarnessDomain
  readonly bundler: BundlerDomain | undefined
}

export type Cleanup = () => Promise<void> | void

export interface Plugin {
  readonly id: string
  readonly setup: (context: Context) => Promise<Cleanup | void> | Cleanup | void
}

export function define(plugin: Plugin): Plugin {
  return plugin
}
