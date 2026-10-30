import {randomUUID} from 'node:crypto'
import {existsSync} from 'node:fs'
import {mkdir, readdir, readFile, rename, rm, writeFile} from 'node:fs/promises'
import {join, relative} from 'node:path'
import {toolError} from '@conciv/extension'
import {z} from 'zod'
import {BoxSchema, DiffReportSchema, type DiffReport} from '../shared/defs.js'
import {TOLERANCES} from '../shared/tolerances.js'
import type {TargetModel, TargetNode, TargetRecord, TargetStore} from '../shared/types.js'
import {decodePng, encodePng} from './raster.js'

export const TARGET_FILE = 'target.png'
const MODEL_FILE = 'model.json'
const RECORD_FILE = 'record.json'
const CAPTURES_DIR = 'captures'

const RecordSchema = z.object({
  id: z.string(),
  route: z.string(),
  width: z.number(),
  height: z.number(),
  name: z.string().optional(),
  scale: z.number(),
  createdAt: z.number(),
})

const TargetNodeSchema: z.ZodType<TargetNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    box: BoxSchema,
    kind: z.enum(['frame', 'text', 'image', 'vector', 'component', 'unknown']).optional(),
    name: z.string().optional(),
    text: z.string().optional(),
    fills: z.object({background: z.string().optional(), foreground: z.string().optional()}).optional(),
    typography: z
      .object({
        family: z.string().optional(),
        size: z.number().optional(),
        weight: z.number().optional(),
        lineHeight: z.number().optional(),
      })
      .optional(),
    layout: z
      .object({
        direction: z.enum(['row', 'column']).optional(),
        gap: z.number().optional(),
        padding: z.array(z.number()).optional(),
      })
      .optional(),
    confidence: z.number(),
    children: z.array(TargetNodeSchema),
  }),
)

const ModelSchema = z.object({
  id: z.string(),
  source: z.object({kind: z.string(), ref: z.string()}),
  viewport: z.object({width: z.number(), height: z.number()}),
  root: TargetNodeSchema,
  scale: z.number(),
})

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

async function prune(input: {dir: string; prefix: string}): Promise<void> {
  const names = (await readdir(input.dir)).filter((name) => name.startsWith(input.prefix)).toSorted()
  const stale = names.slice(0, Math.max(0, names.length - TOLERANCES.runsKept))
  await Promise.all(stale.map((name) => rm(join(input.dir, name), {force: true})))
}

function matches(input: {record: TargetRecord; id?: string; route?: string; width?: number}): boolean {
  if (input.id !== undefined && input.record.id !== input.id) return false
  if (input.route !== undefined && input.record.route !== input.route) return false
  return input.width === undefined || input.record.width === input.width
}

export function createTargetStore(input: {dir: string; cwd: string}): TargetStore {
  const {dir, cwd} = input

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

  async function remove(filter: {id?: string; route?: string}): Promise<number> {
    if (filter.id === undefined && filter.route === undefined) return 0
    const doomed = (await list({})).filter((record) => matches({record, ...filter}))
    await Promise.all(doomed.map((record) => rm(join(dir, record.id), {recursive: true, force: true})))
    return doomed.length
  }

  function reportPath(path: string): string {
    return path.startsWith(cwd) ? relative(cwd, path) : path
  }

  return {
    list,
    remove,
    put: async ({model, route, width, name}) => {
      const stale = (await list({route})).filter((record) => record.width === width)
      await Promise.all(stale.map((record) => rm(join(dir, record.id), {recursive: true, force: true})))
      const id = randomUUID().slice(0, 8)
      const record: TargetRecord = {
        id,
        route,
        width,
        height: model.viewport.height,
        ...(name === undefined ? {} : {name}),
        scale: model.scale,
        createdAt: Date.now(),
      }
      const {raster, ...rest} = model
      const home = join(dir, id)
      await mkdir(home, {recursive: true})
      await writeFile(join(home, TARGET_FILE), encodePng(raster))
      await writeFile(join(home, MODEL_FILE), JSON.stringify({...rest, id}))
      await writeFile(join(home, RECORD_FILE), JSON.stringify(record))
      return record
    },
    find: async (filter) => (await list({})).findLast((record) => matches({record, ...filter})) ?? null,
    model: async (id): Promise<TargetModel> => {
      const model = await readJson({path: join(dir, id, MODEL_FILE), schema: ModelSchema})
      if (model === null) throw toolError('no-target', {message: `no design target with id ${id}`})
      return {...model, raster: decodePng(await readFile(join(dir, id, TARGET_FILE)))}
    },
    writeCapture: async ({png}) => {
      const captures = join(dir, CAPTURES_DIR)
      await mkdir(captures, {recursive: true})
      const path = join(captures, `capture-${stamp()}.png`)
      await writeFile(path, png)
      await prune({dir: captures, prefix: 'capture-'})
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
      await Promise.all(['live-', 'diff-', 'result-'].map((prefix) => prune({dir: home, prefix})))
      return report
    },
    lastResult: async (id): Promise<DiffReport | null> => {
      const home = join(dir, id)
      if (!existsSync(home)) return null
      const last = (await readdir(home))
        .filter((name) => name.startsWith('result-'))
        .toSorted()
        .at(-1)
      if (last === undefined) return null
      return readJson({path: join(home, last), schema: DiffReportSchema})
    },
    reportPath,
  }
}
