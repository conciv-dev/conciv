import {randomUUID} from 'node:crypto'
import {existsSync} from 'node:fs'
import {mkdir, readdir, readFile, rename, rm, writeFile} from 'node:fs/promises'
import {join, relative} from 'node:path'
import {toolError} from '@conciv/extension'
import {groupBy, mapValues, uniq} from 'es-toolkit'
import {z} from 'zod'
import {
  BoxSchema,
  ContainerLayoutSchema,
  DiffReportSchema,
  FingerprintSchema,
  LedgerSchema,
  NodeLayoutSchema,
  type DiffReport,
} from '../shared/defs.js'
import {designFamilies, iconSized, PLACEHOLDER_ATTR, TOLERANCES} from '../shared/tolerances.js'
import {
  ROLES,
  type Decision,
  type Framework,
  type PairRecord,
  type StoredRun,
  type TileCache,
  type TwinPair,
  type TargetModel,
  type TargetRecord,
  type TargetStore,
  type DesignSection,
} from '../shared/types.js'
import {decodePng, encloses, encodePng} from './raster.js'

export const TARGET_FILE = 'target.png'
const MODEL_FILE = 'model.json'
const RECORD_FILE = 'record.json'
const DECISIONS_FILE = 'decisions.json'
const LEDGER_FILE = 'ledger.json'
const DESIGN_FILE = 'design.txt'
const PLACEHOLDER_FILE = 'placeholder.tsx'
const INDENT = '  '
const SECTION_DEPTH = 1
const TWINS_FILE = 'twins.json'
const CAPTURES_DIR = 'captures'
const RUN_PREFIXES = ['live-', 'diff-', 'result-', 'pairs-', 'tiles-']

const OcrLineSchema = z.object({box: BoxSchema, text: z.string(), confidence: z.number()})

const NodeBaseSchema = z.object({
  id: z.string(),
  box: BoxSchema,
  within: z.string().optional(),
  layout: NodeLayoutSchema.optional(),
})

const TextNodeSchema = NodeBaseSchema.extend({
  kind: z.literal('text'),
  text: z.string(),
  lines: z.array(OcrLineSchema),
  confidence: z.number(),
  role: z.enum(ROLES).optional(),
  roleConfidence: z.number().optional(),
  typography: z
    .object({
      size: z.number(),
      lineHeight: z.number(),
      weight: z.number(),
      confidence: z.number(),
      font: z.string(),
      family: z.string().nullable().default(null),
    })
    .optional(),
})

const BoxNodeSchema = NodeBaseSchema.extend({
  kind: z.literal('box'),
  paint: z
    .object({
      background: z.string(),
      gradient: z.object({from: z.string(), to: z.string(), axis: z.enum(['vertical', 'horizontal'])}).optional(),
    })
    .optional(),
  border: z.object({width: z.number(), color: z.string()}).nullable(),
  radius: z.number(),
})

const ImageNodeSchema = NodeBaseSchema.extend({kind: z.literal('image'), holds: z.number().default(0)})

const TargetNodeSchema = z.discriminatedUnion('kind', [TextNodeSchema, BoxNodeSchema, ImageNodeSchema])

const ModelSchema = z.object({
  id: z.string(),
  source: z.object({kind: z.string(), ref: z.string()}),
  viewport: z.object({width: z.number(), height: z.number()}),
  root: z.object({id: z.string(), box: BoxSchema, layout: ContainerLayoutSchema.optional()}),
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
    kind: z.enum(['pin', 'excluded', 'image-slot', 'accept-delta', 'tolerance', 'accept-node']),
    anchor: z.string(),
    value: z.union([z.string(), z.number(), z.null()]),
    at: z.number(),
  }),
)

const PairsSchema: z.ZodType<PairRecord[]> = z.array(
  z.object({
    node: z.string(),
    path: z.string(),
    confidence: z.number(),
    fingerprint: FingerprintSchema.optional(),
  }),
)

const TilesSchema: z.ZodType<TileCache> = z.object({
  side: z.number(),
  columns: z.number(),
  rows: z.number(),
  width: z.number(),
  height: z.number(),
  tiles: z.array(z.object({hash: z.string(), mismatch: z.number(), mask: z.string().optional()})),
})

const TwinsSchema = z.record(
  z.string(),
  z.array(z.object({node: z.string(), twin: z.string(), confidence: z.number()})),
)

export function newStamp(): string {
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
    await writeFile(join(home, DESIGN_FILE), designOutline(rest).join('\n'))
    await writeFile(join(home, PLACEHOLDER_FILE), placeholderSource('react'))
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

  async function storedRun(query: {id: string; run: string}): Promise<StoredRun | null> {
    const {id, run} = query
    const report = await readJson({path: join(dir, id, `result-${run}.json`), schema: DiffReportSchema})
    if (report === null) return null
    const pairs = (await readJson({path: join(dir, id, `pairs-${run}.json`), schema: PairsSchema})) ?? []
    return {run, report, pairs}
  }

  async function writeResult(written: {home: string; at: string; report: DiffReport}): Promise<void> {
    const pending = join(written.home, `pending-${written.at}.json`)
    await writeFile(pending, JSON.stringify(written.report))
    await rename(pending, join(written.home, `result-${written.at}.json`))
  }

  async function latestRun(id: string): Promise<StoredRun | null> {
    const run = (await runs(join(dir, id))).at(-1)
    return run === undefined ? null : storedRun({id, run})
  }

  async function twins(id: string): Promise<Record<string, TwinPair[]>> {
    return (await readJson({path: join(dir, id, TWINS_FILE), schema: TwinsSchema})) ?? {}
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
    run: storedRun,
    tiles: ({id, run}) => readJson({path: join(dir, id, `tiles-${run}.json`), schema: TilesSchema}),
    amend: async ({id, run, report}) => {
      const home = join(dir, id)
      if (!existsSync(join(home, `result-${run}.json`))) return
      await writeResult({home, at: run, report})
    },
    twins,
    setTwins: ({id, other, twins: found}) =>
      serial(async () => {
        if (!existsSync(join(dir, id))) return
        await writeFile(join(dir, id, TWINS_FILE), JSON.stringify({...(await twins(id)), [other]: found}))
      }),
    writeCapture: async ({png}) => {
      const captures = join(dir, CAPTURES_DIR)
      await mkdir(captures, {recursive: true})
      const path = join(captures, `capture-${newStamp()}.png`)
      await writeFile(path, png)
      await prune({dir: captures, prefix: 'capture-', spared: []})
      return path
    },
    ledger: (id) => readJson({path: join(dir, id, LEDGER_FILE), schema: LedgerSchema}),
    writeLedger: async ({id, ledger}) => {
      const home = join(dir, id)
      await mkdir(home, {recursive: true})
      const pending = join(home, `pending-${LEDGER_FILE}`)
      await writeFile(pending, JSON.stringify(ledger))
      await rename(pending, join(home, LEDGER_FILE))
    },
    writeRun: async ({id, run: at, images, result, pairs, tiles}) => {
      const started = performance.now()
      const home = join(dir, id)
      await mkdir(home, {recursive: true})
      const livePath = join(home, `live-${at}.png`)
      const diffPath = join(home, `diff-${at}.png`)
      await writeFile(livePath, images.live)
      await writeFile(diffPath, images.diff)
      await writeFile(join(home, `pairs-${at}.json`), JSON.stringify(pairs))
      await writeFile(join(home, `tiles-${at}.json`), JSON.stringify(tiles))
      const write = Math.round(performance.now() - started)
      const timings = {...result.timings, write, total: result.timings.total + write}
      const report: DiffReport = {...result, timings, diffImage: reportPath(diffPath), livePath: reportPath(livePath)}
      await writeResult({home, at, report})
      const record = await find({id})
      const spared = [(await runs(home))[0], record?.acceptedRun].filter((run) => run !== undefined)
      await Promise.all(RUN_PREFIXES.map((prefix) => prune({dir: home, prefix, spared})))
      return report
    },
    lastResult: async (id): Promise<DiffReport | null> => (await latestRun(id))?.report ?? null,
    setTypography: ({id, typography}) =>
      serial(async () => {
        const path = join(dir, id, MODEL_FILE)
        const model = await readJson({path, schema: ModelSchema})
        if (model === null) return
        const nodes = model.nodes.map((node) => {
          const found = typography[node.id]
          return node.kind === 'text' && found !== undefined && node.typography?.confidence !== 1
            ? {...node, typography: {...found, family: found.family ?? null}}
            : node
        })
        await writeFile(path, JSON.stringify({...model, nodes}))
        await writeFile(join(dir, id, DESIGN_FILE), designOutline({...model, nodes}).join('\n'))
      }),
    designPath: (id) => reportPath(join(dir, id, DESIGN_FILE)),
    placeholderPath: (id) => reportPath(join(dir, id, PLACEHOLDER_FILE)),
    writePlaceholder: async ({id, framework}) => {
      const path = join(dir, id, PLACEHOLDER_FILE)
      const source = placeholderSource(framework)
      if (!existsSync(join(dir, id)) || (await readFile(path, 'utf8').catch(() => null)) === source) return
      await writeFile(path, source)
    },
    design: async (id) => {
      const text = await readFile(join(dir, id, DESIGN_FILE), 'utf8').catch(() => null)
      return text === null ? [] : text.split('\n')
    },
    sections: async (id) => {
      const model = await readJson({path: join(dir, id, MODEL_FILE), schema: ModelSchema})
      return model === null ? [] : designSections(model)
    },
    reportPath,
  }
}

type StoredModel = z.infer<typeof ModelSchema>
type StoredNode = StoredModel['nodes'][number]

function designOutline(model: StoredModel): string[] {
  const {scale} = model
  const root = `page ${sized({box: model.root.box, scale})}${layoutPhrase(model.root.layout)}`
  const families = designFamilies(model.nodes)
  const fonts = families.length === 0 ? [] : [`fonts: ${families.join(', ')}`]
  return [root, ...fonts, ...outlineLines({nodes: model.nodes, children: topNodes(model), depth: SECTION_DEPTH, scale})]
}

function topNodes(model: StoredModel): StoredNode[] {
  const ids = new Set(model.nodes.map((node) => node.id))
  return model.nodes.filter((node) => node.within === undefined || !ids.has(node.within))
}

function outlineLines(input: {nodes: StoredNode[]; children: StoredNode[]; depth: number; scale: number}): string[] {
  const {nodes, depth, scale} = input
  return input.children
    .toSorted(documentOrder)
    .flatMap((node) => [
      `${INDENT.repeat(depth)}${depth === SECTION_DEPTH ? `section ${node.id} ` : ''}${nodeLine({node, scale})}`,
      ...outlineLines({nodes, children: nodes.filter((child) => child.within === node.id), depth: depth + 1, scale}),
    ])
}

function designSections(model: StoredModel): DesignSection[] {
  const {scale} = model
  const children = groupBy(model.nodes, (node) => node.within ?? '')
  return topNodes(model)
    .toSorted(documentOrder)
    .map((node) => ({
      id: node.id,
      kind: node.kind,
      line: nodeLine({node, scale}),
      box: mapValues(node.box, (value) => Math.round(value / scale)),
      nodes: uniq([
        node.id,
        ...descendants({children, id: node.id}),
        ...model.nodes.filter((other) => encloses({outer: node.box, inner: other.box})).map((other) => other.id),
      ]),
    }))
}

function descendants(input: {children: Record<string, StoredNode[]>; id: string}): string[] {
  const {children} = input
  return (children[input.id] ?? []).flatMap((child) => [child.id, ...descendants({children, id: child.id})])
}

function documentOrder(a: StoredNode, b: StoredNode): number {
  return (
    (a.layout?.index ?? 0) - (b.layout?.index ?? 0) ||
    a.box.y - b.box.y ||
    a.box.x - b.box.x ||
    a.id.localeCompare(b.id)
  )
}

function nodeLine(input: {node: StoredNode; scale: number}): string {
  const {node, scale} = input
  if (node.kind === 'image')
    return `${iconSized(node.box) ? 'icon' : 'image'} ${sized({box: node.box, scale})} placeholder${heldPhrase(node.holds)}`
  if (node.kind === 'text') return textLine({node, scale})
  return `box ${sized({box: node.box, scale})}${layoutPhrase(node.layout)}${paintPhrase(node)}`
}

function heldPhrase(holds: number): string {
  return holds > 0 ? ` (holds ${holds} text lines)` : ''
}

function textLine(input: {node: Extract<StoredNode, {kind: 'text'}>; scale: number}): string {
  const {node, scale} = input
  const type =
    node.typography === undefined
      ? ` size ~${Math.round(node.box.h / scale / TOLERANCES.capRatio)}`
      : ` size ${Math.round(node.typography.size)}/${node.typography.weight}`
  const role = node.role === undefined || node.role === 'unknown' ? '' : ` ${node.role}`
  const lines = node.lines.length > 1 ? ` (${node.lines.length} lines)` : ''
  const family = node.typography?.family ?? null
  return `text "${foldedText(node.text)}"${type}${role}${lines}${family === null ? '' : ` ${family}`}`
}

function paintPhrase(node: Extract<StoredNode, {kind: 'box'}>): string {
  const paint = [
    backgroundPhrase(node.paint),
    node.border === null ? null : `border ${node.border.width} ${node.border.color}`,
    node.radius > 0 ? `radius ${node.radius}` : null,
  ].filter((part) => part !== null)
  return paint.length === 0 ? '' : `, ${paint.join(', ')}`
}

function backgroundPhrase(paint: Extract<StoredNode, {kind: 'box'}>['paint']): string | null {
  if (paint === undefined) return null
  if (paint.gradient === undefined) return `background ${paint.background}`
  const {from, to, axis} = paint.gradient
  return `background gradient ${from} to ${to} ${axis}`
}

function layoutPhrase(layout: Partial<z.infer<typeof ContainerLayoutSchema>> | undefined): string {
  if (layout?.direction === undefined) return ''
  const gap = layout.gap === undefined ? '' : ` gap ${layout.gap.px}`
  const align = layout.align === undefined ? '' : ` align ${layout.align}`
  const sides = layout.padding === undefined ? [] : paddingSides(layout.padding)
  const padding = sides.every((side) => side === 0) ? '' : ` padding ${sides.join(' ')}`
  return ` ${layout.direction}${gap}${align}${layout.wrap === true ? ' wrapping' : ''}${padding}`
}

function paddingSides(padding: z.infer<typeof ContainerLayoutSchema>['padding']): number[] {
  const {top, right, bottom, left} = padding
  if (top !== bottom || right !== left) return [top, right, bottom, left]
  return top === right ? [top] : [top, right]
}

function sized(input: {box: StoredNode['box']; scale: number}): string {
  const {box, scale} = input
  return `${Math.round(box.w / scale)}x${Math.round(box.h / scale)}`
}

function foldedText(text: string): string {
  return text
    .split('\n')
    .flatMap((line) => line.split('\t'))
    .flatMap((part) => part.split(' '))
    .filter((word) => word !== '')
    .join(' ')
}

const PLACEHOLDER_IMPORTS: Record<Framework, {line: string; style: string}> = {
  react: {line: "import type {CSSProperties} from 'react'", style: 'CSSProperties'},
  solid: {line: "import type {JSX} from 'solid-js'", style: 'JSX.CSSProperties'},
}

const PLACEHOLDER_GLYPHS: Record<string, [string, string][]> = {
  icon: [
    ['width', "'40%'"],
    ['height', "'40%'"],
    ['border-radius', "'22%'"],
  ],
  logo: [
    ['width', "'62%'"],
    ['height', "'28%'"],
    ['border-radius', "'999px'"],
  ],
  image: [
    ['width', "'48%'"],
    ['height', "'38%'"],
    ['border-radius', "'12%'"],
    ['display', "'flex'"],
    ['align-items', "'center'"],
    ['justify-content', "'center'"],
  ],
  avatar: [
    ['width', "'42%'"],
    ['height', "'42%'"],
    ['border-radius', "'50%'"],
  ],
}

const PLACEHOLDER_ROOT: [string, string][] = [
  ['width', "'100%'"],
  ['height', "'100%'"],
  ['box-sizing', "'border-box'"],
  ['display', "'flex'"],
  ['align-items', "'center'"],
  ['justify-content', "'center'"],
  ['overflow', "'hidden'"],
  ['border-radius', "props.kind === 'avatar' ? '50%' : '8px'"],
  ['background', '`linear-gradient(135deg, hsl(${hue} 32% 94%), hsl(${(hue + 40) % 360} 32% 86%))`'],
  ['aspect-ratio', 'props.ratio === undefined ? undefined : String(props.ratio)'],
]

const PLACEHOLDER_SPOT: [string, string][] = [
  ['width', "'38%'"],
  ['height', "'48%'"],
  ['border-radius', "'50%'"],
  ['background', '`hsl(${hue} 30% 93%)`'],
]

function placeholderSource(framework: Framework): string {
  const {line, style} = PLACEHOLDER_IMPORTS[framework]
  const object = (entries: [string, string][]): string => styleObject({framework, entries})
  const glyphs = Object.entries(PLACEHOLDER_GLYPHS).map(([kind, entries]) => `  ${kind}: ${object(entries)},`)
  return [
    line,
    '',
    "type PlaceholderKind = 'icon' | 'logo' | 'image' | 'avatar'",
    '',
    'type PlaceholderProps = {kind: PlaceholderKind; label?: string; ratio?: number}',
    '',
    `const GLYPHS: Record<PlaceholderKind, ${style}> = {`,
    ...glyphs,
    '}',
    '',
    'export function Placeholder(props: PlaceholderProps) {',
    '  const hue = hash(props.label ?? props.kind) % 360',
    `  const glyph: ${style} = {...GLYPHS[props.kind], background: \`hsl(\${hue} 28% 74% / 0.75)\`}`,
    '  return (',
    `    <div aria-hidden="true" ${PLACEHOLDER_ATTR}={props.kind} style={${object(PLACEHOLDER_ROOT)}}>`,
    '      <div style={glyph}>',
    `        {props.kind === 'image' ? <div style={${object(PLACEHOLDER_SPOT)}} /> : null}`,
    '      </div>',
    '    </div>',
    '  )',
    '}',
    '',
    'function hash(text: string): number {',
    '  return [...text].reduce(',
    '    (value, character) => Math.imul(value ^ (character.codePointAt(0) ?? 0), 16777619) >>> 0,',
    '    2166136261,',
    '  )',
    '}',
    '',
  ].join('\n')
}

function styleObject(input: {framework: Framework; entries: [string, string][]}): string {
  const pairs = input.entries.map(([name, value]) => `${styleKey({framework: input.framework, name})}: ${value}`)
  return `{${pairs.join(', ')}}`
}

function styleKey(input: {framework: Framework; name: string}): string {
  if (input.framework === 'solid') return `'${input.name}'`
  const [first = '', ...rest] = input.name.split('-')
  return [first, ...rest.map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)].join('')
}
