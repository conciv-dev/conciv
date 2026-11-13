import type {RequestOptions} from '../promise/harness.js'
import type {PublicRef} from './location.js'
import type {Transform} from '../promise/registration.js'

export type Id = string

export type Name = string

export interface Info {
  readonly id: Id
  readonly name: Name
  readonly description?: string
  readonly autoinvoke?: boolean
  readonly path: string
  readonly content: string
}

type MutableInfo = {-readonly [Key in keyof Info]: Info[Key]}

export interface SkillEditor {
  list(): readonly MutableInfo[]
  get(id: string): MutableInfo | undefined
  add(skill: Info): void
  update(id: string, update: (skill: MutableInfo) => void): void
  remove(id: string): void
}

export interface SkillDomain {
  readonly list: (requestOptions?: RequestOptions) => Promise<{location: PublicRef; data: Info[]}>
  readonly transform: Transform<SkillEditor>
  readonly reload: () => Promise<void>
}
