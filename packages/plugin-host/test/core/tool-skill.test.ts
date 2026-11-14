import fs from 'fs/promises'
import path from 'path'
import {describe, expect} from 'vitest'
import {NodeFileSystem} from '@effect/platform-node'
import {Effect, Layer} from 'effect'
import {Permission} from '../../src/core/permission.js'
import {AbsolutePath} from '../../src/schema/schema.js'
import {Session} from '../../src/schema/session.js'
import {Skill} from '../../src/core/skill.js'
import {SkillTool} from '../../src/core/tool/plugin/skill.js'
import {Image} from '../../src/core/image.js'
import {Tool} from '../../src/core/tool.js'
import {PluginHooks} from '../../src/core/plugin/hooks.js'
import {tmpdirScoped} from './fixture/tmpdir'
import {it} from './lib/effect'
import {permissionLayer} from './lib/permission'
import {FSUtil} from '../../src/util/fs-util.js'
import {toolIdentity, executeTool, registerToolPlugin, toolDefinitions} from './lib/tool'

const sessionId = Session.Id.make('conciv_skill_tool_test')

describe('SkillTool', () => {
  it.live('lists available skills, authorizes the selected ID, and loads model-facing content', () =>
    tmpdirScoped().pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const directory = path.join(tmp.path, 'effect')
          const location = path.join(directory, 'SKILL.md')
          const reference = path.join(directory, 'reference.md')
          yield* Effect.promise(() => fs.mkdir(directory, {recursive: true}))
          yield* Effect.promise(() =>
            Promise.all([fs.writeFile(location, 'unused'), fs.writeFile(reference, 'reference')]),
          )

          const info: Skill.Info = {
            id: Skill.Id.make('effect'),
            name: Skill.Name.make('Effect'),
            description: 'Use Effect',
            path: AbsolutePath.make(location),
            content: '# Effect\n\nGuidance',
          }
          let current = [info]
          const assertions: Permission.AssertInput[] = []
          let deny = false
          const permission = permissionLayer({
            assert: (input) =>
              Effect.sync(() => assertions.push(input)).pipe(
                Effect.andThen(
                  deny
                    ? Effect.fail(
                        Permission.makeBlockedError({
                          rules: [],
                          permission: input.action,
                          resources: input.resources,
                        }),
                      )
                    : Effect.void,
                ),
              ),
          })
          const skills = Layer.mock(Skill.Service, {
            get: (id) => Effect.succeed(current.find((skill) => skill.id === id)),
            files: () => Effect.undefined,
            list: () => Effect.succeed(current),
          })
          const skillToolLayer = Layer.effectDiscard(registerToolPlugin(SkillTool.Plugin)).pipe(
            Layer.provideMerge(Tool.layer),
            Layer.provide(
              Layer.mergeAll(
                PluginHooks.layer,
                Image.layer,
                FSUtil.layer.pipe(Layer.provide(NodeFileSystem.layer)),
                skills,
                permission,
              ),
            ),
          )

          return yield* Effect.gen(function* () {
            const registry = yield* Tool.Service
            expect((yield* toolDefinitions(registry))[0]).toMatchObject({
              name: 'skill',
              description: SkillTool.description,
            })
            expect(
              yield* executeTool(registry, {
                sessionId,
                ...toolIdentity,
                call: {type: 'tool-call', id: 'call-skill', name: 'skill', input: {id: 'effect'}},
              }),
            ).toMatchObject({
              status: 'completed',
              content: [{type: 'text', text: Skill.toModelOutput(info, [reference])}],
            })
            expect(Skill.toModelOutput(info, [reference])).toContain(`Base directory for this skill: ${directory}`)
            expect(
              yield* executeTool(registry, {
                sessionId,
                ...toolIdentity,
                call: {type: 'tool-call', id: 'call-skill-overflow', name: 'skill', input: {id: 'effect'}},
              }),
            ).toEqual({
              status: 'completed',
              output: {name: 'Effect', directory, output: Skill.toModelOutput(info, [reference])},
              content: [{type: 'text', text: Skill.toModelOutput(info, [reference])}],
              metadata: {name: 'Effect', directory},
            })
            expect(assertions).toMatchObject([
              {sessionId, action: 'skill', resources: ['effect'], save: ['effect']},
              {sessionId, action: 'skill', resources: ['effect'], save: ['effect']},
            ])
            const missing = yield* executeTool(registry, {
              sessionId,
              ...toolIdentity,
              call: {type: 'tool-call', id: 'call-missing-skill', name: 'skill', input: {id: 'missing'}},
            })
            expect(missing.status).toBe('error')
            expect(missing.error?.message).toBe('Unable to load skill missing')
            expect(missing.error?.error).toBeUndefined()
            deny = true
            const denied = yield* executeTool(registry, {
              sessionId,
              ...toolIdentity,
              call: {type: 'tool-call', id: 'call-denied-skill', name: 'skill', input: {id: 'effect'}},
            })
            expect(denied.status).toBe('error')
            expect(denied.error?.error).toMatchObject({
              _tag: 'Permission.BlockedError',
              message: 'Permission denied: skill',
            })
            deny = false
            const flat = Skill.Info.make({
              id: Skill.Id.make('public'),
              name: Skill.Name.make('Public'),
              description: 'Public guidance',
              path: AbsolutePath.make(path.join(tmp.path, 'public.md')),
              content: 'Public',
            })
            yield* Effect.promise(() =>
              Promise.all([
                fs.writeFile(flat.path, 'public'),
                fs.writeFile(path.join(tmp.path, 'secret.md'), 'secret'),
              ]),
            )
            current = [flat]
            expect(
              yield* executeTool(registry, {
                sessionId,
                ...toolIdentity,
                call: {type: 'tool-call', id: 'call-flat-skill', name: 'skill', input: {id: 'public'}},
              }),
            ).toMatchObject({
              status: 'completed',
              content: [{type: 'text', text: Skill.toModelOutput(flat, [])}],
            })
          }).pipe(Effect.provide(skillToolLayer))
        }),
      ),
    ),
  )
})
