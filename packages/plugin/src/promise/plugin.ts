import type {AgentDomain} from '../schema/agent.js'
import type {App} from '../app.js'
import type {BundlerDomain, HarnessDomain, RequestOptions} from './harness.js'
import type {EventDomain} from '../schema/event.js'
import type {ExperimentalGenerateApi} from '../client/promise/generated/types.js'
import type {Info, PublicRef} from '../schema/location.js'
import type {ModelDomain} from '../schema/model.js'
import type {PluginOptions} from '../options.js'
import type {PermissionDomain} from '../permission.js'
import type {RpcDomain} from '../schema/rpc.js'
import type {Servers} from '../client/promise/index.js'
import type {SessionDomain} from './session.js'
import type {SkillDomain} from '../schema/skill.js'
import type {StorageDomain} from '../storage.js'
import type {ToolDomain} from '../schema/tool.js'

export type PluginSource =
  | {readonly type: 'builtin'}
  | {
      readonly type: 'package'
      readonly target: string
      readonly version?: string
      readonly outdated?: true
      readonly updating?: true
    }
  | {readonly type: 'local'; readonly path: string}
  | {readonly type: 'sdk'}

export interface PluginFeatures {
  readonly server?: true
  readonly rpc?: true
  readonly experimental?: true
}

export type PluginState =
  | {readonly status: 'active'}
  | {readonly status: 'failed'; readonly error: string; readonly ref?: string}

export interface PluginInfo {
  readonly id?: string
  readonly source: PluginSource
  readonly features: PluginFeatures
  readonly state: PluginState
}

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
