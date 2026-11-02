import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {isSessionId, type SessionId} from '@conciv/protocol/chat-types'
import {STAGES, type DeltaKindName, type DiffInput, type DiffReport, type Stage, type Stop} from '../shared/defs.js'
import {deltaSentence, kindStage, TOLERANCES} from '../shared/tolerances.js'
import type {
  Box,
  CapturePath,
  ColorMetric,
  Delta,
  DesignPage,
  Item,
  ItemKind,
  Pair,
  Ranker,
  TargetStore,
  Unmatched,
} from '../shared/types.js'

type Round = {score: number[]; capturePath: CapturePath | undefined; values: Map<string, number | string>}

type Verdict = Pick<DiffReport, 'stage' | 'brief' | 'round' | 'budgetLeft' | 'stop' | 'score'>

export type RunJob = {id: string; session: SessionId; observe: boolean; input: DiffInput}

export function createRuns(input: {execute: (job: RunJob) => Promise<DiffReport>}): {
  trigger: (job: RunJob) => Promise<DiffReport>
} {
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
  return {
    trigger: (job) => {
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
    },
  }
}

export function createHistory(): {
  reset: (id: string) => void
  rounds: (id: string) => Round[]
  append: (input: {id: string; round: Round}) => void
} {
  const all = new Map<string, Round[]>()
  return {
    reset: (id) => all.set(id, []),
    rounds: (id) => all.get(id) ?? [],
    append: ({id, round}) => all.set(id, [...(all.get(id) ?? []), round]),
  }
}

export function itemsFrom(input: {
  components: {pair: Pair; deltas: Delta[]}[]
  unmatched: Unmatched[]
  color: ColorMetric
}): Item[] {
  const {color} = input
  const deltas = input.components.flatMap(({pair, deltas: found}) =>
    found.map((delta): Item => ({
      key: `${pair.node.id}:${delta.kind}${delta.side === undefined ? '' : `:${delta.side}`}`,
      kind: delta.kind,
      stage: kindStage(delta.kind),
      size: deltaSize({delta, color}),
      confidence: delta.confidence ?? 1,
      box: pair.liveBox,
      depth: pair.depth,
      value: delta.live,
      sentence: `${componentLabel({tag: pair.live.tag, source: pair.live.source})}: ${deltaSentence(delta)}`,
    })),
  )
  const entries = input.unmatched.map((entry, index): Item => ({
    key: `${entry.kind}:${boxKey(entry.target ?? entry.live)}:${index}`,
    kind: entry.kind,
    stage: entry.stage ?? null,
    size: entrySize(entry),
    confidence: 1,
    box: entry.target ?? entry.live ?? {x: 0, y: 0, w: 0, h: 0},
    depth: 0,
    value: entry.shift === undefined ? boxKey(entry.target ?? entry.live) : `${entry.shift.dx},${entry.shift.dy}`,
    sentence: entrySentence(entry),
  }))
  return [...deltas, ...entries]
}

export function scoreTuple(input: {items: Item[]; unpairedShare: number; residualShare: number}): number[] {
  const counted = input.items.filter((item) => item.stage !== null)
  const sums = STAGES.map((stage) =>
    rounded(counted.filter((item) => item.stage === stage).reduce((sum, item) => sum + item.size, 0)),
  )
  return [rounded(input.unpairedShare), ...sums, rounded(input.residualShare)]
}

export function judge(input: {
  items: Item[]
  score: number[]
  capturePath: CapturePath | undefined
  priors: Round[]
  round: number
  ranker: Ranker
  warnings: Delta[]
  color: ColorMetric
}): Verdict {
  const {items, score, capturePath, priors, round, ranker, warnings, color} = input
  const counted = items.filter((item) => item.stage !== null)
  const demoted = new Set(counted.filter((item) => unchangedLately({item, priors, color})).map((item) => item.key))
  const chosen = counted.filter((item) => !demoted.has(item.key))
  const stage = firstStage(chosen) ?? firstStage(counted)
  const ranked = ranker({items: counted.filter((item) => item.stage === stage)})
  const ordered = [
    ...ranked.filter((item) => !demoted.has(item.key)),
    ...ranked.filter((item) => demoted.has(item.key)),
  ]
  const brief = [
    ...ordered.slice(0, TOLERANCES.briefSize).map((item) => item.sentence),
    ...warnings.map(warningSentence),
  ]
  return {
    stage,
    brief,
    round,
    budgetLeft: Math.max(0, TOLERANCES.roundBudget - round),
    stop: stopReason({counted, score, capturePath, priors, round, color}),
    score,
  }
}

export function roundRecord(input: {items: Item[]; score: number[]; capturePath: CapturePath | undefined}): Round {
  return {
    score: input.score,
    capturePath: input.capturePath,
    values: new Map(input.items.filter((item) => item.stage !== null).map((item) => [item.key, item.value])),
  }
}

export function lexicallyWorse(input: {a: number[]; b: number[]}): boolean {
  const {a, b} = input
  const index = a.findIndex((value, at) => value !== (b[at] ?? value))
  if (index < 0) return false
  return (a[index] ?? 0) > (b[index] ?? 0)
}

export function deltaSize(input: {delta: Delta; color: ColorMetric}): number {
  const {delta, color} = input
  const {live, target} = delta
  if (COLOR_KINDS.includes(delta.kind) && typeof live === 'string' && typeof target === 'string') {
    return capped(color.distance({a: live, b: target}) / TOLERANCES.colorDeltaE)
  }
  if (typeof live !== 'number' || typeof target !== 'number') return SIZE_CAP
  return capped(Math.abs(live - target) / kindTolerance(delta.kind))
}

export function watchSettled(input: {
  bundler: BundlerBridge | undefined
  store: TargetStore
  page: DesignPage
  refresh: (input: {session: SessionId}) => Promise<unknown>
}): () => void {
  const {bundler, store, page, refresh} = input
  const state: {timer: ReturnType<typeof setTimeout> | null; since: number} = {timer: null, since: 0}
  const settle = async (since: number): Promise<void> => {
    const sessions = new Set((await store.list({})).map((record) => record.session).filter(isSessionId))
    await Promise.all(
      [...sessions].map(async (session) => {
        const landed = await page
          .ask({sessionId: session, name: SETTLE_TOOL, input: {timeout: SETTLE_WAIT_MS, since}})
          .then(applied, () => false)
        if (landed) await refresh({session}).catch(() => undefined)
      }),
    )
  }
  const unsubscribe = bundler?.subscribe?.((diagnostic) => {
    if (diagnostic.kind !== 'hmr-update') return
    if (state.timer === null) state.since = diagnostic.timestamp - TOLERANCES.runDebounceMs
    if (state.timer !== null) clearTimeout(state.timer)
    state.timer = setTimeout(() => {
      state.timer = null
      void settle(state.since)
    }, TOLERANCES.runDebounceMs)
  })
  return () => {
    if (state.timer !== null) clearTimeout(state.timer)
    unsubscribe?.()
  }
}

type Deferred = {promise: Promise<DiffReport>; resolve: (report: DiffReport) => void; reject: (error: unknown) => void}

type Lane = {running: boolean; pending: (Deferred & {job: RunJob}) | null}

const SETTLE_TOOL = 'page_hmr'
const SETTLE_WAIT_MS = 5000
const SIZE_CAP = 10
const SCORE_PRECISION = 10_000
const FONT_TOLERANCE = 0.5
const WEIGHT_STEP = 100
const COLOR_KINDS: ItemKind[] = ['background', 'foreground', 'border']

function applied(reply: unknown): boolean {
  return typeof reply === 'object' && reply !== null && 'applied' in reply && reply.applied === true
}

function kindTolerance(kind: DeltaKindName): number {
  switch (kind) {
    case 'fontSize':
    case 'lineHeight':
      return FONT_TOLERANCE
    case 'fontWeight':
      return WEIGHT_STEP
    case 'columns':
      return 1
    default:
      return TOLERANCES.geometryPx
  }
}

function capped(value: number): number {
  return Math.min(SIZE_CAP, value)
}

function rounded(value: number): number {
  return Math.round(value * SCORE_PRECISION) / SCORE_PRECISION
}

function boxKey(box: Box | undefined): string {
  if (box === undefined) return ''
  return `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.w)},${Math.round(box.h)}`
}

function entrySize(entry: Unmatched): number {
  if (entry.shift !== undefined) {
    return capped(Math.max(Math.abs(entry.shift.dx), Math.abs(entry.shift.dy)) / TOLERANCES.geometryPx)
  }
  const box = entry.target ?? entry.live
  if (box === undefined) return 0
  return capped((box.w * box.h) / (TOLERANCES.unmatchedMinimum * TOLERANCES.unmatchedMinimum))
}

function componentLabel(input: {tag: string; source: {file: string; line: number} | null | undefined}): string {
  const {tag, source} = input
  if (source === null || source === undefined) return tag
  return `${tag} (${source.file}:${source.line})`
}

function place(box: Box | undefined): string {
  if (box === undefined) return ''
  return ` at ${Math.round(box.x)},${Math.round(box.y)} (${Math.round(box.w)}×${Math.round(box.h)})`
}

function entrySentence(entry: Unmatched): string {
  switch (entry.kind) {
    case 'unbuilt':
      return `build the ${entry.label ?? 'element'} the design shows${place(entry.target)}`
    case 'extra':
      return `${componentLabel({tag: 'the element', source: entry.source})} renders${place(entry.live)} where the design shows nothing; remove it or match the design`
    case 'offset': {
      const shift = entry.shift ?? {dx: 0, dy: 0}
      const what =
        entry.source === undefined ? 'the page content' : componentLabel({tag: 'the element', source: entry.source})
      return `move ${what} by ${shift.dx},${shift.dy} px to where the design places it`
    }
  }
}

function warningSentence(delta: Delta): string {
  const where = delta.file === undefined ? '' : ` at ${delta.file}${delta.line === undefined ? '' : `:${delta.line}`}`
  return `replace the hard-coded sample "${delta.live}"${where} with the expression that renders it`
}

function firstStage(items: Item[]): Stage | null {
  return STAGES.find((stage) => items.some((item) => item.stage === stage)) ?? null
}

function same(input: {a: number | string | undefined; b: number | string | undefined; color: ColorMetric}): boolean {
  const {a, b, color} = input
  if (a === undefined || b === undefined) return false
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= TOLERANCES.geometryPx
  if (typeof a === 'string' && typeof b === 'string' && a.startsWith('#') && b.startsWith('#')) {
    return color.distance({a, b}) <= TOLERANCES.colorDeltaE
  }
  return a === b
}

function unchangedLately(input: {item: Item; priors: Round[]; color: ColorMetric}): boolean {
  const {item, priors, color} = input
  const recent = priors.slice(-TOLERANCES.stallRounds)
  if (recent.length < TOLERANCES.stallRounds) return false
  return recent.every((round) => same({a: round.values.get(item.key), b: item.value, color}))
}

function stopReason(input: {
  counted: Item[]
  score: number[]
  capturePath: CapturePath | undefined
  priors: Round[]
  round: number
  color: ColorMetric
}): Stop | null {
  const {counted, score, capturePath, priors, round, color} = input
  if (counted.length === 0) {
    return (score.at(-1) ?? 0) < TOLERANCES.residualAreaGate ? 'done' : 'residual-only'
  }
  if (oscillating({counted, priors, color})) return 'oscillating'
  if (stalled({score, capturePath, priors})) return 'stalled'
  if (round >= TOLERANCES.roundBudget) return 'budget'
  return null
}

function oscillating(input: {counted: Item[]; priors: Round[]; color: ColorMetric}): boolean {
  const {counted, priors, color} = input
  const previous = priors.at(-1)
  const earlier = priors.at(-2)
  if (previous === undefined || earlier === undefined) return false
  return counted.some((item) => {
    const last = previous.values.get(item.key)
    const before = earlier.values.get(item.key)
    if (last === undefined || before === undefined) return false
    return !same({a: item.value, b: last, color}) && same({a: item.value, b: before, color})
  })
}

function stalled(input: {score: number[]; capturePath: CapturePath | undefined; priors: Round[]}): boolean {
  const path = input.priors.filter((round) => round.capturePath === input.capturePath)
  const chain = [...path.slice(-TOLERANCES.stallRounds).map((round) => round.score), input.score]
  if (chain.length <= TOLERANCES.stallRounds) return false
  return chain.slice(1).every((score, index) => !lexicallyLess({a: score, b: chain[index] ?? score}))
}

function lexicallyLess(input: {a: number[]; b: number[]}): boolean {
  return lexicallyWorse({a: input.b, b: input.a})
}
