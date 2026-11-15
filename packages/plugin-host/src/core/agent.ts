export * as Agent from './agent.js'

import {Array, Context, Effect, Layer, Types} from 'effect'
import {Agent} from '../schema/agent.js'
import {Bus} from './bus.js'
import {State} from './state.js'

export const Id = Agent.Id
export type Id = typeof Id.Type
export const Name = Agent.Name
export type Name = Agent.Name
export const defaultId = Id.make('build')

export const Color = Agent.Color

export const Info = Agent.Info
export type Info = Agent.Info

export {Event} from '../schema/agent.js'

export interface Selection {
  readonly id: Id
  readonly info: Info | undefined
}

type Data = {
  agents: Map<Id, Types.DeepMutable<Info>>
  default?: Id
}

export type Editor = {
  list: () => readonly Types.DeepMutable<Info>[]
  get: (id: Id) => Types.DeepMutable<Info> | undefined
  default: (id: Id | undefined) => void
  update: (id: Id, fn: (agent: Types.DeepMutable<Info>) => void) => void
  remove: (id: Id) => void
}

export interface Interface extends State.Transformable<Editor> {
  readonly get: (id: Id) => Effect.Effect<Info | undefined>
  readonly resolve: (id?: Id | string) => Effect.Effect<Info | undefined>
  readonly select: (id?: Id) => Effect.Effect<Selection>
  readonly list: () => Effect.Effect<Info[]>
}

export const Service = Context.Service<Interface>('@opencode/Agent')

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const selectable = (agent: Info | undefined) =>
      agent && agent.mode !== 'subagent' && !agent.hidden ? agent : undefined
    const selectedDefault = (data: Data) => {
      const configured = data.default ? selectable(data.agents.get(data.default)) : undefined
      if (configured) return configured
      const build = selectable(data.agents.get(defaultId))
      if (build) return build
      for (const agent of data.agents.values()) {
        const fallback = selectable(agent)
        if (fallback) return fallback
      }
    }
    const list = (data: Data) => {
      const agents = Array.fromIterable(data.agents.values())
      const selected = selectedDefault(data)
      if (!selected) return agents
      return [selected, ...agents.filter((agent) => agent.id !== selected.id)]
    }
    const state = State.create<Data, Editor>({
      name: 'agent',
      initial: () => ({agents: new Map([[defaultId, Info.default(defaultId)]])}),
      editor: (editor) => ({
        list: () => Array.fromIterable(editor.agents.values()),
        get: (id) => editor.agents.get(id),
        default: (id) => {
          editor.default = id
        },
        update: (id, fn) => {
          const current = editor.agents.get(id) ?? (Info.default(id) as Types.DeepMutable<Info>)
          if (!editor.agents.has(id)) editor.agents.set(id, current)
          fn(current)
          current.id = id
        },
        remove: (id) => {
          editor.agents.delete(id)
        },
      }),
      notify: State.changes(list, () => bus.publish(Agent.Event.Updated, {}).pipe(Effect.asVoid)),
    })

    return Service.of({
      transform: state.transform,
      reload: state.reload,
      get: Effect.fn('Agent.get')(function* (id) {
        return state.get().agents.get(id)
      }),
      resolve: Effect.fnUntraced(function* (id) {
        if (id !== undefined) return state.get().agents.get(Id.make(id))
        return selectedDefault(state.get())
      }),
      select: Effect.fn('Agent.select')(function* (id) {
        if (id !== undefined) return {id, info: state.get().agents.get(id)}
        const info = selectedDefault(state.get())
        return {id: info?.id ?? defaultId, info}
      }),
      list: Effect.fn('Agent.list')(function* () {
        return list(state.get())
      }),
    })
  }),
)
