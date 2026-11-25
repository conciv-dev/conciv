export * as PluginInternal from './internal.js'

import type {Plugin, Services, TaggedError} from '@conciv/backend-plugin-api/effect/plugin'
import type {Generation} from '@conciv/backend-app-api/core/plugin/service'
import {Context, Effect, Layer} from 'effect'
import {PluginSupervisor} from '@conciv/backend-app-api'
import {FSUtil} from '@conciv/backend-app-api/util/fs-util'
import {ConfigAgentPlugin} from '../config/plugin/agent.js'
import {ConfigPluginSource} from '@conciv/backend-app-api/core/config/plugin/source'
import {Global} from '@conciv/backend-app-api/util/global'
import {ConfigSkillPlugin} from '../config/plugin/skill.js'
import {Watcher} from '@conciv/backend-app-api/core/filesystem/watcher'
import {Location} from '@conciv/backend-app-api/core/location'
import {Permission} from '@conciv/backend-app-api/core/permission'
import {BundlerSource, EditorSource} from '@conciv/backend-app-api/core/plugin/host'
import {Skill} from '@conciv/backend-app-api/core/skill'
import {SkillPlugin} from './skill.js'
import {ServerTools} from '../tool/plugin/server.js'
import {SkillTool} from '../tool/plugin/skill.js'
import {Tool} from '@conciv/backend-app-api/core/tool'

const services = [
  ConfigAgentPlugin.ConfiguredPermissions,
  ConfigPluginSource.ConfiguredPlugins,
  BundlerSource,
  EditorSource,
  FSUtil.Service,
  Global.Service,
  Location.Service,
  Permission.Service,
  Skill.Service,
  Tool.Service,
  Watcher.Service,
] as const

export type Requirements = Context.Service.Identifier<(typeof services)[number]>

export type InternalPlugin = Plugin<Requirements | Services, TaggedError>

const pre = [SkillPlugin.Plugin, SkillTool.Plugin, ServerTools.Plugin] as const satisfies readonly InternalPlugin[]

const post = [ConfigSkillPlugin.Plugin, ConfigAgentPlugin.Plugin] as const satisfies readonly InternalPlugin[]

export const guarded: ReadonlySet<string> = new Set([])

export const list = Effect.fn('PluginInternal.list')(function* () {
  const context = Context.pick(...services)(yield* Effect.context<Requirements>())
  const resolve = (plugins: readonly InternalPlugin[]) =>
    plugins.map(
      (plugin) =>
        ({
          id: plugin.id,
          effect: (host) => plugin.effect(host).pipe(Effect.provide(context)),
          revision: 'internal',
          source: {type: 'builtin'},
        }) satisfies Generation,
    )
  return {
    pre: resolve(pre),
    post: resolve(post),
  }
})

export const layer = Layer.effect(
  PluginSupervisor.BuiltinPlugins,
  list().pipe(Effect.map((plugins) => ({...plugins, guarded}))),
)
