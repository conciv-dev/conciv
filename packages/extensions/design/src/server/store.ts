import {toolError} from '@conciv/extension'
import type {Storage} from 'unstorage'
import type {z} from 'zod'
import {DesignSchema, IdTreeSchema, MappingSchema, RoundSchema, TargetRecordSchema, type Store} from '../shared/defs.js'

export function createStore(input: {state: Storage}): Store {
  const {state} = input
  const queue: {tail: Promise<unknown>} = {tail: Promise.resolve()}

  function serial<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.tail.then(work)
    queue.tail = next.catch(() => undefined)
    return next
  }

  async function list(): Promise<z.output<typeof TargetRecordSchema>[]> {
    const keys = (await state.getKeys()).filter((key) => key.split(':').length === 2 && key.endsWith(`:${RECORD}`))
    const records = await Promise.all(keys.map((key) => readItem({state, key, schema: TargetRecordSchema})))
    return records.filter((entry) => entry !== null).toSorted((a, b) => a.createdAt - b.createdAt)
  }

  async function roundNumbers(id: string): Promise<number[]> {
    return (await state.getKeys(`${id}:${ROUNDS}`))
      .map((key) => Number(key.split(':').at(-1)))
      .filter((round) => Number.isInteger(round))
      .toSorted((a, b) => a - b)
  }

  return {
    put: ({design, image, session, route}) =>
      serial(async () => {
        await state.setItemRaw(`${design.id}:${IMAGE}`, image)
        await state.setItem(`${design.id}:${DESIGN}`, design)
        const record = {
          id: design.id,
          session,
          ref: design.source.ref,
          ...(route === undefined ? {} : {route}),
          width: design.viewport.width,
          height: design.viewport.height,
          scale: design.scale,
          createdAt: Date.now(),
        }
        await state.setItem(`${design.id}:${RECORD}`, record)
        return record
      }),
    design: async (id) => {
      const design = await readItem({state, key: `${id}:${DESIGN}`, schema: DesignSchema})
      if (design !== null) return design
      throw toolError('no-target', {message: `the stored design ${id} is unreadable; call design_get again`})
    },
    image: ({id, round, kind}) =>
      readRaw({state, key: round === undefined ? `${id}:${IMAGE}` : `${id}:${kind ?? 'live'}:${round}.png`}),
    mapping: async (id) => (await readItem({state, key: `${id}:${MAPPING}`, schema: MappingSchema})) ?? {},
    writeMapping: ({id, mapping}) => serial(() => state.setItem(`${id}:${MAPPING}`, mapping)),
    ids: (id) => readItem({state, key: `${id}:${IDS}`, schema: IdTreeSchema}),
    writeIds: ({id, ids}) => serial(() => state.setItem(`${id}:${IDS}`, ids)),
    writeRound: ({id, round, live, diff}) =>
      serial(async () => {
        if (live.length > 0) await state.setItemRaw(`${id}:live:${round.round}.png`, live)
        if (diff.length > 0) await state.setItemRaw(`${id}:diff:${round.round}.png`, diff)
        const written = RoundSchema.parse(round)
        await state.setItem(`${id}:${ROUNDS}:${round.round}`, written)
        return written
      }),
    round: ({id, round}) => readItem({state, key: `${id}:${ROUNDS}:${round}`, schema: RoundSchema}),
    rounds: async (id) => {
      const read = await Promise.all(
        (await roundNumbers(id)).map((round) =>
          readItem({state, key: `${id}:${ROUNDS}:${round}`, schema: RoundSchema}),
        ),
      )
      return read.filter((round) => round !== null)
    },
    clear: (id) =>
      serial(async () => {
        const keys = await state.getKeys(id)
        await Promise.all(keys.map((key) => state.removeItem(key)))
      }),
    current: async (session) => {
      const records = await list()
      const own = records.filter((entry) => entry.session === session).at(-1)
      if (own !== undefined) return own
      return records.at(-1) ?? null
    },
    list,
  }
}

const RECORD = 'record'
const DESIGN = 'design'
const IMAGE = 'target.png'
const MAPPING = 'mapping'
const IDS = 'ids'
const ROUNDS = 'rounds'

async function readItem<T>(input: {state: Storage; key: string; schema: z.ZodType<T>}): Promise<T | null> {
  const value: unknown = await input.state.getItem(input.key).catch(() => null)
  const parsed = input.schema.safeParse(value)
  return parsed.success ? parsed.data : null
}

async function readRaw(input: {state: Storage; key: string}): Promise<Uint8Array | null> {
  const value: unknown = await input.state.getItemRaw(input.key).catch(() => null)
  return value instanceof Uint8Array ? value : null
}
