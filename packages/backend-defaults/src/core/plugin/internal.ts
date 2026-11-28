import type {Plugin, Services} from '@conciv/backend-plugin-api/effect/plugin'
import type {Generation} from '@conciv/backend-app-api/core/plugin/service'
import {Context, Effect, Layer} from 'effect'
import {PluginSupervisor} from '@conciv/backend-app-api'
import {FSUtil} from '@conciv/backend-app-api/util/fs-util'
import * as ConfigAgentPlugin from '../config/plugin/agent.js'
import * as ConfigPluginSource from '@conciv/backend-app-api/core/config/plugin/source'
import * as Global from '@conciv/backend-app-api/util/global'
import * as ConfigSkillPlugin from '../config/plugin/skill.js'
import * as Watcher from '@conciv/backend-app-api/core/filesystem/watcher'
import * as Location from '@conciv/backend-app-api/core/location'
import * as Permission from '@conciv/backend-app-api/core/permission'
import {BundlerSource, EditorSource} from '@conciv/backend-app-api/core/plugin/host'
import * as Skill from '@conciv/backend-app-api/core/skill'
import * as SkillPlugin from './skill.js'
import * as ServerTools from '../tool/plugin/server.js'
import * as SkillTool from '../tool/plugin/skill.js'
import * as Tool from '@conciv/backend-app-api/core/tool'
import * as Bus from '@conciv/backend-app-api/core/bus'
import * as WellKnown from '@conciv/backend-app-api/core/wellknown'
import * as WellKnownPlugin from '../wellknown/plugin.js'

const services = [
  ConfigAgentPlugin.ConfiguredPermissions,
  ConfigPluginSource.ConfiguredPlugins,
  Bus.Service,
  BundlerSource,
  EditorSource,
  FSUtil.Service,
  Global.Service,
  Location.Service,
  Permission.Service,
  Skill.Service,
  Tool.Service,
  Watcher.Service,
  WellKnown.Service,
] as const

export type Requirements = Context.Service.Identifier<(typeof services)[number]>

export type InternalPlugin = Plugin<Requirements | Services, Error>

const pre = [
  WellKnownPlugin.Plugin,
  SkillPlugin.Plugin,
  SkillTool.Plugin,
  ServerTools.Plugin,
] as const satisfies readonly InternalPlugin[]

const post = [ConfigSkillPlugin.Plugin, ConfigAgentPlugin.Plugin] as const satisfies readonly InternalPlugin[]

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
  list().pipe(Effect.map((plugins) => ({...plugins, guarded: new Set<string>()}))),
)
