import {isAbsolute, join, relative} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {stripVTControlCharacters} from 'node:util'
import {omit} from 'es-toolkit'
import {z} from 'zod'
import {toolError, type ServerApi} from '@conciv/extension'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import type {BundlerBridge, BundlerDiagnostic} from '@conciv/protocol/bundler-types'
import {SessionId} from '@conciv/protocol/chat-types'
import type {
  Checked,
  CompileError,
  DesignRuntime,
  Differ,
  GateRow,
  Got,
  RoundReply,
  Runner,
  Status,
  TargetRecord,
} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
import {documentOf} from './document.js'
import {verdictOf} from './verdict.js'

export function createDiffer(input: {
  runtime: DesignRuntime
  runner: Runner
  page: DesignPage
  bundler: BundlerBridge | undefined
  show: readonly string[]
}): Differ {
  const {runtime, runner, page} = input
  const shown = <Reply extends {progress?: unknown; rows: GateRow[]}>(reply: Reply) => {
    const grouped = {...reply, rows: tokenGroups(reply.rows)}
    return input.show.includes('progress') ? grouped : omit(grouped, ['progress'])
  }
  const {store} = runtime
  const tab = (session: string): ServerToolPageAccess => ({
    call: (name, query) => page.ask({sessionId: SessionId.parse(session), name, input: query}),
  })
  const edits = watchEdits({bundler: input.bundler, cwd: runtime.cwd})
  const brokenOne = async (asked: {record: TargetRecord; compile: CompileError}) => {
    const {record, compile} = asked
    const [design, rounds] = await Promise.all([store.design(record.id), store.rounds(record.id)])
    const round = (rounds.at(-1)?.round ?? 0) + 1
    const written = {
      ...NOTHING_MEASURED,
      round,
      at: Date.now(),
      verdict: 'broken' as const,
      broken: compileLine(compile),
    }
    await store.writeRound({id: record.id, round: written, live: new Uint8Array(), diff: new Uint8Array()})
    const {reasons} = verdictOf({design, rounds: [...rounds, written]})
    return {round, verdict: 'broken' as const, reasons, compile}
  }
  const checkedOne = async (asked: {
    record: TargetRecord
    session: string
    nodes: string[] | undefined
    variants?: number[]
  }) => {
    const {record, nodes} = asked
    const measured = await runner({
      record,
      page: tab(asked.session),
      ...(asked.variants === undefined ? {} : {variants: asked.variants}),
    })
    if (!('round' in measured))
      return {...measured, verdict: 'unsettled' as const, reasons: [unsettledReason(measured)]}
    const {verdict, reasons} = verdictOf({design: await store.design(record.id), rounds: await store.rounds(record.id)})
    const late = measured.fontsLoading === undefined ? [] : [fontsLine(measured.fontsLoading)]
    const checked = shown({...measured, verdict, reasons: [...reasons, ...late]})
    return nodes === undefined ? checked : only({checked, nodes})
  }
  const statusOne = async (record: TargetRecord) =>
    shown(verdictOf({design: await store.design(record.id), rounds: await store.rounds(record.id)}))
  return {
    get: async ({input: query, session, page: access}) => {
      const links = linksOf(query.figma)
      if (links.length > 1) return {variants: await variantsGot({runtime, query, links, session, page: access})}
      const one = {
        ...query,
        figma: links[0],
        image: at({list: query.image, index: 0}),
        document: at({list: query.document, index: 0}),
      }
      const current = await store.current(session)
      const set = await store.variants(session)
      const known = [...(current === null ? [] : [current]), ...set].find((record) =>
        sameRef({record, query: one, cwd: runtime.cwd}),
      )
      if (known !== undefined) return stored({runtime, record: known})
      const record = await registered({runtime, query: one, session, page: access})
      return stored({runtime, record})
    },
    check: async ({nodes, session}) => {
      await edits.quiet()
      const compile = await edits.compiled()
      const records = await store.variants(session)
      const one = (record: TargetRecord, variants?: number[]) =>
        compile === null
          ? checkedOne({record, session, nodes, ...(variants === undefined ? {} : {variants})})
          : brokenOne({record, compile})
      if (records.length < 2) return one(await currentTarget({runtime, session}))
      const widths = records.map((record) => record.width)
      const variants = []
      for (const record of records)
        variants.push({
          ...(await one(record, widths)),
          target: record.id,
          width: record.width,
        })
      return {...judgedAll(variants), variants}
    },
    status: async ({session}) => {
      const records = await store.variants(session)
      if (records.length < 2) return statusOne(await currentTarget({runtime, session}))
      const variants = await Promise.all(
        records.map(async (record) => ({...(await statusOne(record)), target: record.id, width: record.width})),
      )
      return {...judgedAll(variants), variants}
    },
    dispose: edits.dispose,
  }
}

type DesignPage = ServerApi<unknown>['page']

type GetQuery = Parameters<Differ['get']>[0]['input']

type OneQuery = {figma?: string | undefined; image?: string | undefined; document?: unknown}

const BASE64_REF = 'base64'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const TOLERANCES = designConfig.tolerances

const NOTHING_MEASURED = {
  rows: [],
  reflow: {widths: [], results: []},
  coverage: {nodes: 0, mapped: 0, rendered: 0, missing: [], notRendered: [], dupes: [], revoted: 0, candidates: []},
  counts: {much: 0, noticeably: 0, slightly: 0, pins: 0, other: 0, reflow: 0, rows: 0},
  pixels: null,
  progress: null,
  tree: '',
  unsettled: null,
}

const LocSchema = z.object({line: z.number(), column: z.number()})

const ThrownSchema = z.object({
  message: z.string(),
  id: z.string().optional(),
  loc: LocSchema.optional(),
  errors: z.array(z.object({message: z.string(), loc: LocSchema.optional()})).optional(),
})

async function stored(input: {runtime: DesignRuntime; record: TargetRecord}): Promise<Got> {
  const {runtime, record} = input
  const [design, ids] = await Promise.all([runtime.store.design(record.id), runtime.store.ids(record.id)])
  return documentOf({target: record.id, design, ids})
}

function sameRef(input: {record: TargetRecord; query: OneQuery; cwd: string}): boolean {
  const {record, query} = input
  if (query.figma === undefined && query.image === undefined) return true
  const link = query.figma === undefined ? null : figmaRef(query.figma)
  if (link !== null) return link === record.ref
  return query.image !== undefined && projectRef({ref: query.image, cwd: input.cwd}) === record.ref
}

function figmaRef(link: string): string | null {
  if (!URL.canParse(link)) return null
  const url = new URL(link)
  const fileKey = url.pathname.split('/').filter(Boolean)[1]
  const nodeId = url.searchParams.get('node-id')?.replaceAll('-', ':')
  return fileKey === undefined || nodeId === undefined ? null : `${fileKey}/${nodeId}`
}

async function registered(input: {
  runtime: DesignRuntime
  query: OneQuery
  session: string
  page: ServerToolPageAccess
}): Promise<TargetRecord> {
  const {runtime, query, session, page} = input
  const {cwd, project, files} = runtime
  const requested = query.figma ?? query.image
  if (requested === undefined) throw toolError('image-unreadable', {message: 'pass figma or image'})
  const ref = projectRef({ref: requested, cwd})
  const adapter = runtime.adapters.find((candidate) => candidate.accepts(ref))
  if (adapter === undefined) throw toolError('image-unreadable', {message: `${ref.slice(0, 80)} is not readable`})
  const pictured = query.image ?? (adapter.kind === 'image' ? requested : undefined)
  const image =
    pictured === undefined ? undefined : await readPng({ref: projectRef({ref: pictured, cwd}), project, files})
  const loaded = await adapter.load({
    ref: pngBase64(ref) === null ? ref : BASE64_REF,
    scale: 1,
    project,
    files,
    attachments: {
      ...(query.document === undefined ? {} : {document: query.document}),
      ...(image === undefined ? {} : {image}),
    },
  })
  const facts = await runtime.measurer.probe(page).catch(() => null)
  const route = facts === null ? undefined : (facts.route.split('?')[0] ?? facts.route)
  return runtime.store.put({
    design: loaded.design,
    image: loaded.image,
    session,
    notes: loaded.warnings,
    ...(route === undefined ? {} : {route}),
  })
}

function projectRef(input: {ref: string; cwd: string}): string {
  if (!isAbsolute(input.ref)) return input.ref
  const inside = relative(input.cwd, input.ref)
  return inside.startsWith('..') ? input.ref : inside
}

async function readPng(input: {
  ref: string
  project: DesignRuntime['project']
  files: DesignRuntime['files']
}): Promise<Uint8Array<ArrayBuffer>> {
  const {ref, project, files} = input
  const raw: unknown = await (ref.startsWith('/') ? files.getItemRaw(ref.slice(1)) : project.getItemRaw(ref)).catch(
    () => null,
  )
  if (raw instanceof Uint8Array) return new Uint8Array(raw)
  const bytes = pngBase64(ref)
  if (bytes !== null) return bytes
  throw toolError('image-unreadable', {message: `${ref.slice(0, 80)} is neither a PNG file nor PNG base64`})
}

function pngBase64(ref: string): Uint8Array<ArrayBuffer> | null {
  const bytes = new Uint8Array(Buffer.from(ref, 'base64'))
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte) ? bytes : null
}

async function variantsGot(input: {
  runtime: DesignRuntime
  query: GetQuery
  links: string[]
  session: string
  page: ServerToolPageAccess
}): Promise<Got[]> {
  const {runtime, query, session} = input
  const records: TargetRecord[] = []
  for (const [index, link] of input.links.entries()) {
    const held = await runtime.store.list()
    const known = held.find((record) => record.session === session && record.ref === figmaRef(link))
    const one = {figma: link, image: at({list: query.image, index}), document: at({list: query.document, index})}
    records.push(known ?? (await registered({runtime, query: one, session, page: input.page})))
  }
  await runtime.store.group(records.map((record) => record.id))
  const got = await Promise.all(records.map((record) => stored({runtime, record})))
  return got.map((design) => ({
    ...design,
    rules: [...design.rules, variantRule({design, widths: records.map((record) => record.width)})],
  }))
}

function variantRule(input: {design: Got; widths: number[]}): string {
  const others = input.widths.filter((width) => width !== input.design.viewport.width).join(' and ')
  return `This frame is the page at ${input.design.viewport.width} wide; the other variants are the same page at ${others} wide. Build one page, one set of elements, that matches each frame at its width, with media or container queries between them.`
}

function linksOf(figma: GetQuery['figma']): string[] {
  if (figma === undefined) return []
  return typeof figma === 'string' ? [figma] : figma
}

function at<Value>(input: {list: Value | Value[] | undefined; index: number}): Value | undefined {
  const {list, index} = input
  if (Array.isArray(list)) return list[index]
  return index === 0 ? list : undefined
}

function judgedAll<Variant extends {verdict: Status['verdict']; reasons: string[]; width: number}>(
  variants: Variant[],
): Pick<Status, 'verdict' | 'reasons'> {
  const open = variants.filter((variant) => variant.verdict !== 'done')
  const [first] = open
  const reasons = variants.flatMap((variant) => variant.reasons.map((reason) => `at ${variant.width}: ${reason}`))
  if (first === undefined) return {verdict: 'done', reasons}
  return {verdict: (open.find((variant) => variant.verdict === 'not yet') ?? first).verdict, reasons}
}

async function currentTarget(input: {runtime: DesignRuntime; session: string}): Promise<TargetRecord> {
  const record = await input.runtime.store.current(input.session)
  if (record !== null) return record
  throw toolError('no-target', {message: 'no design is registered; call design_get with the Figma link'})
}

function only(input: {checked: Extract<Checked, {rows: unknown}>; nodes: string[]}): Extract<Checked, {rows: unknown}> {
  const wanted = new Set(input.nodes)
  return {...input.checked, rows: input.checked.rows.filter((row) => wanted.has(row.node))}
}

function unsettledReason(measured: Exclude<RoundReply, {round: number}>): string {
  if (measured.error !== undefined) return `The page shows an error, so nothing was measured: ${measured.error}`
  return `The page rendered ${measured.rendered} design nodes, too few to measure; no round was written. If the next check is unsettled too, it returns the coverage and the rows of what did render.`
}

function fontsLine(waited: number): string {
  return `fonts were still loading; measured after ${waited} ms`
}

function watchEdits(input: {bundler: BundlerBridge | undefined; cwd: string}): {
  quiet: () => Promise<void>
  compiled: () => Promise<CompileError | null>
  dispose: () => void
} {
  const {bundler, cwd} = input
  const state: {
    timer: ReturnType<typeof setTimeout> | undefined
    settled: PromiseWithResolvers<void> | null
    failed: CompileError | null
  } = {timer: undefined, settled: null, failed: null}
  const unsubscribe = bundler?.subscribe?.((diagnostic) => {
    if (diagnostic.kind === 'build-error') state.failed = compileErrorOf({diagnostic, cwd})
    if (diagnostic.kind !== 'hmr-update') return
    const settled = state.settled ?? Promise.withResolvers<void>()
    state.settled = settled
    clearTimeout(state.timer)
    state.timer = setTimeout(() => {
      state.settled = null
      settled.resolve()
    }, TOLERANCES.settleQuiet)
  })
  return {
    quiet: () =>
      Promise.race([
        state.settled?.promise ?? Promise.resolve(),
        delay(TOLERANCES.settleQuiet + TOLERANCES.settleWait, undefined, {ref: false}),
      ]),
    compiled: async () => {
      const {failed} = state
      if (failed === null || bundler === undefined) return null
      state.failed = await stillFailing({bundler, failed, cwd})
      return state.failed
    },
    dispose: () => {
      clearTimeout(state.timer)
      unsubscribe?.()
    },
  }
}

async function stillFailing(input: {
  bundler: BundlerBridge
  failed: CompileError
  cwd: string
}): Promise<CompileError | null> {
  const {bundler, failed, cwd} = input
  const modules = failed.file === null ? [] : bundler.moduleGraph(join(cwd, failed.file))
  const transformed = await Promise.all(
    modules.map((module) =>
      bundler.transform(module.url).then(
        () => null,
        (thrown: unknown) => thrownError({thrown, cwd}) ?? failed,
      ),
    ),
  )
  return transformed.find((error) => error !== null) ?? null
}

function thrownError(input: {thrown: unknown; cwd: string}): CompileError | null {
  const parsed = ThrownSchema.safeParse(input.thrown)
  if (!parsed.success) return null
  const {id, errors = []} = parsed.data
  const {message, loc} = errors[0] ?? parsed.data
  const position = loc === undefined ? null : {line: loc.line, column: loc.column + 1}
  return compileErrorOf({
    diagnostic: {kind: 'build-error', message, file: id ?? null, loc: position, timestamp: Date.now()},
    cwd: input.cwd,
  })
}

function compileErrorOf(input: {
  diagnostic: Extract<BundlerDiagnostic, {kind: 'build-error'}>
  cwd: string
}): CompileError {
  const {message, file, loc} = input.diagnostic
  const lines = stripVTControlCharacters(message)
    .split('\n')
    .map((line) => line.trim())
  return {
    message: lines.find((line) => line !== '') ?? message,
    file: file === null ? null : relative(input.cwd, file.split('?')[0] ?? file),
    line: loc?.line ?? null,
    column: loc?.column ?? null,
  }
}

function compileLine(compile: CompileError): string {
  const place = [compile.file, compile.line, compile.column].filter((part) => part !== null).join(':')
  return place === '' ? compile.message : `${place}: ${compile.message}`
}

function tokenGroups(rows: GateRow[]): GateRow[] {
  const keyOf = (row: GateRow): string | null =>
    row.magnitude === 'paint' && row.token !== undefined && row.token !== null ? `${row.token}|${row.kind}` : null
  const groups = Map.groupBy(rows, (row) => keyOf(row) ?? '')
  return rows.flatMap((row) => {
    const key = keyOf(row)
    const group = key === null ? [] : (groups.get(key) ?? [])
    if (group.length < 2) return [row]
    if (group[0] !== row) return []
    const nodes = group.map((entry) => entry.node).join(', ')
    return [{...row, text: `token ${row.token} wrong on ${group.length} nodes: [${nodes}] (${row.kind})`}]
  })
}
