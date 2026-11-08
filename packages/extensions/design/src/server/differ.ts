import {isAbsolute, relative} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {omit} from 'es-toolkit'
import {toolError, type ServerApi} from '@conciv/extension'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {SessionId} from '@conciv/protocol/chat-types'
import type {Checked, DesignRuntime, Differ, GateRow, Got, RoundReply, Runner, TargetRecord} from '../shared/defs.js'
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
  const edits = watchEdits(input.bundler)
  return {
    get: async ({input: query, session, page: access}) => {
      const known = await store.current(session)
      if (known !== null && sameRef({record: known, query, cwd: runtime.cwd})) return stored({runtime, record: known})
      const record = await registered({runtime, query, session, page: access})
      return stored({runtime, record})
    },
    check: async ({nodes, session}) => {
      await edits.quiet()
      const record = await currentTarget({runtime, session})
      const measured = await runner({record, page: tab(session)})
      if (!('round' in measured)) return {...measured, verdict: 'unsettled', reasons: [unsettledReason(measured)]}
      const {verdict, reasons} = verdictOf({
        design: await store.design(record.id),
        rounds: await store.rounds(record.id),
      })
      const checked = shown({...measured, verdict, reasons})
      return nodes === undefined ? checked : only({checked, nodes})
    },
    status: async ({session}) => {
      const record = await currentTarget({runtime, session})
      return shown(verdictOf({design: await store.design(record.id), rounds: await store.rounds(record.id)}))
    },
    dispose: edits.dispose,
  }
}

type DesignPage = ServerApi<unknown>['page']

type GetQuery = Parameters<Differ['get']>[0]['input']

const BASE64_REF = 'base64'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const TOLERANCES = designConfig.tolerances

const SETTLE_WAIT_MS = 5000

async function stored(input: {runtime: DesignRuntime; record: TargetRecord}): Promise<Got> {
  const {runtime, record} = input
  const [design, ids] = await Promise.all([runtime.store.design(record.id), runtime.store.ids({id: record.id})])
  return documentOf({target: record.id, design, ids})
}

function sameRef(input: {record: TargetRecord; query: GetQuery; cwd: string}): boolean {
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
  query: GetQuery
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

async function currentTarget(input: {runtime: DesignRuntime; session: string}): Promise<TargetRecord> {
  const record = await input.runtime.store.current(input.session)
  if (record !== null) return record
  throw toolError('no-target', {message: 'no design is registered; call design_get with the Figma link'})
}

function only(input: {checked: Extract<Checked, {round: number}>; nodes: string[]}): Checked {
  const wanted = new Set(input.nodes)
  return {...input.checked, rows: input.checked.rows.filter((row) => wanted.has(row.node))}
}

function unsettledReason(measured: Exclude<RoundReply, {round: number}>): string {
  if (measured.error !== undefined) return `The page shows an error, so nothing was measured: ${measured.error}`
  return `The page rendered ${measured.rendered} design nodes, too few to measure; no round was written. If the next check is unsettled too, it returns the coverage and the rows of what did render.`
}

function watchEdits(bundler: BundlerBridge | undefined): {quiet: () => Promise<void>; dispose: () => void} {
  const state: {timer: ReturnType<typeof setTimeout> | undefined; settled: PromiseWithResolvers<void> | null} = {
    timer: undefined,
    settled: null,
  }
  const unsubscribe = bundler?.subscribe?.((diagnostic) => {
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
        delay(TOLERANCES.settleQuiet + SETTLE_WAIT_MS, undefined, {ref: false}),
      ]),
    dispose: () => {
      clearTimeout(state.timer)
      unsubscribe?.()
    },
  }
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
