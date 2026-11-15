import type {Location} from '../../schema/location.js'
import {Skill} from '../../schema/skill.js'
import type {Effect, Types} from 'effect'
import type {Transform} from './registration.js'

export interface SkillEditor {
  list(): readonly Types.DeepMutable<Skill.Info>[]
  get(id: string): Types.DeepMutable<Skill.Info> | undefined
  add(skill: Skill.Info): void
  update(id: string, update: (skill: Types.DeepMutable<Skill.Info>) => void): void
  remove(id: string): void
}

export interface SkillDomain {
  readonly list: (input?: {
    readonly location?: {readonly directory?: string | undefined} | undefined
  }) => Effect.Effect<{readonly location: Location.PublicRef; readonly data: ReadonlyArray<Skill.Info>}, unknown>
  readonly transform: Transform<SkillEditor>
  readonly reload: () => Effect.Effect<void>
}
