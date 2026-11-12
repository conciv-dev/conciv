import type {App, BundlerDomain, HarnessDomain, ListInput, Location, RequestOptions} from './domains.js'
import type {Servers} from './servers.js'
import type {SkillDomain} from './skill.js'
import type {Json, StorageDomain} from './storage.js'
import type {ToolDomain} from './tool.js'

export {isToolError, toolError} from './tool.js'
export type {
  ToolContent,
  ToolContext,
  ToolDomain,
  ToolEditor,
  ToolError,
  ToolFileContent,
  ToolInfo,
  ToolMetadata,
  ToolNamespace,
  ToolOptions,
  ToolResult,
  ToolTextContent,
} from './tool.js'
export type {Hooks, Registration, Transform} from './registration.js'
export type {Skill, SkillDomain, SkillEditor} from './skill.js'
export type {Json, StorageDomain, StorageEntry, StorageScanOptions, StorageScanResult} from './storage.js'
export type {ServerRef, Servers} from './servers.js'
export type {App, BundlerDomain, HarnessDomain, ListInput, Location, RequestOptions, ServerHarness} from './domains.js'

/** A plugin's options from its entry in the conciv config, as its engine part receives them. */
export type PluginOptions = {readonly [key: string]: Json}

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
  /** The package exports `./plugin-experimental`, the bundle the conciv app loads. */
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
  readonly app: App
  readonly location: Location
  readonly options: PluginOptions
  readonly plugin: {
    readonly list: (
      input?: ListInput,
      requestOptions?: RequestOptions,
    ) => Promise<{location: Location; data: PluginInfo[]}>
  }
  readonly skill: SkillDomain
  readonly storage: StorageDomain
  readonly tool: ToolDomain
  readonly servers: Servers
  readonly harness: HarnessDomain
  /** Undefined when conciv runs without a bundler it can read. */
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
