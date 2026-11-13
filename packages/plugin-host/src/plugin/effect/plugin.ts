import type {Location} from '../../schema/location.js'
import type {Plugin as PluginSchema} from '../../schema/plugin.js'
import type {Effect, Scope} from 'effect'
import type {App, BundlerDomain, HarnessDomain, PluginOptions, Servers} from '@conciv/plugin'
import type {AgentDomain} from './agent.js'
import type {EventDomain} from './event.js'
import type {ModelDomain} from './model.js'
import type {PermissionDomain} from './permission.js'
import type {RpcDomain} from './rpc.js'
import type {SessionDomain} from './session.js'
import type {SkillDomain} from './skill.js'
import type {StorageDomain} from './storage.js'
import type {ToolDomain} from './tool.js'

export interface Context {
  readonly app: App
  readonly location: Location.Info
  readonly options: PluginOptions
  readonly agent: AgentDomain
  readonly event: EventDomain
  readonly experimental: {
    readonly generate: undefined
  }
  readonly model: ModelDomain
  readonly permission: PermissionDomain
  readonly plugin: {
    readonly list: (input?: {
      readonly location?: {readonly directory?: string | undefined} | undefined
    }) => Effect.Effect<
      {readonly location: Location.PublicRef; readonly data: ReadonlyArray<PluginSchema.Info>},
      unknown
    >
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

export interface Plugin<R = Scope.Scope> {
  readonly id: string
  readonly effect: (context: Context) => Effect.Effect<void, never, R>
}

export function define<R = Scope.Scope>(plugin: Plugin<R>) {
  return plugin
}
