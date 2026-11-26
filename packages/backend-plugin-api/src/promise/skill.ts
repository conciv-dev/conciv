import type {RpcCallOptions} from '@conciv/client/plugin'
import type {PublicRef} from '@conciv/protocol/schema/location'
import type * as Skill from '@conciv/protocol/schema/skill'
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
  readonly list: (requestOptions?: RpcCallOptions) => Promise<{location: PublicRef; data: Skill.Info[]}>
  readonly transform: Transform<SkillEditor>
  readonly reload: () => Promise<void>
}
