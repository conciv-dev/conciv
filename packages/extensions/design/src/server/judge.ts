import {countBy, keyBy, mapValues, maxBy, omit, pick, uniq, uniqBy} from 'es-toolkit'
import {
  NO_CHANGES,
  STAGES,
  STOPS,
  type Box,
  type CapturePath,
  type Changes,
  type ColorMetric,
  type ComponentReport,
  type ContainerLayout,
  type Delta,
  type Deltas,
  type DesignNode,
  type DesignSection,
  type DesignTree,
  type DiffInput,
  type DiffReport,
  type Element,
  type Item,
  type Judge,
  type Judging,
  type LedgerCounts,
  type LiveComponent,
  type Match,
  type MatchNode,
  type Measured,
  type NodeStatus,
  type Offset,
  type Placement,
  type Ranker,
  type Round,
  type SectionBudget,
  type Shift,
  type SourceLoc,
  type Stage,
  type Unmatched,
  type Verdict,
  type Words,
} from '../shared/defs.js'
import {glyphRun, iconSized, kindStage, isOpaqueHex, TOLERANCES} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'
import {encloses, union} from '../shared/box.js'
import {boxMask} from './raster.js'

export function createJudge(input: {ranker: Ranker; words: Words; deltas: Deltas; color: ColorMetric}): Judge {
  const {ranker, words, deltas, color} = input
  return {
    unmatched: ({tree, root, components, offsets, measured}) => {
      const paired = [...walk({root})].flatMap(({node, depth}) => (depth === 0 || node.live === null ? [] : [node]))
      return [
        ...unbuiltEntries({tree, pairedNodes: new Set(paired.map((match) => match.node.id))}),
        ...extraEntries({
          components,
          paired: new Set(paired.flatMap((match) => (match.live === null ? [] : [match.live.path]))),
          cards: paired.map((match) => match.node.box),
        }),
        ...offsetEntries({offsets, measured}),
      ]
    },
    items: (request) => itemsFrom({...request, words, size: deltas.size}),
    score: ({items, unmatched, measured, masks, page}) =>
      scoreTuple({
        items,
        unpairedShare: unpairedShare({unmatched, page}),
        residualShare: residualShare({measured, unmatched, masks, page}),
      }),
    verdict: (request) => judge({...request, ranker, words, color}),
    report: (request) => reportedComponents({...request, size: deltas.size}),
    hint: reportHint,
    painted: paintedPage,
    budgets: sectionBudgets,
    round: roundRecord,
    worse: lexicallyWorse,
    section: (request) => sectionReport({...request, ranker, words, color}),
    settle: (request) => settled({...request, words}),
    counts: ledgerCounts,
  }
}

function settled(input: Parameters<Judge['settle']>[0] & {words: Words}): ReturnType<Judge['settle']> {
  const {previous, root, accepted, run, items, tree, crop, words} = input
  const before = new Map(
    previous === null
      ? []
      : [...walk({root: previous})].flatMap(({node, depth}) => (depth === 0 ? [] : [[node.node.id, node] as const])),
  )
  const restated = restate({match: root, depth: 0, before, accepted, run, items})
  if (previous === null) return {root: restated, changes: NO_CHANGES}
  const listed = [...walk({root: restated})].flatMap(({node, depth}) =>
    depth === 0 || node.status === 'accepted' ? [] : [{now: node, was: before.get(node.node.id) ?? null}],
  )
  const newly = (status: NodeStatus): Match[] =>
    listed.filter(({now, was}) => now.status === status && (was?.status ?? 'unbuilt') !== status).map(({now}) => now)
  const entry = (change: {match: Match; says: (subject: string) => string}): Changes['done'][number] => {
    const node = tree.byId.get(change.match.node.id)
    const subject = node === undefined ? 'the node' : words.subject({node, tree})
    return {node: change.match.node.id, sentence: change.says(subject), crop: crop(change.match.node.id)}
  }
  const worse =
    (match: Match) =>
    (subject: string): string =>
      worstItem({items, node: match.node.id})?.sentence ?? `${subject} lost its element`
  const sighted = listed.flatMap(({now, was}) =>
    now.live === null || was === null || was.live === null
      ? []
      : [{match: now, shift: shifted({now: now.live.box, was: was.live.box})}],
  )
  return {
    root: restated,
    changes: {
      done: newly('done').map((match) => entry({match, says: (subject) => `${subject} matches the design`})),
      regressed: newly('regressed').map((match) => entry({match, says: worse(match)})),
      paired: listed
        .filter(
          ({now, was}) =>
            (was?.status ?? 'unbuilt') === 'unbuilt' && (now.status === 'paired' || now.status === 'done'),
        )
        .map(({now}) => entry({match: now, says: (subject) => `${subject} is built`})),
      lost: listed
        .filter(({now, was}) => now.live === null && was !== null && was.live !== null)
        .map(({now}) => entry({match: now, says: (subject) => `${subject} lost its element`})),
      moved: sighted.flatMap(({match, shift}) =>
        shift === null ? [] : [entry({match, says: (subject) => `${subject} moved by ${shift.dx},${shift.dy} px`})],
      ),
    },
  }
}

function restate(input: {
  match: Match
  depth: number
  before: Map<string, Match>
  accepted: Set<string>
  run: string
  items: Item[]
}): Match {
  const {match, depth, before, accepted, run, items} = input
  const children = match.children.map((child) => restate({...input, match: child, depth: depth + 1}))
  if (depth === 0) return {...match, children}
  const previous = before.get(match.node.id) ?? null
  const observed: NodeStatus =
    match.live === null ? 'unbuilt' : worstItem({items, node: match.node.id}) === null ? 'done' : 'paired'
  const status = nextStatus({previous, now: {...match, status: observed}, accepted: accepted.has(match.node.id)})
  const since = previous !== null && previous.status === status ? previous.since : run
  return {...match, status, since, children}
}

function nextStatus(input: {previous: Match | null; now: Match; accepted: boolean}): NodeStatus {
  const {previous, now} = input
  const was = previous?.status ?? 'unbuilt'
  if (input.accepted) return 'accepted'
  if (now.status === 'done') return 'done'
  if (was === 'unbuilt') return now.status
  if (was === 'paired' && now.status === 'paired') return 'paired'
  return 'regressed'
}

function worstItem(input: {items: Item[]; node: string}): Item | null {
  return (
    maxBy(
      input.items.filter((item) => item.node === input.node && item.stage !== null),
      (item) => item.size,
    ) ?? null
  )
}

function shifted(input: {now: Box; was: Box}): Shift | null {
  const {now, was} = input
  const edges = [now.x - was.x, now.y - was.y, now.w - was.w, now.h - was.h]
  if (!edges.some((edge) => Math.abs(edge) > TOLERANCES.tileMargin)) return null
  return {dx: Math.round(now.x - was.x), dy: Math.round(now.y - was.y)}
}

function ledgerCounts(input: {root: Match | null; nodes?: string[]}): LedgerCounts {
  const {root} = input
  const kept = input.nodes === undefined ? null : new Set(input.nodes)
  const counted = countBy(
    root === null
      ? []
      : [...walk({root})].flatMap(({node, depth}) =>
          depth === 0 || (kept !== null && !kept.has(node.node.id)) ? [] : [node.status],
        ),
    (status) => status,
  )
  return {
    unbuilt: counted.unbuilt ?? 0,
    paired: counted.paired ?? 0,
    done: counted.done ?? 0,
    regressed: counted.regressed ?? 0,
    accepted: counted.accepted ?? 0,
  }
}

function itemsFrom(input: {
  components: {element: Element; deltas: Delta[]}[]
  unmatched: Unmatched[]
  words: Words
  size: (delta: Delta) => number
  tree: DesignTree
}): Item[] {
  const {words, size, tree} = input
  const deltas = input.components.flatMap(({element, deltas: found}) =>
    found.map((delta): Item => ({
      key: `${element.node.id}:${delta.kind}${delta.side === undefined ? '' : `:${delta.side}`}`,
      kind: delta.kind,
      stage: kindStage(delta.kind),
      size: size(delta),
      confidence: delta.confidence ?? 1,
      box: element.liveBox,
      depth: element.depth,
      value: delta.live,
      sentence: words.delta({element, delta}),
      ...located({node: element.node.id, source: element.live.source}),
    })),
  )
  const slots = new Set(tree.nodes.filter(iconSlot).map((node) => node.id))
  const unmatched = input.unmatched.filter(
    (entry) => entry.kind !== 'unbuilt' || entry.node === undefined || !slots.has(entry.node),
  )
  const unbuilt = keyBy(
    input.unmatched.filter((entry) => entry.kind === 'unbuilt' && entry.node !== undefined),
    (entry) => entry.node ?? '',
  )
  const runs = [tree.root.layout?.runs ?? [], ...tree.nodes.map((node) => node.layout?.runs ?? [])]
    .flat()
    .filter((run) => run.children.every((id) => unbuilt[id]?.stage === 'structure'))
  const complete = tree.nodes.filter(
    (node) =>
      node.id in unbuilt &&
      allUnbuilt({tree, id: node.id, unbuilt}) &&
      tree.children(node.id).some((child) => !slots.has(child.id)),
  )
  const covered = new Set([
    ...runs.flatMap((run) => run.children),
    ...complete.flatMap((node) => tree.descendants(node.id).map((child) => child.id)),
  ])
  const entries = unmatched
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
      sentence: words.entry({entry, tree, unbuilt}),
      ...located({node: entry.node, source: entry.source}),
    }))
  return [...deltas, ...entries, ...runs.map((run) => runItem({run, tree, unbuilt, words}))]
}

function scoreTuple(input: {items: Item[]; unpairedShare: number; residualShare: number}): number[] {
  const counted = input.items.filter((item) => item.stage !== null)
  const sums = STAGES.map((stage) =>
    rounded(counted.filter((item) => item.stage === stage).reduce((sum, item) => sum + item.size, 0)),
  )
  return [rounded(input.unpairedShare), ...sums, rounded(input.residualShare)]
}

function judge(input: {
  items: Item[]
  score: number[]
  capturePath: CapturePath | undefined
  capture: string
  priors: Round[]
  round: number
  ranker: Ranker
  words: Words
  warnings: Delta[]
  painted: DiffReport['painted']
  color: ColorMetric
  partial: boolean
  changed: {changes: Changes; since: number | null}
  crop: (node: string) => string
  similarity: {now: number; was: number} | null
}): Verdict {
  const {items, score, capturePath, capture, priors, round, ranker, words, warnings, color, changed, crop} = input
  const counted = items.filter((item) => item.stage !== null)
  const demoted = new Set(counted.filter((item) => unchangedLately({item, priors, color})).map((item) => item.key))
  const chosen = counted.filter((item) => !demoted.has(item.key))
  const stage = firstStage(chosen) ?? firstStage(counted)
  const ranked = ranker({items: counted.filter((item) => item.stage === stage)})
  const kept = [...ranked.filter((item) => !demoted.has(item.key)), ...ranked.filter((item) => demoted.has(item.key))]
  const dirtied = new Set(changed.changes.regressed.map((change) => change.node))
  const regressed = (item: Item): boolean => item.node !== undefined && dirtied.has(item.node)
  const ordered = [...kept.filter(regressed), ...kept.filter((item) => !regressed(item))]
  const following = nextItems({counted, stage, ranker})
  const stop = input.partial ? null : stopReason({counted, score, capturePath, capture, priors, stage})
  const flipped = flippedBack({counted, priors, color})
  const brief = [
    ...(stop === 'stalled' && stage !== null
      ? [words.stalled({stage, score, unchanged: ranker({items: counted.filter((item) => demoted.has(item.key))})})]
      : []),
    ...(changed.since === null
      ? []
      : [words.change({changes: changed.changes, round: changed.since, similarity: input.similarity})]),
    ...(input.painted === null ? [] : [words.painted(input.painted.count)]),
    ...(flipped === null ? [] : [words.flipped({items: ranker({items: flipped.items}), round: flipped.round})]),
    ...warnings.map(words.warning),
    ...ordered.slice(0, TOLERANCES.briefSize).map((item) => item.sentence),
    ...following.map((item) => `${item.stage} next: ${item.sentence}`),
  ]
  return {
    stage,
    brief,
    round,
    stop,
    score,
    rows: [...ordered.slice(0, ROW_LIMIT), ...following].flatMap((item) =>
      item.stage === null ? [] : [row({item, stage: item.stage, crop})],
    ),
  }
}

function sectionBudgets(input: {sections: DesignSection[]; items: Item[]; rounds: Round[]}): SectionBudget[] {
  return input.sections.map((section) => {
    const nodes = new Set(section.nodes)
    const roundsUsed = input.rounds.filter(
      (round) => round.section === section.id && touchesSection({changes: round.report.changes, nodes}),
    ).length
    const open = input.items.some((item) => item.stage !== null && heldBy({item, section, nodes}))
    return {id: section.id, roundsUsed, open, spent: open && roundsUsed >= TOLERANCES.roundBudget}
  })
}

function heldBy(input: {
  item: {node?: string | undefined; box?: Box | undefined}
  section: DesignSection
  nodes: Set<string>
}): boolean {
  const {item, section, nodes} = input
  if (item.node !== undefined) return nodes.has(item.node)
  return item.box !== undefined && encloses({inner: item.box, outer: section.box})
}

function touchesSection(input: {changes: Changes; nodes: Set<string>}): boolean {
  const {done, regressed, paired, lost, moved} = input.changes
  return [...done, ...regressed, ...paired, ...lost, ...moved].some((change) => input.nodes.has(change.node))
}

function nextItems(input: {counted: Item[]; stage: Stage | null; ranker: Ranker}): Item[] {
  const {counted, stage, ranker} = input
  if (stage === null) return []
  const later = STAGES.slice(STAGES.indexOf(stage) + 1)
  const next = later.find((candidate) => counted.some((item) => item.stage === candidate))
  if (next === undefined) return []
  return ranker({items: counted.filter((item) => item.stage === next)}).slice(0, TOLERANCES.briefNext)
}

function roundRecord(input: {
  items: Item[]
  score: number[]
  capturePath: CapturePath | undefined
  capture: string
  report: DiffReport
  section: string | undefined
}): Round {
  return {
    score: input.score,
    capturePath: input.capturePath,
    values: new Map(input.items.filter((item) => item.stage !== null).map((item) => [item.key, item.value])),
    capture: input.capture,
    report: input.report,
    section: input.section,
  }
}

function lexicallyWorse(input: {a: number[]; b: number[]}): boolean {
  const {a, b} = input
  const index = a.findIndex((value, at) => value !== (b[at] ?? value))
  if (index < 0) return false
  return (a[index] ?? 0) > (b[index] ?? 0)
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
  capture: string
  priors: Round[]
  stage: Stage | null
}): Stop | null {
  const {counted, score, capturePath, capture, priors, stage} = input
  if (counted.length === 0) {
    return (score.at(-1) ?? 0) < TOLERANCES.residualAreaGate ? 'done' : 'residual-only'
  }
  if (stage !== null && oscillating({score, priors, stage})) return 'oscillating'
  if (stage !== null && stalled({score, capturePath, capture, priors, stage})) return 'stalled'
  return null
}

function oscillating(input: {score: number[]; priors: Round[]; stage: Stage}): boolean {
  const {score, priors, stage} = input
  const at = stageColumn(stage)
  const totals = [...priors.map((round) => round.score[at] ?? 0), score[at] ?? 0]
  const tolerance = STAGE_TOLERANCES[stage]
  const chain = totals.reduce<{lowest: number; reversals: number}>(
    (state, total, index) => {
      if (total < state.lowest - tolerance) return {lowest: total, reversals: 0}
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

function stalled(input: {
  score: number[]
  capturePath: CapturePath | undefined
  capture: string
  priors: Round[]
  stage: Stage
}): boolean {
  const {score, capturePath, capture, priors, stage} = input
  const at = stageColumn(stage)
  const tolerance = STAGE_TOLERANCES[stage]
  const path = priors.filter((round) => round.capturePath === capturePath)
  const chain = [
    ...path
      .slice(-TOLERANCES.stallRounds)
      .map((round) => ({score: round.score, capture: round.capture, stage: round.report.stage})),
    {score, capture, stage},
  ]
  if (chain.length <= TOLERANCES.stallRounds) return false
  return chain.slice(1).every((entry, index) => {
    const before = chain[index]
    if (before === undefined || entry.stage !== stage || before.stage !== stage) return false
    if (entry.capture === before.capture) return false
    return Math.abs((entry.score[at] ?? 0) - (before.score[at] ?? 0)) < tolerance
  })
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

function located(input: {
  node: string | undefined
  source: SourceLoc | null | undefined
}): Pick<Item, 'node' | 'source'> {
  const {node, source} = input
  return {...(node === undefined ? {} : {node}), ...(source === null || source === undefined ? {} : {source})}
}

function iconSlot(node: MatchNode): boolean {
  return node.kind === 'image' && iconSized(node.box)
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

function allUnbuilt(input: {tree: DesignTree; id: string; unbuilt: Unbuilt}): boolean {
  const children = input.tree.children(input.id)
  return children.length > 0 && children.every((child) => child.id in input.unbuilt)
}

function runItem(input: {run: LayoutRun; tree: DesignTree; unbuilt: Unbuilt; words: Words}): Item {
  const {run, tree, unbuilt, words} = input
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
    sentence: words.row({run, members, tree}),
    ...located({node: first?.id, source: undefined}),
  }
}

function rounded(value: number): number {
  return Math.round(value * SCORE_PRECISION) / SCORE_PRECISION
}

function capped(value: number): number {
  return Math.min(SIZE_CAP, value)
}

const SIZE_CAP = 10

const ROW_LIMIT = 10

const REVERSALS_TO_STOP = 2

const STAGE_TOLERANCES: Record<Stage, number> = {
  structure: 1,
  content: 1,
  geometry: TOLERANCES.geometryPx,
  paint: TOLERANCES.colorDeltaE,
}

const SCORE_PRECISION = 10_000

function unbuiltEntries(input: {tree: DesignTree; pairedNodes: Set<string>}): Unmatched[] {
  const {tree, pairedNodes} = input
  return tree.nodes
    .filter((node) => !pairedNodes.has(node.id))
    .map((node): Unmatched => {
      const structural = node.kind !== 'image' && !glyphRun(node) && parentPaired({node, tree, pairedNodes})
      const layout = entryLayout({node, tree})
      return {
        kind: 'unbuilt',
        target: node.box,
        label: node.kind === 'text' ? `text "${node.text}"` : node.kind,
        stage: structural ? 'structure' : null,
        node: node.id,
        ...(layout === null ? {} : {layout}),
      }
    })
}

function entryLayout(input: {node: DesignNode; tree: DesignTree}): Unmatched['layout'] | null {
  const {node, tree} = input
  const own = node.layout
  if (own?.size === undefined) return null
  const {direction, size} = own
  if (direction !== undefined) return {direction, size, ...pick(own, CONTAINER_FIELDS)}
  const seat = tree.placement(node)
  return seat === null ? null : {direction: seat.direction, index: seat.index, size}
}

function paintedPage(components: LiveComponent[]): DiffReport['painted'] {
  const total = flattened(components).length
  const outermost = outermostPositioned({components, parentPositioned: false})
  const share = total === 0 ? 0 : outermost.length / total
  if (outermost.length <= TOLERANCES.paintedCount && share <= TOLERANCES.paintedShare) return null
  return {
    count: outermost.length,
    total,
    sources: uniqBy(
      outermost.flatMap((component) => (component.source === null ? [] : [component.source])),
      (source) => `${source.file}:${source.line}:${source.column}`,
    ),
  }
}

function outermostPositioned(input: {components: LiveComponent[]; parentPositioned: boolean}): LiveComponent[] {
  return input.components.flatMap((component) => {
    const {position} = component.styles
    const own = DETACHED_POSITIONS.includes(position) && !input.parentPositioned ? [component] : []
    return [
      ...own,
      ...outermostPositioned({components: component.children, parentPositioned: position !== STATIC_POSITION}),
    ]
  })
}

function extraEntries(input: {components: LiveComponent[]; paired: Set<string>; cards: Box[]}): Unmatched[] {
  const {paired, cards} = input
  const pairedPaths = [...paired]
  return input.components.flatMap((component): Unmatched[] => {
    const holds = paired.has(component.path) || pairedPaths.some((path) => path.startsWith(`${component.path}/`))
    if (!holds && iconSized(component.box) && cards.some((card) => encloses({inner: component.box, outer: card}))) {
      return []
    }
    if (!holds && paints(component) && large(component.box)) {
      return [
        {
          kind: 'extra',
          live: component.box,
          stage: null,
          ...(component.source === null ? {} : {source: component.source}),
        },
      ]
    }
    return extraEntries({components: component.children, paired, cards})
  })
}

function paints(component: LiveComponent): boolean {
  return component.glyphs.length > 0 || isOpaqueHex(component.styles.background) || component.styles.border.width > 0
}

function large(box: Box): boolean {
  return box.w >= TOLERANCES.unmatchedMinimum && box.h >= TOLERANCES.unmatchedMinimum
}

function offsetEntries(input: {offsets: Offset[]; measured: Measured[]}): Unmatched[] {
  const placed = new Set(
    input.measured
      .filter((entry) => entry.deltas.some((delta) => GEOMETRY_KINDS.includes(delta.kind)))
      .map((entry) => entry.element),
  )
  const owners = new Map(
    input.measured.flatMap(({element}) =>
      [element.node.id, ...element.texts.map((text) => text.id)].map((id) => [id, element] as const),
    ),
  )
  return input.offsets.flatMap(({match, shift}): Unmatched[] => {
    const rounded2 = {dx: Math.round(shift.dx), dy: Math.round(shift.dy)}
    if (match === null) return [{kind: 'offset', stage: 'geometry', shift: rounded2}]
    const element = owners.get(match.node.id)
    if (element === undefined || placed.has(element)) return []
    return [
      {
        kind: 'offset',
        live: element.liveBox,
        target: element.targetBox,
        stage: 'geometry',
        shift: rounded2,
        node: element.node.id,
        ...(element.live.source === null ? {} : {source: element.live.source}),
      },
    ]
  })
}

function reportedComponents(input: {
  measured: Measured[]
  input: DiffInput
  size: (delta: Delta) => number
  placements: Placement[]
}): {reported: Reported[]; listed: number} {
  const {measured, size, placements} = input
  const above = measured.filter((entry) => entry.deltas.length > 0 || entry.element.mismatch >= TOLERANCES.tileGate)
  const impact = (entry: Measured): number =>
    Math.max(0, ...entry.deltas.map((delta) => (delta.confidence ?? 1) * size(delta)))
  const ranked = above
    .map((entry): Reported & {impact: number} => ({
      element: entry.element,
      impact: impact(entry),
      report: {
        source: entry.element.live.source,
        tag: entry.element.live.tag,
        selector: entry.element.selector,
        live: entry.element.liveBox,
        target: entry.element.targetBox,
        mismatch: mismatchRounded(entry.element.mismatch),
        deltas: entry.deltas,
        children: above.filter((child) => child.element.parent === entry.element).length,
        nodes: uniq([entry.element.node.id, ...entry.element.texts.map((node) => node.id)]),
        path: entry.element.live.path,
        ...twinDisagreement({element: entry.element, placements}),
      },
    }))
    .filter(
      ({report, element}) => report.deltas.length > 0 || (report.children === 0 && element.depth <= input.input.depth),
    )
    .toSorted(
      (a, b) =>
        Number(b.report.deltas.length > 0) - Number(a.report.deltas.length > 0) ||
        b.impact - a.impact ||
        a.element.liveBox.y - b.element.liveBox.y ||
        a.element.depth - b.element.depth,
    )
  return {
    reported: ranked
      .slice(0, input.input.full === true ? ranked.length : input.input.limit)
      .map(({element, report}) => ({element, report})),
    listed: ranked.length,
  }
}

function twinDisagreement(input: {
  element: Element
  placements: Placement[]
}): Pick<ComponentReport, 'twinDisagreement'> {
  const {element} = input
  const other = input.placements.find((entry) => entry.node === element.node.id && entry.path !== element.live.path)
  if (other === undefined) return {}
  return {twinDisagreement: {target: other.target, path: other.path}}
}

function unpairedShare(input: {unmatched: Unmatched[]; page: Box}): number {
  const area = input.unmatched
    .filter((entry) => entry.kind === 'unbuilt' && entry.stage === 'structure')
    .reduce((sum, entry) => sum + (entry.target === undefined ? 0 : entry.target.w * entry.target.h), 0)
  const total = input.page.w * input.page.h
  return total === 0 ? 0 : Math.min(1, area / total)
}

function residualShare(input: {measured: Measured[]; unmatched: Unmatched[]; masks: Box[]; page: Box}): number {
  const {measured, unmatched, masks, page} = input
  const tiles = measured
    .filter((entry) => entry.deltas.length === 0 && entry.element.mismatch >= TOLERANCES.tileGate)
    .map((entry) => entry.element.liveBox)
  const total = page.w * page.h
  if (tiles.length === 0 || total === 0) return 0
  const explained = [
    ...measured.filter((entry) => entry.deltas.length > 0).map((entry) => entry.element.liveBox),
    ...unmatched.flatMap((entry) => [entry.target, entry.live].filter((box) => box !== undefined)),
    ...masks,
  ]
  const residual = boxMask({boxes: tiles, area: page})
  const covered = boxMask({boxes: explained, area: page})
  const count = residual.reduce((sum, value, index) => sum + (value === 1 && covered[index] !== 1 ? 1 : 0), 0)
  return count / total
}

function sectionReport(input: {
  report: DiffReport
  section: DesignSection
  judging: Judging | undefined
  measured: Measured[]
  rounds: Round[]
  counts: LedgerCounts
  ranker: Ranker
  words: Words
  color: ColorMetric
}): DiffReport {
  const {report, section, judging, ranker, words, color} = input
  const nodes = new Set(section.nodes)
  const inside = (box: Box | undefined): boolean => box !== undefined && encloses({inner: box, outer: section.box})
  const held = (item: {node?: string | undefined; box?: Box | undefined}): boolean => heldBy({item, section, nodes})
  const unmatched = report.unmatched.filter((entry) => held({node: entry.node, box: entry.target ?? entry.live}))
  const changes = mapValues(report.changes, (list) => list.filter((change) => nodes.has(change.node)))
  const scoped: DiffReport = {
    ...omit(report, ['similarity']),
    components: report.components.filter(
      (component) => (component.nodes ?? []).some((node) => nodes.has(node)) || inside(component.live),
    ),
    unmatched,
    warnings: report.warnings.filter((warning) => inside(warning.box)),
    changes,
    ledger: input.counts,
    section: {id: section.id, line: section.line},
    scope: 'section',
    page: {
      stop: report.stop,
      stage: report.stage,
      score: report.score,
      ...(report.similarity === undefined ? {} : {similarity: report.similarity}),
    },
    ...withSimilarity(report.sectionSimilarity[section.id]),
  }
  if (judging === undefined) return scoped
  const items = judging.items.filter(held)
  const measured = input.measured.filter((entry) => nodes.has(entry.element.node.id))
  const verdict = judge({
    ...judging,
    ranker,
    words,
    color,
    items,
    score: scoreTuple({
      items,
      unpairedShare: unpairedShare({unmatched, page: section.box}),
      residualShare: residualShare({measured, unmatched, masks: [], page: section.box}),
    }),
    warnings: judging.warnings.filter((warning) => inside(warning.box)),
    changed: {...judging.changed, changes},
    priors: [],
    round: report.round,
    similarity: null,
  })
  const unbuilt = measured.length === 0
  const open = unbuilt || judging.partial || items.some((item) => item.stage !== null)
  const brief = unbuilt ? [UNBUILT_SECTION_BRIEF, ...verdict.brief] : verdict.brief
  const [budget] = sectionBudgets({sections: [section], items, rounds: input.rounds})
  return {
    ...scoped,
    ...verdict,
    brief,
    stop: sectionStop({open, spent: budget?.spent ?? false}),
    paired: measured.length,
  }
}

function sectionStop(input: {open: boolean; spent: boolean}): Stop | null {
  if (!input.open) return 'done'
  return input.spent ? 'budget' : null
}

function reportHint(input: {
  attributed: boolean
  absolute: boolean
  partial: boolean
  cut: {listed: number; shown: number; paired: number}
}): {hint?: string} {
  const {cut} = input
  const hints = [
    input.partial ? PARTIAL_HINT : null,
    cut.listed <= cut.shown
      ? null
      : `showing ${cut.shown} of ${cut.paired} paired components, those with deltas first; full: true lists up to limit of each and truncated says how many more`,
    input.attributed ? null : HINT,
    input.absolute ? null : ORIGIN_HINT,
  ].filter((hint) => hint !== null)
  return hints.length === 0 ? {} : {hint: hints.join('; ')}
}

function flattened(components: LiveComponent[]): LiveComponent[] {
  return components.flatMap((component) => [component, ...flattened(component.children)])
}

const GEOMETRY_KINDS: Delta['kind'][] = [
  'inset-left',
  'inset-right',
  'inset-top',
  'inset-bottom',
  'gap-before',
  'gap-after',
  'padding',
  'align',
]

const CONTAINER_FIELDS = ['gap', 'align', 'wrap', 'padding'] as const

const UNBUILT_SECTION_BRIEF = 'nothing of this section is built yet'

const PARTIAL_HINT =
  'the run was cut short during pairing, so some nodes were never paired and its numbers are not comparable with other rounds; the round was not counted'

const HINT = 'no element carries data-conciv-source; the page is not a dev build compiled by the conciv plugin'

const ORIGIN_HINT = 'the conciv engine origin is unknown, so xray is a path on the engine and not a full url'

const DETACHED_POSITIONS = ['absolute', 'fixed']

const STATIC_POSITION = 'static'

function withSimilarity(similarity: number | undefined): {similarity?: number} {
  return similarity === undefined ? {} : {similarity}
}

const MISMATCH_PRECISION = 10_000

function mismatchRounded(mismatch: number): number {
  return Math.round(mismatch * MISMATCH_PRECISION) / MISMATCH_PRECISION
}

function parentPaired(input: {node: MatchNode; tree: DesignTree; pairedNodes: Set<string>}): boolean {
  const parent = input.tree.parents.get(input.node.id)
  return parent === undefined || parent === input.tree.root || input.pairedNodes.has(parent.id)
}

function stageColumn(stage: Stage): number {
  return 1 + STAGES.indexOf(stage)
}

type Unbuilt = Record<string, Unmatched>

type LayoutRun = ContainerLayout['runs'][number]

type Reported = {element: Element; report: ComponentReport}

type Stop = (typeof STOPS)[number]
