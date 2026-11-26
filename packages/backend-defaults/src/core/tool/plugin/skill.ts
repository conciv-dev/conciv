import type {Context} from '@conciv/backend-plugin-api/effect/plugin'
import {makeToolFailure} from '@conciv/backend-app-api/ai/effect'
import {Effect, Schema} from 'effect'
import {FSUtil} from '@conciv/backend-app-api/util/fs-util'
import * as Skill from '@conciv/backend-app-api/core/skill'
import * as Permission from '@conciv/backend-app-api/core/permission'

export const name = 'skill'

export const Input = Schema.Struct({
  id: Skill.Id.annotate({description: 'The ID of an available skill or a skill explicitly referenced by the user'}),
})

export const Output = Schema.Struct({
  name: Skill.Name,
  directory: Schema.String,
  output: Schema.String,
})
export const description = [
  "Load a specialized skill's instructions and resources into the current conversation when the task at hand matches its description.",
  '',
  'The skill ID must match an available skill or a skill explicitly referenced by the user.',
].join('\n')

export const toModelOutput = Skill.toModelOutput

const unableToLoad = (name: string, error?: unknown) =>
  makeToolFailure({message: `Unable to load skill ${name}`, error})

export const Plugin = {
  id: 'conciv.tool.skill',
  effect: Effect.fn('SkillTool.Plugin')(function* (ctx: Context) {
    const fs = yield* FSUtil.Service
    const skills = yield* Skill.Service
    const permission = yield* Permission.Service
    yield* ctx.tool
      .transform((editor) =>
        editor.add({
          name,
          options: {codemode: false},
          description,
          input: Input,
          output: Output,
          execute: (input, context) =>
            Effect.gen(function* () {
              const skill = yield* skills.get(input.id)
              if (!skill) return yield* Effect.fail(unableToLoad(input.id))
              return yield* Effect.gen(function* () {
                yield* permission.assert({
                  action: name,
                  resources: [skill.id],
                  save: [skill.id],
                  ...Permission.invocation(context),
                })
                const files = yield* skills.files(skill.id)
                return {name: skill.name, ...(yield* Skill.prepare(fs, skill, files))}
              }).pipe(Effect.mapError((error) => unableToLoad(input.id, error)))
            }).pipe(
              Effect.map((output) => ({
                output,
                content: output.output,
                metadata: {name: output.name, directory: output.directory},
              })),
            ),
        }),
      )
      .pipe(Effect.orDie)
  }),
}
