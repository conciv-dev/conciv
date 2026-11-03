import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {isSessionId, type SessionId} from '@conciv/protocol/chat-types'
import {
  STAGES,
  type Changes,
  type ContainerLayout,
  type DiffInput,
  type DiffReport,
  type Ledger,
  type Stage,
  type Stop,
} from '../shared/defs.js'
import {keyBy, uniq} from 'es-toolkit'
import {deltaSentence, kindStage, kindTolerance, TOLERANCES, traced} from '../shared/tolerances.js'
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
  SourceLoc,
  TargetNode,
  TargetStore,
  TextNode,
  Touched,
  Unmatched,
} from '../shared/types.js'
import {placement, type Seat, type Tree} from './layout.js'
import type {LedgerChanges} from './ledger.js'
import {glyphRun} from './pair.js'
import {union} from './raster.js'

export type Round = {
  score: number[]
  capturePath: CapturePath | undefined
  values: Map<string, number | string>
  capture: string
  report: DiffReport
}

type Verdict = Pick<DiffReport, 'stage' | 'brief' | 'round' | 'budgetLeft' | 'stop' | 'score' | 'rows'>

export type RunJob = {id: string; session: SessionId; observe: boolean; input: DiffInput}

export function createRuns(input: {execute: (input: {job: RunJob; touched: Touched}) => Promise<DiffReport>}): {
  trigger: (job: RunJob) => Promise<DiffReport>
  touch: (input: {file: string}) => void
} {
  const lanes = new Map<string, Lane>()
  const start = (lane: Lane): void => {
    const next = lane.pending
    if (next === null || lane.running) return
    lane.pending = null
    lane.running = true
    const touched: Touched = lane.touched.size === 0 ? 'all' : new Set(lane.touched)
    lane.touched.clear()
    input
      .execute({job: next.job, touched})
      .then(next.resolve, next.reject)
      .finally(() => {
        lane.running = false
        start(lane)
      })
  }
  return {
    touch: ({file}) => lanes.forEach((lane) => lane.touched.add(file)),
    trigger: (job) => {
      const lane = lanes.get(job.id) ?? {running: false, pending: null, touched: new Set<string>()}
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
  tree: Tree
}): Item[] {
  const {color, tree} = input
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
      sentence: `${componentLabel({tag: pair.live.tag, source: pair.live.source})}: ${pairSentence({delta, pair})}`,
      ...located({node: pair.node.id, source: pair.live.source}),
    })),
  )
  const unbuilt = keyBy(
    input.unmatched.filter((entry) => entry.kind === 'unbuilt' && entry.node !== undefined),
    (entry) => entry.node ?? '',
  )
  const runs = [tree.root.layout?.runs ?? [], ...tree.nodes.map((node) => node.layout?.runs ?? [])]
    .flat()
    .filter((run) => run.children.every((id) => unbuilt[id]?.stage === 'structure'))
  const complete = tree.nodes.filter((node) => node.id in unbuilt && allUnbuilt({tree, id: node.id, unbuilt}))
  const covered = new Set([
    ...runs.flatMap((run) => run.children),
    ...complete.flatMap((node) => descendantsIn({tree, id: node.id}).map((child) => child.id)),
  ])
  const entries = input.unmatched
    .filter((entry) => entry.kind !== 'unbuilt' || entry.node === undefined || !covered.has(entry.node))
    .map((entry): Item => ({
      key: `${entry.kind}:${entry.node ?? boxKey(entry.target ?? entry.live)}`,
      kind: entry.kind,
      stage: entry.stage ?? null,
      size: entrySize(entry),
      confidence: 1,
      box: entry.target ?? entry.live ?? {x: 0, y: 0, w: 0, h: 0},
      depth: 0,
      value: entry.shift === undefined ? boxKey(entry.target ?? entry.live) : `${entry.shift.dx},${entry.shift.dy}`,
      sentence: entrySentence({entry, tree, unbuilt}),
      ...located({node: entry.node, source: entry.source}),
    }))
  return [...deltas, ...entries, ...runs.map((run) => runItem({run, tree, unbuilt}))]
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
  painted: DiffReport['painted']
  color: ColorMetric
  partial: boolean
  changed: {line: string | null; regressed: Set<string>}
  crop: (node: string) => string
}): Verdict {
  const {items, score, capturePath, priors, round, ranker, warnings, color, changed, crop} = input
  const counted = items.filter((item) => item.stage !== null)
  const demoted = new Set(counted.filter((item) => unchangedLately({item, priors, color})).map((item) => item.key))
  const chosen = counted.filter((item) => !demoted.has(item.key))
  const stage = firstStage(chosen) ?? firstStage(counted)
  const ranked = ranker({items: counted.filter((item) => item.stage === stage)})
  const kept = [...ranked.filter((item) => !demoted.has(item.key)), ...ranked.filter((item) => demoted.has(item.key))]
  const regressed = (item: Item): boolean => item.node !== undefined && changed.regressed.has(item.node)
  const ordered = [...kept.filter(regressed), ...kept.filter((item) => !regressed(item))]
  const stop = input.partial ? null : stopReason({counted, score, capturePath, priors, round, stage})
  const flipped = flippedBack({counted, priors, color})
  const brief = [
    ...(stop === 'stalled' ? [stalledLine(ranker({items: counted.filter((item) => demoted.has(item.key))}))] : []),
    ...(changed.line === null ? [] : [changed.line]),
    ...(input.painted === null ? [] : [paintedLine(input.painted.count)]),
    ...(flipped === null ? [] : [flippedLine({items: ranker({items: flipped.items}), round: flipped.round})]),
    ...ordered.slice(0, TOLERANCES.briefSize).map((item) => item.sentence),
    ...warnings.map(warningSentence),
  ]
  return {
    stage,
    brief,
    round,
    budgetLeft: Math.max(0, TOLERANCES.roundBudget - round),
    stop,
    score,
    rows: ordered
      .slice(0, ROW_LIMIT)
      .flatMap((item) => (item.stage === null ? [] : [row({item, stage: item.stage, crop})])),
  }
}

export function changeReport(input: {
  changes: LedgerChanges
  ledger: Ledger
  tree: Tree
  crop: (node: string) => string
}): Changes {
  const {changes, ledger, tree, crop} = input
  const entry = (change: {node: string; says: (subject: string) => string}): Changes['done'][number] => {
    const found = tree.nodes.find((candidate) => candidate.id === change.node)
    const subject = found === undefined ? 'the node' : changeSubject({node: found, tree})
    return {node: change.node, sentence: change.says(subject), crop: crop(change.node)}
  }
  const worse =
    (node: string) =>
    (subject: string): string => {
      const known = ledger.nodes[node]
      const item = known?.pair?.run === ledger.run ? known.item : null
      return item === null || item === undefined ? `${subject} lost its element` : item.sentence
    }
  return {
    done: changes.done.map((node) => entry({node, says: (subject) => `${subject} matches the design`})),
    regressed: changes.regressed.map((node) => entry({node, says: worse(node)})),
    paired: changes.paired.map((node) => entry({node, says: (subject) => `${subject} is built`})),
    lost: changes.lost.map((node) => entry({node, says: (subject) => `${subject} lost its element`})),
    moved: changes.moved.map(({node, shift}) =>
      entry({node, says: (subject) => `${subject} moved by ${shift.dx},${shift.dy} px`}),
    ),
  }
}

export function changeLine(input: {changes: Changes; round: number}): string {
  const {changes, round} = input
  const [first] = changes.regressed
  const parts = [
    changes.done.length === 0 ? null : `${changes.done.length} done`,
    first === undefined ? null : `${changes.regressed.length} regressed (${clipped(first.sentence)})`,
    changes.paired.length === 0 ? null : `${changes.paired.length} paired`,
    changes.lost.length === 0 ? null : `${changes.lost.length} lost`,
    changes.moved.length === 0 ? null : `${changes.moved.length} moved`,
  ].filter((part) => part !== null)
  return `since round ${round}: ${parts.length === 0 ? 'no node changed' : parts.join(', ')}`
}

export function roundRecord(input: {
  items: Item[]
  score: number[]
  capturePath: CapturePath | undefined
  capture: string
  report: DiffReport
}): Round {
  return {
    score: input.score,
    capturePath: input.capturePath,
    values: new Map(input.items.filter((item) => item.stage !== null).map((item) => [item.key, item.value])),
    capture: input.capture,
    report: input.report,
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
  touch: (input: {file: string}) => void
}): () => void {
  const {bundler, store, page, refresh, touch} = input
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
    touch({file: diagnostic.file})
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

type Lane = {running: boolean; pending: (Deferred & {job: RunJob}) | null; touched: Set<string>}

const SETTLE_TOOL = 'page_hmr'
const SETTLE_WAIT_MS = 5000
const SIZE_CAP = 10
const ROW_LIMIT = 10
const STALLED_NAMED = 3
const ANCHOR_LENGTH = 40
const FLIPPED_NAMED = 3
const REVERSALS_TO_STOP = 2
const STAGE_TOLERANCES: Record<Stage, number> = {
  structure: 1,
  content: 1,
  geometry: TOLERANCES.geometryPx,
  paint: TOLERANCES.colorDeltaE,
}
const SCORE_PRECISION = 10_000
const COLOR_KINDS: ItemKind[] = ['background', 'foreground', 'border']
const LISTED = 6
const ORDINAL_SUFFIXES: Partial<Record<number, string>> = {1: 'st', 2: 'nd', 3: 'rd'}
const NOUNS = {
  text: ['text', 'texts'],
  image: ['image', 'images'],
  box: ['box', 'boxes'],
  card: ['card', 'cards'],
} as const

function applied(reply: unknown): boolean {
  return typeof reply === 'object' && reply !== null && 'applied' in reply && reply.applied === true
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

type Unbuilt = Record<string, Unmatched>
type Run = ContainerLayout['runs'][number]

function pairSentence(input: {delta: Delta; pair: Pair}): string {
  const {delta, pair} = input
  if (delta.kind !== 'sizing') return deltaSentence(delta)
  const width = Math.round(pair.liveBox.w)
  const declared = traced(delta) && delta.declaration !== undefined ? `, declared as \`${delta.declaration}\`` : ''
  const where = delta.file === undefined ? '' : ` at ${delta.file}${delta.line === undefined ? '' : `:${delta.line}`}`
  const rule = delta.target === 'fill' ? 'fill the row (flex: 1)' : 'fit its content'
  return `let the ${pair.live.tag} ${rule}; it is sized ${width} px${declared}${where}`
}

function entrySentence(input: {entry: Unmatched; tree: Tree; unbuilt: Unbuilt}): string {
  const {entry, tree, unbuilt} = input
  switch (entry.kind) {
    case 'unbuilt':
      return unbuiltSentence({entry, tree, unbuilt})
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

function unbuiltSentence(input: {entry: Unmatched; tree: Tree; unbuilt: Unbuilt}): string {
  const {entry, tree, unbuilt} = input
  const node = tree.nodes.find((candidate) => candidate.id === entry.node)
  if (node === undefined) return `build the ${entry.label ?? 'element'} the design shows`
  const children = childrenIn({tree, id: node.id})
  if (children.length === 0) return leafSentence({node, tree})
  const layout = node.layout
  const props = properties({layout, children})
  if (allUnbuilt({tree, id: node.id, unbuilt}) && loneText(children) === null) {
    const listed = children.slice(0, LISTED).map((child) => childPhrase({node: child, tree}))
    const more = children.length > LISTED ? [`and ${children.length - LISTED} more`] : []
    const tail = props.length === 0 ? '' : `; ${props.join(', ')}`
    return `build ${containerName({node, tree, withCount: false})}${placePhrase({node, tree})}: ${[...listed, ...more].join(', ')}${tail}`
  }
  const tail = props.length === 0 ? '' : `: ${props.join(', ')}`
  return `build ${containerName({node, tree, withCount: true})}${placePhrase({node, tree})}${tail}`
}

function leafSentence(input: {node: TargetNode; tree: Tree}): string {
  const {node, tree} = input
  const seat = placement({node, tree})
  const size = node.layout === undefined ? '' : ` (${node.layout.size})`
  const subject = named({node, tree}) ? label({node, tree}) : article(node)
  if (seat === null) return `build ${subject}${size}`
  if (seat.index > TOLERANCES.ordinalLimit) {
    return `build ${subject}${size}${anchorPhrase({box: node.box, tree, word: 'near'})}`
  }
  const where =
    seat.parent !== null && named({node: seat.parent, tree})
      ? ` inside ${label({node: seat.parent, tree})}`
      : anchorPhrase({box: node.box, tree, word: 'under'})
  return `build ${subject}${size} as the ${ordinal(seat.index)} item in the ${seat.direction}${where}`
}

function runItem(input: {run: Run; tree: Tree; unbuilt: Unbuilt}): Item {
  const {run, tree, unbuilt} = input
  const members = run.children.flatMap((id) => tree.nodes.filter((node) => node.id === id))
  const entries = run.children.flatMap((id) => {
    const entry = unbuilt[id]
    return entry === undefined ? [] : [entry]
  })
  const boxes = entries.flatMap((entry) => (entry.target === undefined ? [] : [entry.target]))
  const box = boxes.length === 0 ? {x: 0, y: 0, w: 0, h: 0} : union(boxes)
  const [first] = members
  return {
    key: `unbuilt:${run.children.join('+')}`,
    kind: 'unbuilt',
    stage: 'structure',
    size: entries.reduce((total, entry) => total + entrySize(entry), 0),
    confidence: 1,
    box,
    depth: 0,
    value: boxKey(box),
    sentence: runSentence({run, members, tree}),
    ...located({node: first?.id, source: undefined}),
  }
}

function runSentence(input: {run: Run; members: TargetNode[]; tree: Tree}): string {
  const {run, members, tree} = input
  const [first] = members
  const box = members.length === 0 ? undefined : union(members.map((member) => member.box))
  const where = first === undefined ? '' : placePhrase({node: first, tree, box})
  const props = properties({layout: {gap: run.gap, align: run.align}, children: members})
  const holds = members.slice(0, TOLERANCES.ordinalLimit).flatMap((member, position) => {
    const texts = textsIn({tree, node: member}).slice(0, LISTED)
    return texts.length === 0 ? [] : [`${ordinal(position + 1)}: ${texts.map(quoted).join(', ')}`]
  })
  const contents = holds.length === 0 ? '' : `; ${holds.join('; ')}`
  return `build a row of ${countPhrase({nodes: members, tree})}${where}: ${props.join(', ')}${contents}`
}

function properties(input: {layout: Partial<ContainerLayout> | undefined; children: TargetNode[]}): string[] {
  const {layout, children} = input
  if (layout === undefined) return []
  return [
    ...equalWidth(children),
    ...gapPhrase({gap: layout.gap, children}),
    ...(layout.align === undefined ? [] : [`align ${layout.align}`]),
    ...(layout.wrap === true ? ['wrapping'] : []),
    ...paddingPhrase(layout.padding),
  ]
}

function equalWidth(children: TargetNode[]): string[] {
  const filled = children.length > 1 && children.every((child) => child.layout?.size === 'fill')
  return filled ? ['equal width'] : []
}

function gapPhrase(input: {gap: ContainerLayout['gap'] | undefined; children: TargetNode[]}): string[] {
  const {gap, children} = input
  if (gap === undefined || children.length < 2) return []
  return [gap.uniform ? `gap ${gap.px}` : `gaps around ${gap.px}`]
}

function paddingPhrase(padding: ContainerLayout['padding'] | undefined): string[] {
  if (padding === undefined) return []
  const sides = shorthand(padding)
  return sides.every((side) => side === 0) ? [] : [`padding ${sides.join(' ')}`]
}

function shorthand(padding: ContainerLayout['padding']): number[] {
  const {top, right, bottom, left} = padding
  if (top !== bottom || right !== left) return [top, right, bottom, left]
  return top === right ? [top] : [top, right]
}

function containerName(input: {node: TargetNode; tree: Tree; withCount: boolean}): string {
  const {node, tree} = input
  const children = childrenIn({tree, id: node.id})
  const direction = node.layout?.direction ?? 'stack'
  const only = loneText(children)
  if (only !== null) return `a box with ${quoted(only.text)}`
  if (!input.withCount) return `a ${direction}`
  return `a ${direction} of ${countPhrase({nodes: children, tree})}`
}

function childPhrase(input: {node: TargetNode; tree: Tree}): string {
  const {node, tree} = input
  const size = node.layout === undefined ? '' : ` (${node.layout.size})`
  if (node.kind === 'text') return `${quoted(node.text)}${size}`
  if (node.kind === 'image') return `an image${size}`
  const children = childrenIn({tree, id: node.id})
  if (children.length === 0) return `a box${size}`
  const name = containerName({node, tree, withCount: true})
  const gap = node.layout?.gap
  if (children.length === 1 || gap === undefined) return `${name}${size}`
  return `${name} (gap ${gap.px})`
}

function placePhrase(input: {node: TargetNode; tree: Tree; box?: Box | undefined}): string {
  const {node, tree} = input
  const seat = placement({node, tree})
  if (seat === null) return ''
  const previous = previousSibling({node, tree, seat})
  if (previous !== undefined && named({node: previous, tree})) {
    return ` ${followWord({tree, seat})} ${label({node: previous, tree})}`
  }
  if (previous === undefined && seat.parent === null) return ' at the top of the page'
  if (previous === undefined && seat.parent !== null && named({node: seat.parent, tree})) {
    return ` inside ${label({node: seat.parent, tree})}`
  }
  return anchorPhrase({box: input.box ?? node.box, tree, word: 'under'})
}

function anchorPhrase(input: {box: Box; tree: Tree; word: 'under' | 'near'}): string {
  const {box, tree, word} = input
  const [nearest] = tree.nodes
    .flatMap((node) => (node.kind === 'text' && above({text: node, box}) ? [node] : []))
    .toSorted((a, b) => box.y - a.box.y - (box.y - b.box.y))
  if (nearest === undefined) return ' at the top of the page'
  return ` ${word} ${quoted(clipped(nearest.text))}`
}

function above(input: {text: TextNode; box: Box}): boolean {
  const {text, box} = input
  const overlaps = text.box.x < box.x + box.w && text.box.x + text.box.w > box.x
  return overlaps && text.box.y < box.y && !glyphRun(text) && text.text.trim() !== ''
}

function clipped(text: string): string {
  const trimmed = text.trim()
  return trimmed.length <= ANCHOR_LENGTH ? trimmed : `${trimmed.slice(0, ANCHOR_LENGTH).trimEnd()}…`
}

function named(input: {node: TargetNode; tree: Tree}): boolean {
  const {node, tree} = input
  if (node.kind === 'text') return true
  if (node.kind === 'image') return false
  return textsIn({tree, node}).length > 0
}

function article(node: TargetNode): string {
  return node.kind === 'image' ? 'an image' : 'a box'
}

function previousSibling(input: {node: TargetNode; tree: Tree; seat: Seat}): TargetNode | undefined {
  const {node, tree, seat} = input
  const index = node.layout?.index ?? 0
  return childrenIn({tree, id: seat.parent?.id}).find((sibling) => sibling.layout?.index === index - 1)
}

function followWord(input: {tree: Tree; seat: Seat}): string {
  const {tree, seat} = input
  const direction = (seat.parent === null ? tree.root.layout : seat.parent.layout)?.direction
  return direction === 'row' || direction === 'grid' ? 'after' : 'under'
}

function label(input: {node: TargetNode; tree: Tree}): string {
  const {node, tree} = input
  if (node.kind === 'text') return `the text ${quoted(node.text)}`
  if (node.kind === 'image') return 'the image'
  const [text] = textsIn({tree, node})
  return text === undefined ? 'the box' : `the box with ${quoted(text)}`
}

function countPhrase(input: {nodes: TargetNode[]; tree: Tree}): string {
  const {nodes, tree} = input
  const nouns = uniq(nodes.map((node) => noun({node, tree})))
  const [only] = nouns
  if (nouns.length !== 1 || only === undefined) return `${nodes.length} items`
  return nodes.length === 1 ? `1 ${only[0]}` : `${nodes.length} ${only[1]}`
}

function noun(input: {node: TargetNode; tree: Tree}): readonly [string, string] {
  const {node, tree} = input
  if (node.kind === 'text') return NOUNS.text
  if (node.kind === 'image') return NOUNS.image
  const children = childrenIn({tree, id: node.id})
  return children.length === 0 || loneText(children) !== null ? NOUNS.box : NOUNS.card
}

function loneText(children: TargetNode[]): TextNode | null {
  const [only] = children
  return children.length === 1 && only?.kind === 'text' ? only : null
}

function textsIn(input: {tree: Tree; node: TargetNode}): string[] {
  return descendantsIn({tree: input.tree, id: input.node.id}).flatMap((node) =>
    node.kind === 'text' ? [node.text] : [],
  )
}

function quoted(text: string): string {
  return `"${text}"`
}

function ordinal(index: number): string {
  const teen = index % 100 >= 11 && index % 100 <= 13
  const suffix = teen ? 'th' : (ORDINAL_SUFFIXES[index % 10] ?? 'th')
  return `${index}${suffix}`
}

function childrenIn(input: {tree: Tree; id: string | undefined}): TargetNode[] {
  return input.tree.nodes
    .filter((node) => node.within === input.id)
    .toSorted((a, b) => (a.layout?.index ?? 0) - (b.layout?.index ?? 0))
}

function descendantsIn(input: {tree: Tree; id: string}): TargetNode[] {
  return childrenIn(input).flatMap((node) => [node, ...descendantsIn({tree: input.tree, id: node.id})])
}

function allUnbuilt(input: {tree: Tree; id: string; unbuilt: Unbuilt}): boolean {
  const children = childrenIn({tree: input.tree, id: input.id})
  return children.length > 0 && children.every((child) => child.id in input.unbuilt)
}

function paintedLine(count: number): string {
  return `painted: ${count} elements are absolutely positioned; lay the page out with flow, flex or grid and let the browser place them`
}

function stalledLine(unchanged: Item[]): string {
  const head = `stalled: ${unchanged.length} items unchanged for ${TOLERANCES.stallRounds} rounds`
  if (unchanged.length === 0) return head
  return `${head}: ${unchanged
    .slice(0, STALLED_NAMED)
    .map((item) => item.sentence)
    .join('; ')}`
}

function row(input: {item: Item; stage: Stage; crop: (node: string) => string}): DiffReport['rows'][number] {
  const {item, stage} = input
  return {
    sentence: item.sentence,
    stage,
    ...located({node: item.node, source: item.source}),
    ...(item.node === undefined ? {} : {crop: input.crop(item.node)}),
  }
}

function changeSubject(input: {node: TargetNode; tree: Tree}): string {
  const {node, tree} = input
  if (named({node, tree})) return label({node, tree})
  return `${article(node)}${anchorPhrase({box: node.box, tree, word: 'under'})}`
}

function located(input: {
  node: string | undefined
  source: SourceLoc | null | undefined
}): Pick<Item, 'node' | 'source'> {
  const {node, source} = input
  return {...(node === undefined ? {} : {node}), ...(source === null || source === undefined ? {} : {source})}
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
  stage: Stage | null
}): Stop | null {
  const {counted, score, capturePath, priors, round, stage} = input
  if (counted.length === 0) {
    return (score.at(-1) ?? 0) < TOLERANCES.residualAreaGate ? 'done' : 'residual-only'
  }
  if (stage !== null && oscillating({score, priors, stage})) return 'oscillating'
  if (stalled({score, capturePath, priors})) return 'stalled'
  if (round >= TOLERANCES.roundBudget) return 'budget'
  return null
}

function oscillating(input: {score: number[]; priors: Round[]; stage: Stage}): boolean {
  const {score, priors, stage} = input
  const at = 1 + STAGES.indexOf(stage)
  const totals = [...priors.map((round) => round.score[at] ?? 0), score[at] ?? 0]
  const tolerance = STAGE_TOLERANCES[stage]
  const chain = totals.reduce<{lowest: number; reversals: number}>(
    (state, total, index) => {
      if (total <= state.lowest) return {lowest: total, reversals: 0}
      const reversed = reversal({first: totals[index - 2], second: totals[index - 1], now: total, tolerance})
      return {lowest: state.lowest, reversals: reversed ? state.reversals + 1 : 0}
    },
    {lowest: Number.POSITIVE_INFINITY, reversals: 0},
  )
  return chain.reversals >= REVERSALS_TO_STOP
}

function reversal(input: {
  first: number | undefined
  second: number | undefined
  now: number
  tolerance: number
}): boolean {
  const {first, second, now, tolerance} = input
  if (first === undefined || second === undefined) return false
  const previousMove = second - first
  const move = now - second
  return previousMove !== 0 && Math.abs(move) > tolerance && Math.sign(move) !== Math.sign(previousMove)
}

function flippedBack(input: {counted: Item[]; priors: Round[]; color: ColorMetric}): {
  items: Item[]
  round: number
} | null {
  const {counted, priors, color} = input
  const previous = priors.at(-1)
  const earlier = priors.at(-2)
  if (previous === undefined || earlier === undefined) return null
  const items = counted.filter((item) => {
    const last = previous.values.get(item.key)
    const older = earlier.values.get(item.key)
    if (last === undefined || older === undefined) return false
    return !same({a: item.value, b: last, color}) && same({a: item.value, b: older, color})
  })
  return items.length === 0 ? null : {items, round: earlier.report.round}
}

function flippedLine(input: {items: Item[]; round: number}): string {
  const {items, round} = input
  const head =
    items.length === 1
      ? `1 item moved back to its round-${round} value`
      : `${items.length} items moved back to their round-${round} values`
  return `${head}: ${items
    .slice(0, FLIPPED_NAMED)
    .map((item) => item.sentence)
    .join('; ')}`
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
