import type {ListInput, Location, RequestOptions} from './domains.js'
import type {Transform} from './registration.js'

export interface Skill {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly autoinvoke?: boolean
  readonly content: string
}

type MutableSkill = {-readonly [Key in keyof Skill]: Skill[Key]}

export interface SkillEditor {
  list(): readonly MutableSkill[]
  get(id: string): MutableSkill | undefined
  add(skill: Skill): void
  update(id: string, update: (skill: MutableSkill) => void): void
  remove(id: string): void
}

export interface SkillDomain {
  readonly list: (input?: ListInput, requestOptions?: RequestOptions) => Promise<{location: Location; data: Skill[]}>
  readonly transform: Transform<SkillEditor>
  readonly reload: () => Promise<void>
}
