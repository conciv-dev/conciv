import {describe, expect} from 'vitest'
import {NodeFileSystem} from '@effect/platform-node'
import {Effect, Layer} from 'effect'
import {ConfigPluginSource} from '../../../src/core/config/plugin/source.js'
import type {ConfigPlugin} from '../../../src/schema/config/plugin.js'
import {SkillPlugin} from '../../../src/core/plugin/skill.js'
import {Skill} from '../../../src/core/skill.js'
import {FSUtil} from '../../../src/util/fs-util.js'
import {permissionLayer} from '../fixture/permission'
import {testEffect} from '../lib/effect'
import {host} from './host'

const it = testEffect(
  Layer.mergeAll(Skill.layer, FSUtil.layer.pipe(Layer.provide(NodeFileSystem.layer))).pipe(
    Layer.provideMerge(permissionLayer),
  ),
)
const config = (plugins: readonly ConfigPlugin.Plugin[] = []) =>
  Layer.succeed(ConfigPluginSource.ConfiguredPlugins, plugins)

describe('SkillPlugin.Plugin', () => {
  it.effect('registers built-in skills', () =>
    Effect.gen(function* () {
      const skill = yield* Skill.Service
      yield* SkillPlugin.Plugin.effect(
        host({
          app: {name: 'test', version: '1.2.3', channel: 'beta'},
          skill: {
            list: () => Effect.die('unused skill.list'),
            transform: skill.transform,
            reload: skill.reload,
          },
        }),
      ).pipe(Effect.provide(config()))
      const skills = yield* skill.list()
      const report = skills.find((item) => item.id === 'report')

      expect(skills).toContainEqual(
        expect.objectContaining({
          id: 'conciv',
          name: 'conciv',
          path: 'skill://conciv/SKILL.md',
          description: expect.stringContaining('any question about conciv itself'),
        }),
      )
      expect(skills).toContainEqual(
        expect.objectContaining({
          id: 'report',
          name: 'Report',
          path: 'skill://report/SKILL.md',
          description: expect.stringContaining('conciv issue'),
        }),
      )
      expect(report?.content).toContain('- conciv version: 1.2.3')
      expect(report?.content).toContain('- Active plugins: None found in config')
    }),
  )

  it.effect('reports canonical configured plugin sources with existing labels and ordering', () =>
    Effect.gen(function* () {
      const skill = yield* Skill.Service
      yield* SkillPlugin.Plugin.effect(
        host({
          skill: {
            list: () => Effect.die('unused skill.list'),
            transform: skill.transform,
            reload: skill.reload,
          },
        }),
      )
      const report = (yield* skill.list()).find((item) => item.id === 'report')
      expect(report?.content).toContain('- Active plugins: -disabled, local.ts, package-plugin, package-plugin')
    }).pipe(Effect.provide(config(['package-plugin', '-disabled', 'local.ts', ['package-plugin', {enabled: true}]]))),
  )
})
