import {randomUUID} from 'node:crypto'
import {join, resolve} from 'node:path'
import {toolError} from '@conciv/extension'
import type {Storage} from 'unstorage'
import {z} from 'zod'
import {
  DecisionSchema,
  DesignSchema,
  DiffReportSchema,
  RunSchema,
  TargetRecordSchema,
  type Decision,
  type Design,
  type DesignNode,
  type Store,
  type TargetRecord,
  type Words,
} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'

type Typography = Extract<Decision['value'], {size: number}>

const RUNS_KEPT = designConfig.tolerances.runsKept
const CAPTURES_KEPT = 20
const RUN_KEY = 'run'
const REPORT_KEY = 'report'
const RECORD_KEY = 'record'
const CAPTURES = 'captures'
const KEY_SEPARATORS = [':', '/', '\\']
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
    const all = await runs(id)
    const spared = [all[0], (await record(id))?.acceptedRun].filter((run) => run !== undefined)
    const candidates = all.filter((run) => !spared.includes(run))
    const stale = candidates.slice(0, Math.max(0, candidates.length - RUNS_KEPT))
    await Promise.all(stale.map((run) => removeUnder({state, base: `${id}:runs:${run}`})))
  }

  async function current(session: string): Promise<TargetRecord | null> {
    const records = await list()
    const own = records.filter((entry) => entry.session === session).at(-1)
    if (own !== undefined) return own
    return records.length === 1 ? (records[0] ?? null) : null
  }

  return {
    put: ({design, image, session, route, name, framework}) =>
      serial(async () => {
        const earlier = await record(design.id)
        const reregistered = earlier !== null && (await current(session))?.id !== design.id
        if (reregistered) await removeUnder({state, base: `${design.id}:runs`})
        await state.setItemRaw(targetKey(design.id), image)
        await state.setItem(`${design.id}:design`, design)
        const outlined = typed({design, decisions: await decisions(design.id)})
        await state.setItem(`${design.id}:design.txt`, words.outline(outlined).join('\n'))
        await writePlaceholder({state, id: design.id, source: words.placeholder(framework ?? 'react')})
        return writeRecord({
          id: design.id,
          session,
          ...(route === undefined ? {} : {route}),
          width: design.viewport.width,
          height: design.viewport.height,
          ...(name === undefined ? {} : {name}),
          scale: design.scale,
          createdAt: Date.now(),
          ...(earlier?.acceptedRun === undefined || reregistered ? {} : {acceptedRun: earlier.acceptedRun}),
          paths: {
            design: keyPath({state, key: `${design.id}:design.txt`}) ?? '',
            placeholder: keyPath({state, key: `${design.id}:placeholder.tsx`}) ?? '',
          },
        })
      }),
    design: async (id) => {
      const design = await readItem({state, key: `${id}:design`, schema: DesignSchema})
      if (design !== null) return typed({design, decisions: await decisions(id)})
      throw toolError('no-target', {
        message: `the stored design target ${id} is unreadable; register the design image again with design_target`,
      })
    },
    image: ({id, run, kind}) => {
      if (run === undefined) return readRaw({state, key: targetKey(id)})
      return readRaw({state, key: imageKey({id, run, kind: kind ?? 'live'})})
    },
    record,
    current,
    list,
    remove: ({id, all}) =>
      serial(async () => {
        const doomed = (await list()).filter((entry) => all === true || entry.id === id)
        await Promise.all(doomed.map((entry) => removeUnder({state, base: entry.id})))
        return doomed.length
      }),
    runs,
    run: ({id, run}) => readItem({state, key: runKey({id, run}), schema: RunSchema}),
    latest: async (id) => {
      const last = (await runs(id)).at(-1)
      return last === undefined ? null : readItem({state, key: runKey({id, run: last}), schema: RunSchema})
    },
    report: async (id) => {
      const last = (await runs(id)).at(-1)
      return last === undefined ? null : readItem({state, key: reportKey({id, run: last}), schema: DiffReportSchema})
    },
    writeRun: ({run, live, diff, report}) =>
      serial(async () => {
        const images = {
          live: imageKey({id: run.design, run: run.id, kind: 'live'}),
          diff: imageKey({id: run.design, run: run.id, kind: 'diff'}),
        }
        if (live.length > 0) await state.setItemRaw(images.live, live)
        if (diff.length > 0) await state.setItemRaw(images.diff, diff)
        const written = RunSchema.parse({...run, images})
        await state.setItem(reportKey({id: run.design, run: run.id}), report)
        await state.setItem(runKey({id: run.design, run: run.id}), written)
        await prune(run.design)
        return written
      }),
    decisions,
    decide: ({id, kind, anchor, value}) =>
      serial(async () => {
        await existing(id)
        const decision: Decision = {id: randomUUID().slice(0, 8), kind, anchor, value, at: Date.now()}
        const all = [...(await decisions(id)), decision]
        await state.setItem(decisionsKey(id), all)
        const design = kind === 'typography' ? await readItem({state, key: `${id}:design`, schema: DesignSchema}) : null
        if (design !== null) {
          await state.setItem(`${id}:design.txt`, words.outline(typed({design, decisions: all})).join('\n'))
        }
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
      const stale = all.slice(0, Math.max(0, all.length - CAPTURES_KEPT))
      await Promise.all(stale.map((old) => state.removeItem(old)))
      return key
    },
    path: (key) => keyPath({state, key}),
  }
}

function typed(input: {design: Design; decisions: Decision[]}): Design {
  const sizes = new Map(
    input.decisions.flatMap((decision): [string, Typography][] =>
      decision.kind === 'typography' &&
      typeof decision.value === 'object' &&
      decision.value !== null &&
      'size' in decision.value
        ? [[decision.anchor, decision.value]]
        : [],
    ),
  )
  if (sizes.size === 0) return input.design
  const retyped = (node: DesignNode): DesignNode => {
    const children = node.children.map(retyped)
    const found = sizes.get(node.id)
    if (node.kind !== 'text' || found === undefined || node.typography?.confidence === 1) return {...node, children}
    return {...node, typography: found, children}
  }
  return {...input.design, root: retyped(input.design.root)}
}

async function writePlaceholder(input: {state: Storage; id: string; source: string}): Promise<void> {
  const key = `${input.id}:placeholder.tsx`
  const stored: unknown = await input.state.getItem(key).catch(() => null)
  if (stored === input.source) return
  await input.state.setItem(key, input.source)
}

async function readItem<T>(input: {state: Storage; key: string; schema: z.ZodType<T>}): Promise<T | null> {
  const value: unknown = await input.state.getItem(input.key).catch(() => null)
  const parsed = input.schema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function recordKey(id: string): string {
  return `${id}:${RECORD_KEY}`
}

function decisionsKey(id: string): string {
  return `${id}:decisions`
}

async function removeUnder(input: {state: Storage; base: string}): Promise<void> {
  const keys = await input.state.getKeys(input.base)
  await Promise.all(keys.map((key) => input.state.removeItem(key)))
}

function targetKey(id: string): string {
  return `${id}:target.png`
}

async function readRaw(input: {state: Storage; key: string}): Promise<Uint8Array | null> {
  const value: unknown = await input.state.getItemRaw(input.key).catch(() => null)
  return value instanceof Uint8Array ? value : null
}

function imageKey(input: {id: string; run: string; kind: 'live' | 'diff'}): string {
  return `${input.id}:runs:${input.run}:${input.kind}.png`
}

function runKey(input: {id: string; run: string}): string {
  return `${input.id}:runs:${input.run}:${RUN_KEY}`
}

function reportKey(input: {id: string; run: string}): string {
  return `${input.id}:runs:${input.run}:${REPORT_KEY}`
}

function newStamp(): string {
  return `${Date.now()}-${randomUUID().slice(0, 4)}`
}

function keyPath(input: {state: Storage; key: string}): string | null {
  const mount = input.state.getMount(input.key)
  const driver = DriverBaseSchema.safeParse(mount.driver.options)
  if (!driver.success) return null
  const segments = keySegments(input.key)
  return join(resolve(driver.data.base), ...segments.slice(keySegments(mount.base).length))
}

function keySegments(key: string): string[] {
  const bare = key.split('?')[0] ?? ''
  return KEY_SEPARATORS.reduce<string[]>(
    (parts, separator) => parts.flatMap((part) => part.split(separator)),
    [bare],
  ).filter((part) => part.length > 0)
}
