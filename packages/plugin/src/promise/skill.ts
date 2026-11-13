import type {RequestOptions} from '../client/promise/generated/client.js'
import type {PublicRef} from '../schema/location.js'
import type * as Skill from '../schema/skill.js'
import type {Transform} from './registration.js'

type MutableInfo = {-readonly [Key in keyof Skill.Info]: Skill.Info[Key]}

export interface SkillEditor {
  list(): readonly MutableInfo[]
  get(id: string): MutableInfo | undefined
  add(skill: Skill.Info): void
  update(id: string, update: (skill: MutableInfo) => void): void
  remove(id: string): void
}

export interface SkillDomain {
  readonly list: (requestOptions?: RequestOptions) => Promise<{location: PublicRef; data: Skill.Info[]}>
  readonly transform: Transform<SkillEditor>
  readonly reload: () => Promise<void>
}
