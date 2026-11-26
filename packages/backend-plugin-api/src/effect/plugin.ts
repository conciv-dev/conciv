import type * as Location from '@conciv/protocol/schema/location'
import type * as PluginSchema from '@conciv/protocol/schema/plugin'
import type {Effect, FileSystem, Path, Scope} from 'effect'
import type {ChildProcessSpawner} from 'effect/process'
import type {App} from '../app.js'
import type {PluginOptions} from '@conciv/protocol/options'
import type {Servers} from '@conciv/client'
import type {AgentDomain} from './agent.js'
import type {EventDomain} from './event.js'
import type {ModelDomain} from './model.js'
import type {PermissionDomain} from './permission.js'
import type {RpcDomain} from './rpc.js'
import type {SessionDomain} from './session.js'
import type {SkillDomain} from './skill.js'
import type {StorageDomain} from './storage.js'
import type {ToolDomain} from './tool.js'
import type {SessionId} from '@conciv/types/chat-types'
import type {BrowserTabList} from '@conciv/protocol/schema/browser-tab'

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
  readonly browserTabs: BrowserTabDomain
  readonly session: SessionDomain
  readonly skill: SkillDomain
  readonly storage: StorageDomain
  readonly tool: ToolDomain
  readonly servers: Servers
}

export interface BrowserTabDomain {
  readonly list: (sessionId: SessionId) => Effect.Effect<BrowserTabList>
  readonly sessions: () => Effect.Effect<SessionId[]>
}

export type Services = Scope.Scope | FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner

export interface TaggedError {
  readonly _tag: string
  readonly message?: string
}

export interface Plugin<R = Scope.Scope, E extends TaggedError = never> {
  readonly id: string
  readonly effect: (context: Context) => Effect.Effect<void, E, R>
}

export function define<R = Scope.Scope, E extends TaggedError = never>(plugin: Plugin<R, E>) {
  return plugin
}
