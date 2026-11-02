import {randomUUID} from 'node:crypto'
import {existsSync} from 'node:fs'
import {mkdir, readdir, readFile, rename, rm, writeFile} from 'node:fs/promises'
import {join, relative} from 'node:path'
import {toolError} from '@conciv/extension'
import {z} from 'zod'
import {BoxSchema, DiffReportSchema, type DiffReport} from '../shared/defs.js'
import {TOLERANCES} from '../shared/tolerances.js'
import {
  ROLES,
  type Decision,
  type StoredRun,
  type TargetModel,
  type TargetRecord,
  type TargetStore,
} from '../shared/types.js'
import {decodePng, encodePng} from './raster.js'

export const TARGET_FILE = 'target.png'
const MODEL_FILE = 'model.json'
const RECORD_FILE = 'record.json'
const DECISIONS_FILE = 'decisions.json'
const CAPTURES_DIR = 'captures'
const RUN_PREFIXES = ['live-', 'diff-', 'result-']

const OcrLineSchema = z.object({box: BoxSchema, text: z.string(), confidence: z.number()})

const NodeBaseSchema = z.object({id: z.string(), box: BoxSchema, within: z.string().optional()})

const TextNodeSchema = NodeBaseSchema.extend({
  kind: z.literal('text'),
  text: z.string(),
  lines: z.array(OcrLineSchema),
  confidence: z.number(),
  role: z.enum(ROLES).optional(),
  roleConfidence: z.number().optional(),
  typography: z
    .object({size: z.number(), lineHeight: z.number(), weight: z.number(), confidence: z.number()})
    .optional(),
})

const BoxNodeSchema = NodeBaseSchema.extend({
  kind: z.literal('box'),
  paint: z.object({background: z.string()}).optional(),
  border: z.object({width: z.number(), color: z.string()}).nullable(),
  radius: z.number(),
})

const ImageNodeSchema = NodeBaseSchema.extend({kind: z.literal('image')})

const TargetNodeSchema = z.discriminatedUnion('kind', [TextNodeSchema, BoxNodeSchema, ImageNodeSchema])

const ModelSchema = z.object({
  id: z.string(),
  source: z.object({kind: z.string(), ref: z.string()}),
  viewport: z.object({width: z.number(), height: z.number()}),
  root: z.object({id: z.string(), box: BoxSchema}),
  nodes: z.array(TargetNodeSchema),
  scale: z.number(),
})

const RecordSchema = z.object({
  id: z.string(),
  session: z.string().default(''),
  route: z.string().optional(),
  width: z.number(),
  height: z.number(),
  name: z.string().optional(),
  scale: z.number(),
  createdAt: z.number(),
  acceptedRun: z.string().optional(),
})

const DecisionsSchema = z.array(
  z.object({
    id: z.string(),
    kind: z.enum(['pin', 'excluded', 'image-slot', 'accept-delta', 'tolerance']),
    anchor: z.string(),
    value: z.union([z.string(), z.number(), z.null()]),
    at: z.number(),
  }),
)

function stamp(): string {
  return `${Date.now()}-${randomUUID().slice(0, 4)}`
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function readJson<T>(input: {path: string; schema: z.ZodType<T>}): Promise<T | null> {
  const text = await readFile(input.path, 'utf8').catch(() => null)
  if (text === null) return null
  const parsed = input.schema.safeParse(parseJson(text))
  return parsed.success ? parsed.data : null
}

function runStamp(input: {name: string; prefix: string}): string {
  return input.name.slice(input.prefix.length).split('.')[0] ?? ''
}

async function prune(input: {dir: string; prefix: string; spared: string[]}): Promise<void> {
  const names = (await readdir(input.dir))
    .filter((name) => name.startsWith(input.prefix))
    .filter((name) => !input.spared.includes(runStamp({name, prefix: input.prefix})))
    .toSorted()
  const stale = names.slice(0, Math.max(0, names.length - TOLERANCES.runsKept))
  await Promise.all(stale.map((name) => rm(join(input.dir, name), {force: true})))
}

async function runs(home: string): Promise<string[]> {
  if (!existsSync(home)) return []
  return (await readdir(home))
    .filter((name) => name.startsWith('result-'))
    .map((name) => runStamp({name, prefix: 'result-'}))
    .toSorted()
}

type PutRequest = Parameters<TargetStore['put']>[0]

export function createTargetStore(input: {dir: string; cwd: string}): TargetStore {
  const {dir, cwd} = input
  const queue: {tail: Promise<unknown>} = {tail: Promise.resolve()}

  async function list(filter: {route?: string}): Promise<TargetRecord[]> {
    if (!existsSync(dir)) return []
    const entries = await readdir(dir, {withFileTypes: true})
    const records = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => readJson({path: join(dir, entry.name, RECORD_FILE), schema: RecordSchema})),
    )
    return records
      .filter((record) => record !== null)
      .filter((record) => filter.route === undefined || record.route === filter.route)
      .toSorted((a, b) => a.createdAt - b.createdAt)
  }

  async function find(filter: {id: string}): Promise<TargetRecord | null> {
    return (await list({})).find((record) => record.id === filter.id) ?? null
  }

  async function remove(filter: {id?: string; all?: boolean}): Promise<number> {
    const doomed = (await list({})).filter((record) => filter.all === true || record.id === filter.id)
    await Promise.all(doomed.map((record) => rm(join(dir, record.id), {recursive: true, force: true})))
    return doomed.length
  }

  async function writeRecord(record: TargetRecord): Promise<TargetRecord> {
    await writeFile(join(dir, record.id, RECORD_FILE), JSON.stringify(record))
    return record
  }

  async function register(request: PutRequest): Promise<TargetRecord> {
    const {model, session, route, name} = request
    const {raster, ...rest} = model
    const earlier = await find({id: model.id})
    const home = join(dir, model.id)
    await mkdir(home, {recursive: true})
    await writeFile(join(home, TARGET_FILE), encodePng(raster))
    await writeFile(join(home, MODEL_FILE), JSON.stringify(rest))
    return writeRecord({
      id: model.id,
      session,
      ...(route === undefined ? {} : {route}),
      width: model.viewport.width,
      height: model.viewport.height,
      ...(name === undefined ? {} : {name}),
      scale: model.scale,
      createdAt: Date.now(),
      ...(earlier?.acceptedRun === undefined ? {} : {acceptedRun: earlier.acceptedRun}),
    })
  }

  async function decisions(id: string): Promise<Decision[]> {
    return (await readJson({path: join(dir, id, DECISIONS_FILE), schema: DecisionsSchema})) ?? []
  }

  async function writeDecisions(update: {id: string; decisions: Decision[]}): Promise<void> {
    await writeFile(join(dir, update.id, DECISIONS_FILE), JSON.stringify(update.decisions))
  }

  async function latestRun(id: string): Promise<StoredRun | null> {
    const run = (await runs(join(dir, id))).at(-1)
    if (run === undefined) return null
    const report = await readJson({path: join(dir, id, `result-${run}.json`), schema: DiffReportSchema})
    return report === null ? null : {run, report}
  }

  function serial<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.tail.then(work)
    queue.tail = next.catch(() => undefined)
    return next
  }

  async function existing(id: string): Promise<TargetRecord> {
    const record = await find({id})
    if (record === null) throw toolError('no-target', {message: `no design target with id ${id}`})
    return record
  }

  function reportPath(path: string): string {
    return path.startsWith(cwd) ? relative(cwd, path) : path
  }

  return {
    list,
    remove,
    find,
    put: (request) => serial(() => register(request)),
    current: async ({session}) => {
      const records = await list({})
      const own = records.filter((record) => record.session === session).at(-1)
      if (own !== undefined) return own
      return records.length === 1 ? (records[0] ?? null) : null
    },
    model: async (id): Promise<TargetModel> => {
      const model = await readJson({path: join(dir, id, MODEL_FILE), schema: ModelSchema})
      if (model === null) {
        throw toolError('no-target', {
          message: `the stored design target ${id} is unreadable; register the design image again with design_target`,
        })
      }
      return {...model, raster: decodePng(await readFile(join(dir, id, TARGET_FILE)))}
    },
    decisions,
    decide: ({id, kind, anchor, value}) =>
      serial(async () => {
        await existing(id)
        const decision: Decision = {id: randomUUID().slice(0, 8), kind, anchor, value, at: Date.now()}
        await writeDecisions({id, decisions: [...(await decisions(id)), decision]})
        return decision
      }),
    revoke: ({id, decision}) =>
      serial(async () => {
        const all = await decisions(id)
        const kept = all.filter((entry) => entry.id !== decision)
        if (kept.length === all.length) return false
        await writeDecisions({id, decisions: kept})
        return true
      }),
    accept: ({id, run}) => serial(async () => writeRecord({...(await existing(id)), acceptedRun: run})),
    latestRun,
    writeCapture: async ({png}) => {
      const captures = join(dir, CAPTURES_DIR)
      await mkdir(captures, {recursive: true})
      const path = join(captures, `capture-${stamp()}.png`)
      await writeFile(path, png)
      await prune({dir: captures, prefix: 'capture-', spared: []})
      return path
    },
    writeRun: async ({id, live, diff, result}) => {
      const home = join(dir, id)
      await mkdir(home, {recursive: true})
      const at = stamp()
      const livePath = join(home, `live-${at}.png`)
      const diffPath = join(home, `diff-${at}.png`)
      const report: DiffReport = {...result, diffImage: reportPath(diffPath), livePath: reportPath(livePath)}
      await writeFile(livePath, encodePng(live))
      await writeFile(diffPath, encodePng(diff))
      const pending = join(home, `pending-${at}.json`)
      await writeFile(pending, JSON.stringify(report))
      await rename(pending, join(home, `result-${at}.json`))
      const record = await find({id})
      const spared = [(await runs(home))[0], record?.acceptedRun].filter((run) => run !== undefined)
      await Promise.all(RUN_PREFIXES.map((prefix) => prune({dir: home, prefix, spared})))
      return report
    },
    lastResult: async (id): Promise<DiffReport | null> => (await latestRun(id))?.report ?? null,
    reportPath,
  }
}
