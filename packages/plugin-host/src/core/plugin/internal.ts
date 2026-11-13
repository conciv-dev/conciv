export * as PluginInternal from './internal.js'

import type {Plugin} from '../../plugin/effect/plugin.js'
import type {Generation} from './service.js'
import {Context, Effect, Scope} from 'effect'
import {FSUtil} from '../../util/fs-util.js'
import {Permission} from '../permission.js'
import {Skill} from '../skill.js'
import {SkillTool} from '../tool/plugin/skill.js'
import {Tool} from '../tool.js'

const services = [FSUtil.Service, Permission.Service, Skill.Service, Tool.Service] as const

export type Requirements = Context.Service.Identifier<(typeof services)[number]>

export type InternalPlugin = Plugin<Requirements | Scope.Scope>

const pre = [SkillTool.Plugin] as const satisfies readonly InternalPlugin[]

const post = [] as const satisfies readonly InternalPlugin[]

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
