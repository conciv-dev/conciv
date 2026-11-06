import {isAbsolute, relative} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {omit} from 'es-toolkit'
import {isPageVerbError, isToolError, toolError, type ServerApi} from '@conciv/extension'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {isSessionId, SessionId} from '@conciv/protocol/chat-types'
import type {DesignRuntime, DiffReport, Differ, Run, Runner, Store, TargetRecord} from '../shared/defs.js'
import {walk} from '../shared/tree.js'
import {designConfig} from '../shared/tolerances.js'

export function createDiffer(input: {
  runtime: DesignRuntime
  runner: Runner
  page: DesignPage
  bundler: BundlerBridge | undefined
}): Differ {
  const {runtime, runner, page, bundler} = input
  const {store} = runtime
  const unanswered = new Set<string>()
  const tab = (session: string): ServerToolPageAccess => ({
    call: (name, query) => page.ask({sessionId: SessionId.parse(session), name, input: query}),
  })
  const edited = new Map<string, Set<string>>()
  const trigger = createLanes({
    execute: (job) => {
      const files = [...(edited.get(job.id) ?? [])]
      if (job.observe || !edited.has(job.id)) edited.set(job.id, new Set())
      return answeredDiff({job, edited: files, runtime, runner, page: tab(job.session), unanswered})
    },
  })
  const refresh = async ({session}: {session: string}): Promise<void> => {
    const record = await store.current(session)
    if (record === null) return
    await trigger({id: record.id, session, observe: false, input: DEFAULT_DIFF})
  }
  const touch = ({file}: {file: string}): void => edited.forEach((files) => files.add(relative(runtime.cwd, file)))
  const edits = watchSettled({bundler, store, page, refresh, touch})
  return {
    register: async ({input: target, session, page: access}) => {
      const result = await registerTarget({runtime, target, session, page: access})
      const first = await trigger({id: result.id, session, observe: false, input: DEFAULT_DIFF}).catch(() => null)
      await linkTwins({store, id: result.id, session})
      return first === null ? result : {...result, stage: first.stage, brief: first.brief}
    },
    run: async ({input: query, session}) => {
      await edits.quiet()
      const record = await currentTarget({runtime, session})
      if (query.section !== undefined) await knownSection({runtime, id: record.id, section: query.section})
      return trigger({id: record.id, session, observe: true, input: query})
    },
    refresh,
    touch,
    capture: ({id, session}) => trigger({id, session, observe: false, input: DEFAULT_DIFF}),
    accept: async ({id}) => {
      const last = (await store.runs(id)).at(-1)
      if (last === undefined) throw toolError('no-target', {message: runtime.words.hint({kind: 'no-run'})})
      return store.accept({id, run: last})
    },
    status: ({session}) => targetStatus({runtime, session, unanswered}),
    watch: ({input: query, session}) => watchReport({runtime, session, query}),
    xray: async ({id}) => ({
      report: await store.report(id),
      outline: runtime.words.outline(await store.design(id)),
    }),
    dispose: edits.dispose,
  }
}

type DesignPage = ServerApi<unknown>['page']

type TargetInput = Parameters<Differ['register']>[0]['input']

type TargetResult = Awaited<ReturnType<Differ['register']>>

type DiffInput = Parameters<Differ['run']>[0]['input']

type WatchInput = Parameters<Differ['watch']>[0]['input']

type StatusReport = Awaited<ReturnType<Differ['status']>>

type WatchReport = Awaited<ReturnType<Differ['watch']>>

type Job = {id: string; session: string; observe: boolean; input: DiffInput}

const TOLERANCES = designConfig.tolerances

const DEFAULT_DIFF: DiffInput = {depth: TOLERANCES.depth, limit: TOLERANCES.limit}

const PAGE_ERROR = 'page-error'

const SETTLE_TOOL = 'page_hmr'

const SETTLE_WAIT_MS = 5000

const BASE64_REF = 'base64'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const UNANSWERED_CODES: ReadonlySet<string> = new Set(['page-hidden', 'no-live-widget'])

async function registerTarget(input: {
  runtime: DesignRuntime
  target: TargetInput
  session: string
  page: ServerToolPageAccess
}): Promise<TargetResult> {
  const {runtime, target, session, page} = input
  const {cwd, project} = runtime
  const requested = target.figma ?? target.image
  if (requested === undefined) throw toolError('image-unreadable', {message: 'pass image or figma'})
  const ref = projectRef({ref: requested, cwd})
  const adapter = runtime.adapters.find((candidate) => candidate.accepts(ref))
  if (adapter === undefined)
    throw toolError('image-unreadable', {message: runtime.words.hint({kind: 'image-unreadable'})})
  const pictured = target.image ?? (adapter.kind === 'image' ? requested : undefined)
  const image =
    pictured === undefined
      ? undefined
      : await readPng({ref: projectRef({ref: pictured, cwd}), project, files: runtime.files, words: runtime.words})
  const loaded = await adapter.load({
    ref: pngBase64(ref) === null ? ref : BASE64_REF,
    scale: target.scale ?? 1,
    project,
    files: runtime.files,
    attachments: {
      ...(target.document === undefined ? {} : {document: target.document}),
      ...(image === undefined ? {} : {image}),
    },
  })
  const facts = await runtime.measurer.probe(page).catch(() => null)
  const route = target.route ?? (facts === null ? undefined : pathnameIn(facts.route))
  const record = await runtime.store.put({
    design: loaded.design,
    image: loaded.image,
    session,
    ...(route === undefined ? {} : {route}),
    ...(target.name === undefined ? {} : {name: target.name}),
    ...(facts === null ? {} : {framework: facts.framework}),
  })
  return {
    id: record.id,
    ...(record.route === undefined ? {} : {route: record.route}),
    width: record.width,
    height: record.height,
    scale: record.scale,
    text: {
      runs: [...walk(loaded.design.root)].filter(({node}) => node.kind === 'text').length,
      ...(loaded.warnings.length === 0 ? {} : {error: loaded.warnings.join('; ')}),
    },
    next: runtime.words.guide({blind: runtime.blind}),
  }
}

function pathnameIn(route: string): string {
  return route.split('?')[0] ?? route
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
  words: DesignRuntime['words']
}): Promise<Uint8Array<ArrayBuffer>> {
  const {ref, project, files} = input
  const raw: unknown = await (ref.startsWith('/') ? files.getItemRaw(ref.slice(1)) : project.getItemRaw(ref)).catch(
    () => null,
  )
  if (raw instanceof Uint8Array) return new Uint8Array(raw)
  const bytes = pngBase64(input.ref)
  if (bytes !== null) return bytes
  throw toolError('image-unreadable', {
    message: input.words.hint({kind: 'image-unreadable', error: input.ref.slice(0, 80)}),
  })
}

function pngBase64(ref: string): Uint8Array<ArrayBuffer> | null {
  const bytes = new Uint8Array(Buffer.from(ref, 'base64'))
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte) ? bytes : null
}

async function currentTarget(input: {runtime: DesignRuntime; session: string}): Promise<TargetRecord> {
  const record = await input.runtime.store.current(input.session)
  if (record !== null) return record
  throw toolError('no-target', {message: input.runtime.words.hint({kind: 'no-target'})})
}

async function knownSection(input: {runtime: DesignRuntime; id: string; section: string}): Promise<void> {
  const sections = (await input.runtime.store.design(input.id)).root.children
  if (sections.some((section) => section.id === input.section)) return
  throw toolError('unknown-section', {
    message: input.runtime.words.hint({
      kind: 'unknown-section',
      section: input.section,
      expected: sections.map((section) => section.id).join(', '),
    }),
  })
}

function createLanes(input: {execute: (job: Job) => Promise<DiffReport>}): (job: Job) => Promise<DiffReport> {
  const lanes = new Map<string, Lane>()
  const start = (lane: Lane): void => {
    const next = lane.pending
    if (next === null || lane.running) return
    lane.pending = null
    lane.running = true
    input
      .execute(next.job)
      .then(next.resolve, next.reject)
      .finally(() => {
        lane.running = false
        start(lane)
      })
  }
  return (job) => {
    const lane = lanes.get(job.id) ?? {running: false, pending: null}
    lanes.set(job.id, lane)
    const waiting = lane.pending
    if (waiting !== null) {
      waiting.job = {...job, observe: job.observe || waiting.job.observe}
      return waiting.promise
    }
    const deferred = Promise.withResolvers<DiffReport>()
    lane.pending = {job, ...deferred}
    start(lane)
    return deferred.promise
  }
}

type Lane = {running: boolean; pending: (PromiseWithResolvers<DiffReport> & {job: Job}) | null}

type Request = {
  job: Job
  edited: string[]
  runtime: DesignRuntime
  runner: Runner
  page: ServerToolPageAccess
  unanswered: Set<string>
}

async function answeredDiff(request: Request): Promise<DiffReport> {
  const {job, unanswered} = request
  const started = Date.now()
  try {
    const report = await runDiff(request)
    unanswered.delete(job.id)
    return report
  } catch (error) {
    if (isToolError(error) && error.code === PAGE_ERROR) return pageErrorRound({...request, message: error.message})
    if (!unansweredPage(error)) throw error
    unanswered.add(job.id)
    return unansweredRound({...request, error, started})
  }
}

async function runDiff(request: Request): Promise<DiffReport> {
  const {job, runtime, runner, page} = request
  const record = await runtime.store.record(job.id)
  if (record === null) throw toolError('no-target', {message: runtime.words.hint({kind: 'no-target'})})
  const route = await otherRoute({record, page, measurer: runtime.measurer})
  if (route !== null) {
    return refused({
      record,
      route,
      xray: runtime.xrayUrl({id: record.id, session: job.session}).url,
      words: runtime.words,
    })
  }
  const {report} = await runner({
    record,
    page,
    input: job.input,
    session: job.session,
    observe: job.observe,
    edited: request.edited,
  })
  return report
}

async function otherRoute(input: {
  record: TargetRecord
  page: ServerToolPageAccess
  measurer: DesignRuntime['measurer']
}): Promise<NonNullable<DiffReport['route']> | null> {
  const target = input.record.route
  if (target === undefined) return null
  const probed = await input.measurer.probe(input.page).catch(() => null)
  if (probed === null) return null
  const live = probed.route
  const compared = target.includes('?') ? live : pathnameIn(live)
  return compared === target ? null : {live, target}
}

function unansweredPage(error: unknown): error is Error {
  return isPageVerbError(error) && UNANSWERED_CODES.has(error.code)
}

async function unansweredRound(request: Request & {error: Error; started: number}): Promise<DiffReport> {
  const previous = await previousReport(request)
  const elapsed = Date.now() - request.started
  return {
    ...previous,
    partial: true,
    stop: null,
    hint: request.runtime.words.hint({kind: 'hidden-tab', error: request.error.message}),
    timings: {...blankTimings(), measure: elapsed, total: elapsed},
  }
}

async function pageErrorRound(request: Request & {message: string}): Promise<DiffReport> {
  const {message} = request
  const previous = await previousReport(request)
  return {
    ...omit(previous, ['hint']),
    stop: null,
    changes: noChanges(),
    warnings: [{kind: 'text', warning: 'page-error', live: message, target: ''}],
    brief: [request.runtime.words.hint({kind: 'page-error', error: message})],
  }
}

async function previousReport(request: Request): Promise<DiffReport> {
  const {job, runtime} = request
  const known = await runtime.store.report(job.id)
  if (known !== null) return known
  const record = await runtime.store.record(job.id)
  if (record === null) throw toolError('no-target', {message: runtime.words.hint({kind: 'no-target'})})
  return blankReport({record, xray: runtime.xrayUrl({id: record.id, session: job.session}).url})
}

function refused(input: {
  record: TargetRecord
  route: NonNullable<DiffReport['route']>
  xray: string
  words: DesignRuntime['words']
}): DiffReport {
  const {record, route, xray} = input
  return {
    ...blankReport({record, xray}),
    route,
    hint: input.words.hint({kind: 'refused-route', route: route.live, expected: route.target}),
  }
}

function blankReport(input: {record: TargetRecord; xray: string}): DiffReport {
  const {record, xray} = input
  return {
    target: {id: record.id, ...(record.route === undefined ? {} : {route: record.route}), width: record.width},
    mismatch: 0,
    sectionSimilarity: {},
    diffImage: '',
    livePath: '',
    xray,
    components: [],
    unmatched: [],
    warnings: [],
    painted: null,
    sources: [],
    stage: null,
    brief: [],
    round: 0,
    stop: null,
    score: [],
    responsive: [],
    partial: false,
    paired: 0,
    pinsLost: [],
    timings: blankTimings(),
    rows: [],
    changes: noChanges(),
    ledger: {unbuilt: 0, paired: 0, done: 0, regressed: 0, accepted: 0},
    designPath: '',
    placeholderPath: '',
  }
}

function blankTimings(): DiffReport['timings'] {
  return {
    capture: 0,
    decode: 0,
    measure: 0,
    mask: 0,
    similarity: 0,
    regions: 0,
    pair: 0,
    typography: 0,
    deltas: 0,
    judge: 0,
    encode: 0,
    write: 0,
    total: 0,
    carried: {pairs: 0, tiles: 0},
  }
}

function noChanges(): DiffReport['changes'] {
  return {done: [], regressed: [], paired: [], lost: [], moved: []}
}

async function targetStatus(input: {
  runtime: DesignRuntime
  session: string
  unanswered: Set<string>
}): Promise<StatusReport> {
  const {runtime} = input
  const {store} = runtime
  const record = await store.current(input.session)
  if (record === null) return {targets: [], done: false}
  const [run, previous, design, rounds, accepted] = await Promise.all([
    store.latest(record.id),
    earlierRun({store, id: record.id}),
    store.design(record.id).catch(() => null),
    countedRounds({store, record}),
    record.acceptedRun === undefined ? null : store.run({id: record.id, run: record.acceptedRun}),
  ])
  return runtime.words.status({
    record,
    run,
    design,
    previous,
    accepted,
    rounds,
    unanswered: input.unanswered.has(record.id),
    blind: runtime.blind,
  })
}

async function watchReport(input: {runtime: DesignRuntime; session: string; query: WatchInput}): Promise<WatchReport> {
  const {runtime, query} = input
  const {store} = runtime
  const record = await currentTarget({runtime, session: input.session})
  const [design, run, previous] = await Promise.all([
    store.design(record.id),
    store.latest(record.id),
    earlierRun({store, id: record.id}),
  ])
  return runtime.words.watch({record, run, design, input: query, previous})
}

async function earlierRun(input: {store: Store; id: string}): Promise<Run | null> {
  const before = (await input.store.runs(input.id)).at(-2)
  return before === undefined ? null : input.store.run({id: input.id, run: before})
}

async function countedRounds(input: {store: Store; record: TargetRecord}): Promise<Run[]> {
  const {store, record} = input
  const ids = await store.runs(record.id)
  const accepted = record.acceptedRun === undefined ? -1 : ids.indexOf(record.acceptedRun)
  const loaded = await Promise.all(ids.slice(accepted + 1).map((run) => store.run({id: record.id, run})))
  return loaded.flatMap((run, index) => {
    if (run === null || run.round === 0) return []
    const before = loaded[index - 1]
    return before !== undefined && before !== null && before.round === run.round ? [] : [run]
  })
}

async function linkTwins(input: {store: Store; id: string; session: string}): Promise<void> {
  const {store, id, session} = input
  const others = (await store.list()).filter((record) => record.session === session && record.id !== id)
  const here = await store.latest(id)
  if (here === null) return
  await Promise.all(others.map((other) => linkPair({store, id, here, other: other.id})))
}

async function linkPair(input: {store: Store; id: string; here: Run; other: string}): Promise<void> {
  const {store, id, here, other} = input
  const there = await store.latest(other)
  if (there === null) return
  const placed = new Map(
    [...walk(there.root)].flatMap(({node, depth}) =>
      depth === 0 || node.live === null ? [] : [[node.live.path, node.node.id] as const],
    ),
  )
  const links = [...walk(here.root)].flatMap(({node, depth}) => {
    const twin = depth === 0 || node.live === null ? undefined : placed.get(node.live.path)
    return twin === undefined ? [] : [{node: node.node.id, twin}]
  })
  await unlink({store, id, other})
  await unlink({store, id: other, other: id})
  for (const link of links) {
    await store.decide({id, kind: 'twin', anchor: link.node, value: {target: other, node: link.twin}})
    await store.decide({id: other, kind: 'twin', anchor: link.twin, value: {target: id, node: link.node}})
  }
}

async function unlink(input: {store: Store; id: string; other: string}): Promise<void> {
  const {store, id, other} = input
  const stale = (await store.decisions(id)).filter(
    (decision) =>
      decision.kind === 'twin' &&
      typeof decision.value === 'object' &&
      decision.value !== null &&
      'target' in decision.value &&
      decision.value.target === other,
  )
  for (const decision of stale) await store.revoke({id, decision: decision.id})
}

function watchSettled(input: {
  bundler: BundlerBridge | undefined
  store: Store
  page: DesignPage
  refresh: (input: {session: string}) => Promise<unknown>
  touch: (input: {file: string}) => void
}): {dispose: () => void; quiet: () => Promise<void>} {
  const {bundler, store, page, refresh, touch} = input
  const state: {burst: Burst | null; flight: Promise<void>} = {burst: null, flight: Promise.resolve()}
  const settle = async (since: number): Promise<void> => {
    const sessions = new Set((await store.list()).map((record) => record.session).filter(isSessionId))
    await Promise.all(
      [...sessions].map(async (session) => {
        const landed = await page
          .ask({sessionId: session, name: SETTLE_TOOL, input: {timeout: SETTLE_WAIT_MS, since}})
          .then(applied, () => false)
        if (landed) await refresh({session}).catch(() => undefined)
      }),
    )
  }
  const fire = (burst: Burst): void => {
    state.burst = null
    const files = [...burst.files]
    state.flight = state.flight
      .then(() => (outsidePage({bundler, files}) ? undefined : settle(burst.since)))
      .catch(() => undefined)
      .finally(() => burst.settled.resolve())
  }
  const unsubscribe = bundler?.subscribe?.((diagnostic) => {
    if (diagnostic.kind !== 'hmr-update') return
    const burst = state.burst ?? {
      timer: undefined,
      since: diagnostic.timestamp - TOLERANCES.runDebounceMs,
      files: new Set<string>(),
      settled: Promise.withResolvers<void>(),
    }
    state.burst = burst
    burst.files.add(diagnostic.file)
    touch({file: diagnostic.file})
    clearTimeout(burst.timer)
    burst.timer = setTimeout(() => fire(burst), TOLERANCES.settleQuiet)
  })
  return {
    dispose: () => {
      clearTimeout(state.burst?.timer)
      unsubscribe?.()
    },
    quiet: () =>
      Promise.race([
        state.burst?.settled.promise ?? state.flight,
        delay(TOLERANCES.settleQuiet + SETTLE_WAIT_MS, undefined, {ref: false}),
      ]),
  }
}

type Burst = {
  timer: ReturnType<typeof setTimeout> | undefined
  since: number
  files: Set<string>
  settled: PromiseWithResolvers<void>
}

function outsidePage(input: {bundler: BundlerBridge | undefined; files: string[]}): boolean {
  const {bundler, files} = input
  if (bundler === undefined) return false
  return files.every((file) => bundler.moduleGraph(file).length === 0)
}

function applied(reply: unknown): boolean {
  return typeof reply === 'object' && reply !== null && 'applied' in reply && reply.applied === true
}
