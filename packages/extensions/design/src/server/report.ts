import {isAbsolute, relative} from 'node:path'
import {countBy, maxBy, uniq, uniqBy} from 'es-toolkit'
import type {Box, Decision, Delta, Design, DiffReport, LiveComponent, Match, Run, Words} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'
import {box} from '../shared/box.js'

export function buildReport(input: Parameters<Words['report']>[0] & {phrases: Phrases; cwd: string}): DiffReport {
  const {run, previous, measured, design, record, paths, phrases, cwd} = input
  const shown = (path: string): string => (isAbsolute(path) ? relative(cwd, path) : path)
  const {root} = run
  const visits = [...walk(root)].map(({node, parent, depth}) => ({match: node, parent, depth}))
  const items = input.items.map((item) => ({...item, sentence: phrases.item({item, root})}))
  const crop = (node: string): string => cropUrl({xray: paths.xray, node, run: run.id})
  const changes = phrases.changes({previous, root, items, crop})
  const warnings = visits.flatMap(({match}) => match.deltas.filter((delta) => delta.warning !== undefined))
  const painted = paintedPage(measured.live.children)
  const components = componentsOf({root, items, live: measured.live, input: input.input, twins: twinsOf(input)})
  const unmatched = unmatchedOf({root, items, phrases})
  const paired = visits.filter(({match, depth}) => depth > 0 && match.live !== null).length
  const similarity = run.similarity === null ? {} : {similarity: run.similarity}
  const shared = {
    target: {id: record.id, ...(record.route === undefined ? {} : {route: record.route}), width: record.width},
    mismatch: rounded(run.mismatch),
    sectionSimilarity: Object.fromEntries(run.sections.map((section) => [section.id, section.similarity])),
    diffImage: shown(paths.diff),
    livePath: shown(paths.live),
    xray: paths.xray,
    painted,
    segmentation: segmentationQuality(design),
    capturePath: measured.path,
    sources: measured.sources,
    round: run.round,
    responsive: [],
    partial: run.partial,
    pinsLost: pinsLost({decisions: input.decisions, root}),
    ...(measured.limits === undefined ? {} : {limits: measured.limits}),
    timings: input.timings,
    designPath: shown(record.paths.design),
    placeholderPath: shown(record.paths.placeholder),
  }
  const hint = (count: number): {hint?: string} => {
    const said = phrases.hint({
      attributed: measured.live.children.length > 0,
      absolute: paths.xray.startsWith('http://') || paths.xray.startsWith('https://'),
      cut: {listed: components.listed, shown: count, paired},
    })
    return said === null ? {} : {hint: said}
  }
  const since = previous === null ? null : previous.round
  const was = previous?.similarity ?? null
  const trend = was === null || run.similarity === null ? null : {now: run.similarity, was}
  const told = (verdict: Pick<Run, 'stage' | 'stop' | 'score'> & {changes: Changes; warnings: Delta[]}) =>
    briefOf({...verdict, items, since, trend, painted, crop, phrases})
  const scope = root.children.find((child) => child.node.id === input.input.section) ?? null
  if (input.input.section === undefined || scope === null) {
    return {
      ...shared,
      ...similarity,
      ...told({stage: run.stage, stop: run.stop, score: run.score, changes, warnings}),
      stage: run.stage,
      stop: run.stop,
      score: run.score,
      components: components.reported,
      unmatched,
      warnings,
      paired,
      changes,
      ledger: ledgerCounts(visits.flatMap(({match, depth}) => (depth === 0 ? [] : [match]))),
      ...hint(components.reported.length),
    }
  }
  const nodes = new Set([...walk(scope)].map(({node}) => node.node.id))
  const area = roundedBox(scope.node.box)
  const inside = (inner: Box | undefined): boolean => inner !== undefined && box.encloses({inner, outer: area})
  const held = (entry: {node?: string | undefined; box?: Box | undefined}): boolean =>
    entry.node === undefined ? inside(entry.box) : nodes.has(entry.node)
  const scoped = sectionVerdict({scope, items, partial: run.partial})
  const scopedChanges = filteredChanges({changes, nodes})
  const scopedWarnings = warnings.filter((warning) => inside(warning.box))
  const said = told({...scoped, changes: scopedChanges, warnings: scopedWarnings})
  const reported = components.reported.filter(
    (component) => (component.nodes ?? []).some((node) => nodes.has(node)) || inside(component.live),
  )
  const built = [...walk(scope)].some(({node}) => node.live !== null)
  const own = run.sections.find((section) => section.id === scope.node.id)
  return {
    ...shared,
    ...said,
    ...scoped,
    ...(own === undefined ? {} : {similarity: own.similarity}),
    brief: built ? said.brief : [phrases.unbuiltSection, ...said.brief],
    components: reported,
    unmatched: unmatched.filter((entry) => held({node: entry.node, box: entry.target ?? entry.live})),
    warnings: scopedWarnings,
    paired: [...walk(scope)].filter(({node}) => node.live !== null).length,
    changes: scopedChanges,
    ledger: ledgerCounts([...walk(scope)].map(({node}) => node)),
    section: {id: scope.node.id, line: phrases.line({node: scope.node, scale: 1})},
    scope: 'section',
    page: {stop: run.stop, stage: run.stage, score: run.score, ...similarity},
    ...hint(reported.length),
  }
}

type Item = Run['items'][number]
type Stage = NonNullable<Run['stage']>
type Stop = NonNullable<Run['stop']>
type Changes = DiffReport['changes']
type Unmatched = DiffReport['unmatched'][number]
type Node = Match['node']
type Layout = NonNullable<Node['layout']>
type Phrases = {
  item(input: {item: Item; root: Match}): string
  changes(input: {previous: Run | null; root: Match; items: Item[]; crop: (node: string) => string}): Changes
  change(input: {changes: Changes; round: number; similarity: {now: number; was: number} | null}): string
  stalled(input: {stage: Stage; score: number[]; unchanged: Item[]}): string
  flipped(input: {items: Item[]; round: number}): string
  painted(count: number): string
  warning(delta: Delta): string
  line(input: {node: Node; scale: number}): string
  hint(input: {
    attributed: boolean
    absolute: boolean
    cut: {listed: number; shown: number; paired: number}
  }): string | null
  structural(input: {match: Match; parent: Match; root: Match}): boolean
  seat(input: {node: Node; parent: Node}): {direction: NonNullable<Layout['direction']>; index: number} | null
  unbuiltSection: string
}

const TOLERANCES = designConfig.tolerances
const STAGES = ['structure', 'content', 'geometry', 'paint'] as const satisfies readonly Stage[]

function sectionVerdict(input: {scope: Match; items: Item[]; partial: boolean}): Pick<Run, 'stage' | 'stop' | 'score'> {
  const {items} = input
  const counted = items.filter((item) => item.stage !== null)
  const stage = STAGES.find((candidate) => counted.some((item) => item.stage === candidate)) ?? null
  const built = [...walk(input.scope)].some(({node}) => node.live !== null)
  const open = !built || input.partial || counted.length > 0
  const [first] = items
  const spent = (first?.spent ?? 0) >= TOLERANCES.roundBudget
  const sums = STAGES.map((candidate) =>
    rounded(counted.filter((item) => item.stage === candidate).reduce((sum, item) => sum + item.size, 0)),
  )
  const stop: Stop | null = !open ? 'done' : spent ? 'budget' : null
  return {stage, stop, score: [first?.unpaired ?? 0, ...sums, first?.residual ?? 0]}
}

function twinsOf(input: Parameters<Words['report']>[0]): {node: string; path: string; target: string}[] {
  return input.twins.flatMap((twin) => {
    const decision = input.decisions.find((entry) => entry.kind === 'twin' && entry.anchor === twin.node)
    const value = decision?.value
    if (typeof value !== 'object' || value === null || !('target' in value)) return []
    return [{node: twin.node, path: twin.path, target: value.target}]
  })
}

function pinsLost(input: {decisions: Decision[]; root: Match}): string[] {
  const paired = new Map(
    [...walk(input.root)].flatMap(({node}) => (node.live === null ? [] : [[node.node.id, node.live.path] as const])),
  )
  return input.decisions
    .filter((decision) => decision.kind === 'pin' && paired.get(decision.anchor) !== decision.value)
    .map((decision) => decision.id)
}

function briefOf(
  input: Pick<Run, 'stage' | 'stop' | 'score'> & {
    items: Item[]
    changes: Changes
    warnings: Delta[]
    since: number | null
    trend: {now: number; was: number} | null
    painted: DiffReport['painted']
    crop: (node: string) => string
    phrases: Phrases
  },
): Pick<DiffReport, 'brief' | 'rows'> {
  const {stage, stop, score, items, crop, phrases} = input
  const ordered = items.filter((item) => item.stage !== null && item.stage === stage)
  const later = stage === null ? [] : STAGES.slice(STAGES.indexOf(stage) + 1)
  const next = later.find((candidate) => items.some((item) => item.stage === candidate))
  const following = items.filter((item) => item.stage === next).slice(0, TOLERANCES.briefNext)
  const unchanged = items.filter((item) => item.demoted === true)
  const flipped = items.flatMap((item) => (item.flipped === undefined ? [] : [{item, round: item.flipped}]))
  const [flip] = flipped
  const brief = [
    ...(stop === 'stalled' && stage !== null ? [phrases.stalled({stage, score, unchanged})] : []),
    ...(input.since === null
      ? []
      : [phrases.change({changes: input.changes, round: input.since, similarity: input.trend})]),
    ...(input.painted === null ? [] : [phrases.painted(input.painted.count)]),
    ...(flip === undefined ? [] : [phrases.flipped({items: flipped.map((entry) => entry.item), round: flip.round})]),
    ...input.warnings.map(phrases.warning),
    ...ordered.slice(0, TOLERANCES.briefSize).map((item) => item.sentence),
    ...following.map((item) => `${item.stage} next: ${item.sentence}`),
  ]
  const rows = [...ordered.slice(0, ROW_LIMIT), ...following].flatMap((item) =>
    item.stage === null
      ? []
      : [
          {
            sentence: item.sentence,
            stage: item.stage,
            ...(item.node === undefined ? {} : {node: item.node, crop: crop(item.node)}),
            ...(item.source === undefined ? {} : {source: item.source}),
          },
        ],
  )
  return {brief, rows}
}

function filteredChanges(input: {changes: Changes; nodes: Set<string>}): Changes {
  const keep = (list: Changes['done']): Changes['done'] => list.filter((change) => input.nodes.has(change.node))
  const {done, regressed, paired, lost, moved} = input.changes
  return {done: keep(done), regressed: keep(regressed), paired: keep(paired), lost: keep(lost), moved: keep(moved)}
}

function componentsOf(input: {
  root: Match
  items: Item[]
  live: LiveComponent
  input: Parameters<Words['report']>[0]['input']
  twins: {node: string; path: string; target: string}[]
}): {reported: DiffReport['components']; listed: number} {
  const sizes = new Map(input.items.map((item) => [item.key, item.size]))
  const selectors = selectorsOf(input.live)
  const groups = Map.groupBy(
    [...walk(input.root)].flatMap(({node, depth}) =>
      depth === 0 || node.live === null ? [] : [{match: node, live: node.live, depth}],
    ),
    (entry) => entry.live.path,
  )
  const elements = [...groups].flatMap(([path, entries]) => {
    const [head] = entries
    if (head === undefined) return []
    const owned = entries.flatMap(({match}) =>
      match.deltas.flatMap((delta) => (delta.warning === undefined ? [{key: deltaKey({match, delta}), delta}] : [])),
    )
    const deltas = owned.filter(({delta}) => !residual(delta))
    const shares = owned.flatMap(({delta}) =>
      delta.kind === 'pixels' && typeof delta.live === 'number' ? [delta.live] : [],
    )
    const boxed = entries.find(({match}) => match.node.kind !== 'text')
    const texts = entries.flatMap(({match}) => (match.node.kind === 'text' ? [match.node.box] : []))
    return [
      {
        path,
        live: head.live,
        depth: Math.min(...entries.map((entry) => entry.depth)),
        target: boxed?.match.node.box ?? (texts.length === 0 ? null : box.union(texts)),
        deltas: deltas.map(({delta}) => delta),
        mismatch: Math.max(0, ...shares),
        nodes: uniq(entries.map(({match}) => match.node.id)),
        impact: Math.max(0, ...deltas.map(({key, delta}) => (delta.confidence ?? 1) * (sizes.get(key) ?? 0))),
      },
    ]
  })
  const above = elements.filter(designConfig.componentAboveTolerance)
  const paths = elements.map((element) => element.path)
  const parentOf = (path: string): string | undefined =>
    maxBy(
      paths.filter((other) => other !== path && path.startsWith(`${other}/`)),
      (other) => other.length,
    )
  const ranked = above
    .map((element) => ({...element, children: above.filter((child) => parentOf(child.path) === element.path).length}))
    .filter((element) => element.deltas.length > 0 || (element.children === 0 && element.depth <= input.input.depth))
    .toSorted(
      (a, b) =>
        Number(b.deltas.length > 0) - Number(a.deltas.length > 0) ||
        b.impact - a.impact ||
        a.live.box.y - b.live.box.y ||
        a.depth - b.depth,
    )
  const shown = ranked.slice(0, input.input.full === true ? ranked.length : input.input.limit)
  return {
    listed: ranked.length,
    reported: shown.map((element) => ({
      source: element.live.source,
      tag: element.live.tag,
      selector: selectors.get(element.path) ?? element.live.tag,
      live: element.live.box,
      target: element.target,
      mismatch: rounded(element.mismatch),
      deltas: element.deltas,
      children: element.children,
      nodes: element.nodes,
      path: element.path,
      ...twinDisagreement({nodes: element.nodes, path: element.path, twins: input.twins}),
    })),
  }
}

function twinDisagreement(input: {
  nodes: string[]
  path: string
  twins: {node: string; path: string; target: string}[]
}): Pick<DiffReport['components'][number], 'twinDisagreement'> {
  const other = input.twins.find((twin) => input.nodes.includes(twin.node) && twin.path !== input.path)
  return other === undefined ? {} : {twinDisagreement: {target: other.target, path: other.path}}
}

function deltaKey(input: {match: Match; delta: Delta}): string {
  const {match, delta} = input
  return `${match.node.id}:${delta.kind}${delta.side === undefined ? '' : `:${delta.side}`}`
}

function residual(delta: Delta): boolean {
  return delta.kind === 'pixels' && typeof delta.live === 'number' && delta.live < TOLERANCES.pixelGate
}

function selectorsOf(live: LiveComponent): Map<string, string> {
  return new Map([
    [live.path, componentSelector({component: live, parent: null, shared: false})],
    ...selectorsUnder({components: live.children, host: null}),
  ])
}

function selectorsUnder(input: {components: LiveComponent[]; host: string | null}): [string, string][] {
  const keys = input.components.map(sourceKey)
  return input.components.flatMap((component, position): [string, string][] => {
    const key = keys[position] ?? null
    const shared = key !== null && keys.indexOf(key) !== keys.lastIndexOf(key)
    const selector = componentSelector({component, parent: input.host, shared})
    return [[component.path, selector], ...selectorsUnder({components: component.children, host: selector})]
  })
}

function componentSelector(input: {component: LiveComponent; parent: string | null; shared: boolean}): string {
  const {component, parent, shared} = input
  const key = sourceKey(component)
  if (key === null) return parent === null ? component.tag : `${parent} > ${component.tag}`
  const selector = `[${designConfig.attributes.source}="${key}"]`
  return shared ? `${selector}:nth-child(${component.index})` : selector
}

function sourceKey(component: LiveComponent): string | null {
  const {source} = component
  return source === null ? null : `${source.file}:${source.line}:${source.column}`
}

function unmatchedOf(input: {root: Match; items: Item[]; phrases: Phrases}): Unmatched[] {
  const {root, phrases} = input
  const unbuilt = [...walk(root)].flatMap(({node: match, parent}): Unmatched[] => {
    if (parent === null || match.live !== null) return []
    const {node} = match
    const layout = entryLayout({node, parent: parent.node, phrases})
    return [
      {
        kind: 'unbuilt',
        target: node.box,
        label: node.kind === 'text' ? `text "${node.text}"` : node.kind,
        stage: phrases.structural({match, parent, root}) ? 'structure' : null,
        node: node.id,
        ...(layout === null ? {} : {layout}),
      },
    ]
  })
  const others = input.items.flatMap((item): Unmatched[] => {
    const source = item.source === undefined ? {} : {source: item.source}
    if (item.kind === 'extra') return [{kind: 'extra', live: item.box, stage: null, ...source}]
    if (item.kind !== 'offset') return []
    const [dx = 0, dy = 0] = String(item.value).split(',').map(Number)
    const shift = {dx, dy}
    if (item.node === undefined) return [{kind: 'offset', stage: 'geometry', shift}]
    return [{kind: 'offset', live: item.box, stage: 'geometry', shift, node: item.node, ...source}]
  })
  return [...unbuilt, ...others]
}

function entryLayout(input: {node: Node; parent: Node; phrases: Phrases}): Unmatched['layout'] | null {
  const own = input.node.layout
  if (own?.size === undefined) return null
  const {direction, size, gap, align, wrap, padding} = own
  if (direction !== undefined) {
    return {
      direction,
      size,
      ...(gap === undefined ? {} : {gap}),
      ...(align === undefined ? {} : {align}),
      ...(wrap === undefined ? {} : {wrap}),
      ...(padding === undefined ? {} : {padding}),
    }
  }
  const seat = input.phrases.seat({node: input.node, parent: input.parent})
  return seat === null ? null : {direction: seat.direction, index: seat.index, size}
}

function ledgerCounts(matches: Match[]): DiffReport['ledger'] {
  const counted = countBy(matches, (match) => match.status)
  return {
    unbuilt: counted.unbuilt ?? 0,
    paired: counted.paired ?? 0,
    done: counted.done ?? 0,
    regressed: counted.regressed ?? 0,
    accepted: counted.accepted ?? 0,
  }
}

function paintedPage(components: LiveComponent[]): DiffReport['painted'] {
  const total = components.flatMap((component) => [...walk(component)]).length
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

function segmentationQuality(design: Design): 'full' | 'partial' {
  const page = design.viewport.width * design.viewport.height
  const covered = [...walk(design.root)]
    .filter(
      ({node, parent}) =>
        node.kind === 'image' &&
        parent !== null &&
        (parent === design.root || (parent.kind === 'box' && parent.paint === undefined)),
    )
    .reduce((sum, {node}) => sum + node.box.w * node.box.h, 0)
  return page > 0 && covered / page > TOLERANCES.segmentImageShare ? 'partial' : 'full'
}

function cropUrl(input: {xray: string; node: string; run: string}): string {
  const {xray, node, run} = input
  return `${xray.replace(XRAY_LIST, XRAY_NODE)}&node=${encodeURIComponent(node)}&run=${encodeURIComponent(run)}`
}

function roundedBox(area: Box): Box {
  return {x: Math.round(area.x), y: Math.round(area.y), w: Math.round(area.w), h: Math.round(area.h)}
}

function rounded(value: number): number {
  return Math.round(value * PRECISION) / PRECISION
}

const DETACHED_POSITIONS = ['absolute', 'fixed']

const STATIC_POSITION = 'static'

const XRAY_LIST = '/xray/list?'

const XRAY_NODE = '/xray/node?'

const ROW_LIMIT = 10

const PRECISION = 10_000
