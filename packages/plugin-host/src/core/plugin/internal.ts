export * as PluginInternal from './internal.js'

import type {Plugin, Services, TaggedError} from '@conciv/plugin/effect/plugin'
import type {Generation} from './service.js'
import {Context, Effect} from 'effect'
import {FSUtil} from '../../util/fs-util.js'
import {ConfigAgentPlugin} from '../config/plugin/agent.js'
import {ConfigPluginSource} from '../config/plugin/source.js'
import {Global} from '../../util/global.js'
import {ConfigSkillPlugin} from '../config/plugin/skill.js'
import {Watcher} from '../filesystem/watcher.js'
import {Location} from '../location.js'
import {Permission} from '../permission.js'
import {BundlerSource, EditorSource} from './host.js'
import {Skill} from '../skill.js'
import {SkillPlugin} from './skill.js'
import {ServerTools} from '../tool/plugin/server.js'
import {SkillTool} from '../tool/plugin/skill.js'
import {Tool} from '../tool.js'

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
