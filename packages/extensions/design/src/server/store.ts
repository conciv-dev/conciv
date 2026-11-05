import {randomUUID} from 'node:crypto'
import {join, resolve} from 'node:path'
import {toolError} from '@conciv/extension'
import type {Storage} from 'unstorage'
import {z} from 'zod'
import {
  DecisionSchema,
  DesignSchema,
  RunSchema,
  TargetRecordSchema,
  type Decision,
  type Store,
  type TargetRecord,
  type Words,
} from '../shared/defs.js'
import {TOLERANCES} from '../shared/tolerances.js'

const RUNS_KEPT = 5
const RUN_KEY = 'run'
const RECORD_KEY = 'record'
const CAPTURES = 'captures'
const DriverBaseSchema = z.object({base: z.string()})

export function createStore(input: {state: Storage; words: Words}): Store {
  const {state, words} = input
  const queue: {tail: Promise<unknown>} = {tail: Promise.resolve()}

  function serial<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.tail.then(work)
    queue.tail = next.catch(() => undefined)
    return next
  }

  async function list(route?: string): Promise<TargetRecord[]> {
    const keys = (await state.getKeys()).filter((key) => key.split(':').length === 2 && key.endsWith(`:${RECORD_KEY}`))
    const records = await Promise.all(keys.map((key) => readItem({state, key, schema: TargetRecordSchema})))
    return records
      .filter((entry) => entry !== null)
      .filter((entry) => route === undefined || entry.route === route)
      .toSorted((a, b) => a.createdAt - b.createdAt)
  }

  async function record(id: string): Promise<TargetRecord | null> {
    return readItem({state, key: recordKey(id), schema: TargetRecordSchema})
  }

  async function existing(id: string): Promise<TargetRecord> {
    const found = await record(id)
    if (found === null) throw toolError('no-target', {message: `no design target with id ${id}`})
    return found
  }

  async function writeRecord(written: TargetRecord): Promise<TargetRecord> {
    await state.setItem(recordKey(written.id), written)
    return written
  }

  async function decisions(id: string): Promise<Decision[]> {
    return (await readItem({state, key: decisionsKey(id), schema: z.array(DecisionSchema)})) ?? []
  }

  async function runs(id: string): Promise<string[]> {
    return (await state.getKeys(`${id}:runs`))
      .filter((key) => key.endsWith(`:${RUN_KEY}`))
      .map((key) => key.split(':').at(-2) ?? '')
      .toSorted()
  }

  async function prune(id: string): Promise<void> {
    const accepted = (await record(id))?.acceptedRun
    const all = await runs(id)
    const stale = all.slice(0, Math.max(0, all.length - RUNS_KEPT)).filter((run) => run !== accepted)
    await Promise.all(stale.map((run) => removeUnder({state, base: `${id}:runs:${run}`})))
  }

  return {
    put: ({design, image, session, route, name}) =>
      serial(async () => {
        const earlier = await record(design.id)
        await state.setItemRaw(targetKey(design.id), image)
        await state.setItem(`${design.id}:design`, design)
        await state.setItem(`${design.id}:design.txt`, words.outline(design).join('\n'))
        await state.setItem(`${design.id}:placeholder.tsx`, words.placeholder('react'))
        return writeRecord({
          id: design.id,
          session,
          ...(route === undefined ? {} : {route}),
          width: design.viewport.width,
          height: design.viewport.height,
          ...(name === undefined ? {} : {name}),
          scale: design.scale,
          createdAt: Date.now(),
          ...(earlier?.acceptedRun === undefined ? {} : {acceptedRun: earlier.acceptedRun}),
        })
      }),
    design: async (id) => {
      const design = await readItem({state, key: `${id}:design`, schema: DesignSchema})
      if (design !== null) return design
      throw toolError('no-target', {
        message: `the stored design target ${id} is unreadable; register the design image again with design_target`,
      })
    },
    targetImage: (id) => readRaw({state, key: targetKey(id)}),
    liveImage: ({id, run}) => readRaw({state, key: `${id}:runs:${run}:live.png`}),
    record,
    current: async (session) => {
      const records = await list()
      const own = records.filter((entry) => entry.session === session).at(-1)
      if (own !== undefined) return own
      return records.length === 1 ? (records[0] ?? null) : null
    },
    list,
    remove: async ({id, all}) => {
      if (all === true) {
        const count = (await list()).length
        await state.clear()
        return count
      }
      if (id === undefined || (await record(id)) === null) return 0
      await removeUnder({state, base: id})
      return 1
    },
    runs,
    run: ({id, run}) => readItem({state, key: runKey({id, run}), schema: RunSchema}),
    writeRun: async ({run, live, diff}) => {
      const base = `${run.design}:runs:${run.id}`
      const images = {live: `${base}:live.png`, diff: `${base}:diff.png`}
      if (live.length > 0) await state.setItemRaw(images.live, live)
      if (diff.length > 0) await state.setItemRaw(images.diff, diff)
      const written = RunSchema.parse({
        ...run,
        images: {
          live: keyPath({state, key: images.live}) ?? images.live,
          diff: keyPath({state, key: images.diff}) ?? images.diff,
        },
      })
      await state.setItem(runKey({id: run.design, run: run.id}), written)
      await prune(run.design)
      return written
    },
    writePlaceholder: async ({id, framework}) => {
      await state.setItem(`${id}:placeholder.tsx`, words.placeholder(framework))
    },
    decisions,
    decide: ({id, kind, anchor, value}) =>
      serial(async () => {
        await existing(id)
        const decision: Decision = {id: randomUUID().slice(0, 8), kind, anchor, value, at: Date.now()}
        await state.setItem(decisionsKey(id), [...(await decisions(id)), decision])
        return decision
      }),
    revoke: ({id, decision}) =>
      serial(async () => {
        const all = await decisions(id)
        const kept = all.filter((entry) => entry.id !== decision)
        if (kept.length === all.length) return false
        await state.setItem(decisionsKey(id), kept)
        return true
      }),
    accept: ({id, run}) => serial(async () => writeRecord({...(await existing(id)), acceptedRun: run})),
    writeCapture: async (png) => {
      const key = `${CAPTURES}:${newStamp()}.png`
      await state.setItemRaw(key, png)
      const all = (await state.getKeys(CAPTURES)).toSorted()
      const stale = all.slice(0, Math.max(0, all.length - TOLERANCES.runsKept))
      await Promise.all(stale.map((old) => state.removeItem(old)))
      return key
    },
    path: (key) => keyPath({state, key}),
  }
}

function keyPath(input: {state: Storage; key: string}): string | null {
  const mount = input.state.getMount(input.key)
  const driver = DriverBaseSchema.safeParse(mount.driver.options)
  if (!driver.success) return null
  return join(resolve(driver.data.base), ...input.key.slice(mount.base.length).split(':'))
}

function newStamp(): string {
  return `${Date.now()}-${randomUUID().slice(0, 4)}`
}

async function removeUnder(input: {state: Storage; base: string}): Promise<void> {
  const keys = await input.state.getKeys(input.base)
  await Promise.all(keys.map((key) => input.state.removeItem(key)))
}

async function readItem<T>(input: {state: Storage; key: string; schema: z.ZodType<T>}): Promise<T | null> {
  const value: unknown = await input.state.getItem(input.key).catch(() => null)
  const parsed = input.schema.safeParse(value)
  return parsed.success ? parsed.data : null
}

async function readRaw(input: {state: Storage; key: string}): Promise<Uint8Array | null> {
  const value: unknown = await input.state.getItemRaw(input.key).catch(() => null)
  return value instanceof Uint8Array ? value : null
}

function targetKey(id: string): string {
  return `${id}:target.png`
}

function recordKey(id: string): string {
  return `${id}:${RECORD_KEY}`
}

function decisionsKey(id: string): string {
  return `${id}:decisions`
}

function runKey(input: {id: string; run: string}): string {
  return `${input.id}:runs:${input.run}:${RUN_KEY}`
}
