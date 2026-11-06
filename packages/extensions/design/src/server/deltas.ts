import {groupBy, maxBy, mean, median, omit, range} from 'es-toolkit'
import type {z} from 'zod'
import type {Storage} from 'unstorage'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {Box, Decision, Delta, Deltas, DesignNode, LiveComponent, Match, Raster} from '../shared/defs.js'
import {box as boxes} from '../shared/box.js'
import {designConfig} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'
import {deltaKinds} from './kinds.js'
import {createProvenance} from './provenance.js'
import {createTypography} from './typography.js'
import {createTiles} from './tiles.js'
import {textDeltas} from './text-deltas.js'

export function createDeltas(input: {
  config: DesignConfig
  project: Storage
  cwd: string
  bundler: BundlerBridge | undefined
}): Deltas {
  const {config} = input
  const provenance = createProvenance({project: input.project, cwd: input.cwd, bundler: input.bundler})
  const typography = createTypography({color: config.color})
  const tiles = createTiles()
  return {
    compute: (request) => computed({...request, config, provenance, typography, tiles}),
    dispose: () => {
      tiles.dispose()
      provenance.dispose()
      typography.dispose()
    },
  }
}

type DesignConfig = z.output<typeof designConfig>

type Provenance = ReturnType<typeof createProvenance>

type Typography = ReturnType<typeof createTypography>

type Tiles = ReturnType<typeof createTiles>

type Reuse = Awaited<ReturnType<Tiles['reuse']>>['reuse']

type Request = Parameters<Deltas['compute']>[0]

type Computed = Awaited<ReturnType<Deltas['compute']>>

type Element = Parameters<typeof deltaKinds.measure>[0]['element']

type Node = Match['node']

type TextNode = Extract<Node, {kind: 'text'}>

type Paired = NonNullable<Match['live']>

type Shift = {dx: number; dy: number}

type Host = NonNullable<Element['host']>

type Seated = {match: Match; live: Paired}

const TOLERANCES = designConfig.tolerances

async function computed(
  input: Request & {config: DesignConfig; provenance: Provenance; typography: Typography; tiles: Tiles},
): Promise<Computed> {
  const {design, measured, target, decisions, page, provenance, typography, config, tiles} = input
  const clock = lapClock()
  const exact = exactDesign(design.root)
  const before = tiles.before(input.previous?.root.hash ?? null)
  const live = measured.raster.paintOver({from: target, boxes: [...measured.masks, ...input.excluded]})
  clock.lap('capture')
  const {grid, rawTiles, reuse} = tiles.reuse({before, live, target})
  const texts = typography.agreeing({
    components: measured.live.children,
    root: design.root,
    live,
    target,
    reuse,
  })
  const slots = [...walk(design.root)].flatMap(({node}) => (node.kind === 'image' ? [node.box] : []))
  const masked = live.paintOver({
    from: target,
    boxes: [
      ...texts.agreeing.map((box) => boxes.expand({box, by: TOLERANCES.glyphHalo + TOLERANCES.blurRadius})),
      ...slots,
    ],
  })
  const compared = tiles.compare({live: masked, target, comparator: config.comparator, previous: before?.tiles ?? null})
  clock.lap('mask')
  const scored = masked.similarity({
    target,
    mask: boxes.mask({
      boxes: [...measured.masks, ...input.excluded, ...slots].map(roundedBox),
      within: {x: 0, y: 0, w: compared.width, h: compared.height},
    }),
    differing: compared.mask,
    width: compared.width,
    height: compared.height,
  })
  const similarity = compared.width === 0 || compared.height === 0 ? null : rounded(meanOf(scored))
  const sections = design.root.children.map((section) => ({
    id: section.id,
    similarity: rounded(meanOf(scored.filter((tile) => centred({inner: tile.box, outer: roundedBox(section.box)})))),
  }))
  clock.lap('similarity')
  const sole = soleTexts({root: input.root, exact})
  const typed = await typography.estimate({texts: textOwners(sole), raster: target, page})
  const root = withTypography({match: sole, estimates: typed.estimates})
  clock.lap('typography')
  const elements = elementsOf({
    root,
    live: measured.live,
    raster: live,
    exact,
    mismatchAt: (box) => maskShare({...compared, box: boxes.expand({box, by: TOLERANCES.tileMargin})}),
  })
  const alignment = align({root, raster: live, exact})
  const stamp = {source: measured.sources[0] ?? 'dom', confidence: measured.confidence, width: design.viewport.width}
  const judged = await textDeltas.judge({elements, provenance})
  const pageBox = {x: 0, y: 0, w: measured.live.box.w, h: measured.live.box.h}
  const measures = cachedMeasures({
    elements,
    reuse,
    shift: alignment.global,
    live,
    target,
    page: pageBox,
    color: config.color,
  })
  const raw = elements.map((element) =>
    decided({
      deltas: slotDeltas({
        element,
        deltas: pixelRow({
          element,
          deltas: [...(measures.get(element)?.deltas ?? []), ...textDeltas.rows({element, judged})],
        }),
      }).map((delta) => ({...delta, ...stamp})),
      element,
      decisions,
      color: config.color,
    }),
  )
  const owned = await attributed({
    elements,
    raw,
    limit: input.limit,
    color: config.color,
    provenance,
    page,
    width: design.viewport.width,
    height: design.viewport.height,
  })
  const warnings = [
    ...(await textDeltas.warnings({elements, judged, components: measured.live.children, root, provenance})),
    ...typographyWarnings({skipped: typed.skipped, estimated: Object.keys(typed.estimates).length}),
  ].map((delta) => ({...delta, ...stamp}))
  clock.lap('deltas')
  const done = withDeltas({match: root, owned, shifts: alignment.shifts})
  tiles.remember({
    key: input.root.hash,
    value: {
      grid,
      rawTiles,
      tiles: compared.tiles,
      textMasks: texts.masks,
      measures: new Map([...measures.values()].map((entry) => [entry.key, entry.deltas])),
    },
  })
  return {
    root: {...done, shift: alignment.page},
    extras: extrasOf({components: measured.live.children, root}),
    warnings,
    mismatch: rounded(compared.mismatch),
    similarity,
    diff: masked.paintDiff({mask: compared.mask, width: compared.width}),
    sections,
    timings: {...clock.timings(), carried: compared.carried},
  }
}

function lapClock(): {lap: (phase: string) => void; timings: () => Record<string, number>} {
  const laps: {phase: string; at: number}[] = [{phase: 'start', at: performance.now()}]
  return {
    lap: (phase) => {
      laps.push({phase, at: performance.now()})
    },
    timings: () =>
      Object.fromEntries(
        laps.flatMap((lap, index) => {
          const previous = laps[index - 1]
          return previous === undefined ? [] : [[lap.phase, Math.round(lap.at - previous.at)]]
        }),
      ),
  }
}

function exactDesign(root: DesignNode): boolean {
  return [...walk(root)].every(({node}) => node.kind !== 'text' || node.confidence === 1)
}

function meanOf(tiles: {similarity: number}[]): number {
  return tiles.length === 0 ? 1 : mean(tiles.map((tile) => tile.similarity))
}

function centred(input: {inner: Box; outer: Box}): boolean {
  const {inner, outer} = input
  const x = inner.x + inner.w / 2
  const y = inner.y + inner.h / 2
  return x >= outer.x && x < outer.x + outer.w && y >= outer.y && y < outer.y + outer.h
}

function roundedBox(box: Box): Box {
  return {x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h)}
}

function maskShare(input: {mask: Uint8Array; width: number; height: number; box: Box}): number {
  const {mask, width, height, box} = input
  const x0 = Math.max(0, Math.floor(box.x))
  const y0 = Math.max(0, Math.floor(box.y))
  const x1 = Math.min(width, Math.ceil(box.x + box.w))
  const y1 = Math.min(height, Math.ceil(box.y + box.h))
  if (x1 <= x0 || y1 <= y0) return 0
  const count = range(y0, y1).reduce(
    (sum, y) => sum + mask.subarray(y * width + x0, y * width + x1).reduce((row, value) => row + value, 0),
    0,
  )
  return count / ((x1 - x0) * (y1 - y0))
}

function soleTexts(input: {root: Match; exact: boolean}): Match {
  if (!input.exact) return input.root
  const texts = [...walk(input.root)].flatMap(({node}) =>
    node.node.kind === 'text' && node.live !== null ? [{match: node, path: node.live.path, live: node.live}] : [],
  )
  const kept = new Set(
    Object.values(groupBy(texts, (entry) => entry.path)).flatMap((entries) => {
      const best = maxBy(entries, (entry) =>
        boxes.area(boxes.intersection({a: entry.match.node.box, b: entry.live.box}) ?? NO_BOX),
      )
      return best === undefined ? [] : [best.match]
    }),
  )
  const dropped = new Set(texts.filter((entry) => !kept.has(entry.match)).map((entry) => entry.match))
  return unpaired({match: input.root, dropped})
}

const NO_BOX: Box = {x: 0, y: 0, w: 0, h: 0}

function unpaired(input: {match: Match; dropped: Set<Match>}): Match {
  const children = input.match.children.map((child) => unpaired({...input, match: child}))
  if (!input.dropped.has(input.match)) return {...input.match, children}
  return {...input.match, live: null, confidence: 0, children}
}

function textOwners(root: Match): {node: TextNode; owner: LiveComponent}[] {
  return [...walk(root)].flatMap(({node}) =>
    node.node.kind === 'text' && node.live !== null ? [{node: node.node, owner: {...node.live, children: []}}] : [],
  )
}

function withTypography(input: {match: Match; estimates: Record<string, TypographyValue>}): Match {
  const {match, estimates} = input
  const children = match.children.map((child) => withTypography({match: child, estimates}))
  const found = estimates[match.node.id]
  if (match.node.kind !== 'text' || found === undefined) return {...match, children}
  return {...match, node: {...match.node, typography: found}, children}
}

type TypographyValue = NonNullable<TextNode['typography']>

function withDeltas(input: {match: Match; owned: Map<Match, Delta[]>; shifts: Map<Match, Shift>}): Match {
  const {match, owned, shifts} = input
  const shift = shifts.get(match)
  return {
    ...match,
    deltas: owned.get(match) ?? [],
    shift: shift === undefined ? null : {x: Math.round(shift.dx), y: Math.round(shift.dy)},
    children: match.children.map((child) => withDeltas({...input, match: child})),
  }
}

function extrasOf(input: {components: LiveComponent[]; root: Match}): LiveComponent[] {
  const paths = [...walk(input.root)].flatMap(({node}) => (node.live === null ? [] : [node.live.path]))
  const claimed = (component: LiveComponent): boolean =>
    paths.some((path) => path === component.path || path.startsWith(`${component.path}/`))
  const unclaimed = (components: LiveComponent[]): LiveComponent[] =>
    components.flatMap((component) => {
      if (!claimed(component)) return [{...component, children: []}]
      return unclaimed(component.children)
    })
  return unclaimed(input.components)
}

function typographyWarnings(input: {skipped: number; estimated: number}): Delta[] {
  if (input.skipped === 0) return []
  return [
    {kind: 'fontSize', live: input.skipped, target: input.skipped + input.estimated, warning: 'typography-skipped'},
  ]
}

function cachedMeasures(input: {
  elements: Element[]
  reuse: Reuse | null
  shift: Shift
  live: Raster
  target: Raster
  page: Box
  color: DesignConfig['color']
}): Map<Element, {key: string; deltas: Delta[]}> {
  const {elements, reuse, shift} = input
  return new Map(
    elements.map((element): [Element, {key: string; deltas: Delta[]}] => {
      const key = measureKey({element, elements, shift})
      const kept = reuse?.measures.get(key)
      const region = boxes.expand({
        box: boxes.union([element.liveBox, moved({box: element.liveBox, shift})]),
        by: TOLERANCES.tileSide,
      })
      if (kept !== undefined && reuse !== null && reuse.unchanged(region)) return [element, {key, deltas: kept}]
      return [element, {key, deltas: deltaKinds.measure({...input, element})}]
    }),
  )
}

function measureKey(input: {element: Element; elements: Element[]; shift: Shift}): string {
  const {element, elements, shift} = input
  const placed = (other: Element | null): Box[] | null => (other === null ? null : [other.liveBox, other.targetBox])
  return JSON.stringify({
    node: element.node,
    live: omit(element.live, ['children']),
    texts: element.texts.map((node) => node.box),
    boxes: placed(element),
    parent: placed(element.parent),
    prev: placed(element.prev),
    next: placed(element.next),
    under: elements.filter((other) => under({element: other, ancestor: element})).map(placed),
    designed: element.match.children.length,
    shift,
  })
}

function under(input: {element: Element; ancestor: Element}): boolean {
  const parent = input.element.parent
  if (parent === null) return false
  return parent === input.ancestor || under({element: parent, ancestor: input.ancestor})
}

function moved(input: {box: Box; shift: Shift}): Box {
  return {...input.box, x: input.box.x + input.shift.dx, y: input.box.y + input.shift.dy}
}

async function attributed(input: {
  elements: Element[]
  raw: Delta[][]
  limit: number
  color: DesignConfig['color']
  provenance: Provenance
  page: Request['page']
  width: number
  height: number
}): Promise<Map<Match, Delta[]>> {
  const {elements, raw, color} = input
  const entries = elements.map((element, index) => ({element, deltas: raw[index] ?? []}))
  const impact = (deltas: Delta[]): number =>
    Math.max(0, ...deltas.map((delta) => (delta.confidence ?? 1) * deltaKinds.size({delta, color})))
  const ranked = entries
    .filter((entry) => entry.deltas.length > 0)
    .toSorted(
      (a, b) =>
        impact(b.deltas) - impact(a.deltas) ||
        a.element.liveBox.y - b.element.liveBox.y ||
        a.element.depth - b.element.depth,
    )
    .slice(0, input.limit)
  const sourcedDeltas = await input.provenance.attribute({
    entries: ranked.map(({element, deltas}) => ({
      deltas,
      live: element.live,
      selector: element.selector,
      host: element.host,
    })),
    page: input.page,
    width: input.width,
    height: input.height,
  })
  const found = new Map(ranked.map((entry, index) => [entry.element, sourcedDeltas[index] ?? entry.deltas]))
  return new Map(entries.map(({element, deltas}) => [element.match, found.get(element) ?? deltas]))
}

function elementsOf(input: {
  root: Match
  live: LiveComponent
  raster: Raster
  exact: boolean
  mismatchAt: (box: Box) => number
}): Element[] {
  const paired = [...walk(input.root)].flatMap(({node, depth}) =>
    depth === 0 || node.live === null ? [] : [{match: node, path: node.live.path}],
  )
  return grown({
    ...input,
    components: input.live.children,
    parent: null,
    host: null,
    depth: 1,
    byPath: Map.groupBy(paired, (entry) => entry.path),
    selectorOf: selectors(input.live),
  })
}

function grown(input: {
  components: LiveComponent[]
  parent: Element | null
  host: Host | null
  depth: number
  byPath: Map<string, {match: Match; path: string}[]>
  selectorOf: Map<string, string>
  raster: Raster
  exact: boolean
  mismatchAt: (box: Box) => number
}): Element[] {
  const {components, parent, depth, byPath, selectorOf} = input
  const level = components.map((component) => {
    const owner = {selector: selectorOf.get(component.path) ?? component.tag, live: component}
    const entries = (byPath.get(component.path) ?? []).map((entry) => entry.match)
    const head = entries.find((entry) => entry.node.kind !== 'text') ?? entries[0]
    const element =
      head === undefined ? null : madeElement({...input, component, entries, head, selector: owner.selector})
    return {element, component, owner}
  })
  const siblings = level.flatMap((entry) => entry.element ?? [])
  siblings.forEach((element, index) => {
    element.prev = siblings[index - 1] ?? null
    element.next = siblings[index + 1] ?? null
  })
  return level.flatMap(({element, component, owner}) => {
    const below = grown({
      ...input,
      components: component.children,
      parent: element ?? parent,
      host: owner,
      depth: element === null ? depth : depth + 1,
    })
    return element === null ? below : [element, ...below]
  })
}

function madeElement(input: {
  component: LiveComponent
  entries: Match[]
  head: Match
  selector: string
  parent: Element | null
  host: Host | null
  depth: number
  raster: Raster
  exact: boolean
  mismatchAt: (box: Box) => number
}): Element {
  const {component, entries, head, raster, exact} = input
  const texts = entries.flatMap((entry) => (entry.node.kind === 'text' ? [entry.node] : []))
  const element: Element = {
    match: head,
    live: component,
    node: head.node,
    texts,
    confidence: Math.max(...entries.map((entry) => entry.confidence)),
    selector: input.selector,
    liveBox: component.box,
    targetBox: component.box,
    mismatch: input.mismatchAt(component.box),
    depth: input.depth,
    parent: input.parent,
    host: input.host,
    prev: null,
    next: null,
  }
  if (head.node.kind !== 'text') return {...element, targetBox: head.node.box}
  if (exact && texts.length > 0) return {...element, targetBox: boxes.union(texts.map((text) => text.box))}
  const placed = texts.map((node) => targetBox({node, live: component, raster, exact: false}))
  const dx = median0(placed.map((box) => box.x - component.box.x))
  const dy = median0(placed.map((box) => box.y - component.box.y))
  return {...element, targetBox: {...component.box, x: component.box.x + dx, y: component.box.y + dy}}
}

function median0(values: number[]): number {
  return values.length === 0 ? 0 : median(values)
}

function targetBox(input: {node: Node; live: Pick<Paired, 'box' | 'glyphs'>; raster: Raster; exact: boolean}): Box {
  const {node, live, raster, exact} = input
  if (node.kind !== 'text' || exact) return node.box
  const shift = inkShift({node, live, raster})
  return {...live.box, x: live.box.x + shift.dx, y: live.box.y + shift.dy}
}

function inkShift(input: {node: TextNode; live: Pick<Paired, 'glyphs'>; raster: Raster}): Shift {
  const {node, live, raster} = input
  const line = boxes.nearestLine({lines: live.glyphs.flatMap((glyph) => glyph.boxes), box: node.box})
  if (line === null) return {dx: 0, dy: 0}
  const ink = raster.trim(line)
  return {dx: node.box.x - ink.x, dy: node.box.y - ink.y}
}

function align(input: {root: Match; raster: Raster; exact: boolean}): {
  global: Shift
  page: {x: number; y: number} | null
  shifts: Map<Match, Shift>
} {
  const {root, raster, exact} = input
  const seated = [...walk(root)].flatMap(({node, depth}): Seated[] =>
    depth === 0 || node.live === null ? [] : [{match: node, live: node.live}],
  )
  const global = exact
    ? boxShift(seated)
    : medianShift(
        seated.flatMap(({match, live}) =>
          match.node.kind === 'text' ? [inkShift({node: match.node, live, raster})] : [],
        ),
      )
  const shiftOf = (entry: Seated): Shift => relative({a: displacement({seated: entry, raster, exact}), b: global})
  const page = beyond(global) ? {x: Math.round(global.dx), y: Math.round(global.dy)} : null
  const heads = new Set(
    [...Map.groupBy(seated, (entry) => entry.live.path).values()].flatMap((entries) => {
      const head = entries.find((entry) => entry.match.node.kind !== 'text') ?? entries[0]
      return head === undefined ? [] : [head.match]
    }),
  )
  return {global, page, shifts: new Map(offsetsUnder({match: root, anchor: null, shiftOf, heads}))}
}

function boxShift(seated: Seated[]): Shift {
  const boxed = seated.filter(({match}) => match.node.kind !== 'text')
  if (boxed.length < PAGE_SHIFT_PAIRS) return {dx: 0, dy: 0}
  return medianShift(
    boxed.map(({match, live}) => ({dx: match.node.box.x - live.box.x, dy: match.node.box.y - live.box.y})),
  )
}

const PAGE_SHIFT_PAIRS = 3

function medianShift(shifts: Shift[]): Shift {
  return {dx: median0(shifts.map((shift) => shift.dx)), dy: median0(shifts.map((shift) => shift.dy))}
}

function displacement(input: {seated: Seated; raster: Raster; exact: boolean}): Shift {
  const {seated, raster, exact} = input
  const {node} = seated.match
  const ink = exact && node.kind === 'text' ? inkToInk({node, live: seated.live}) : null
  const placed = targetBox({node, live: seated.live, raster, exact})
  return ink ?? {dx: placed.x - seated.live.box.x, dy: placed.y - seated.live.box.y}
}

function inkToInk(input: {node: TextNode; live: Paired}): Shift | null {
  const {node, live} = input
  const glyphs = live.glyphs.flatMap((glyph) => glyph.boxes)
  const lines = node.lines.map((line) => line.box)
  if (glyphs.length === 0 || lines.length === 0) return null
  const drawn = boxes.union(glyphs)
  const design = boxes.union(lines)
  return {
    dx: horizontal({design, live: drawn, alignment: live.styles.textAlign}),
    dy: boxes.centre(design).y - boxes.centre(drawn).y,
  }
}

function horizontal(input: {design: Box; live: Box; alignment: string}): number {
  const {design, live, alignment} = input
  if (alignment === 'center') return boxes.centre(design).x - boxes.centre(live).x
  if (alignment === 'right' || alignment === 'end') return design.x + design.w - (live.x + live.w)
  return design.x - live.x
}

function relative(input: {a: Shift; b: Shift}): Shift {
  return {dx: input.a.dx - input.b.dx, dy: input.a.dy - input.b.dy}
}

function beyond(shift: Shift): boolean {
  return Math.abs(shift.dx) > TOLERANCES.geometryPx || Math.abs(shift.dy) > TOLERANCES.geometryPx
}

function offsetsUnder(input: {
  match: Match
  anchor: Seated | null
  shiftOf: (seated: Seated) => Shift
  heads: Set<Match>
}): [Match, Shift][] {
  const {anchor, shiftOf, heads} = input
  return input.match.children.flatMap((child): [Match, Shift][] => {
    const seated = child.live === null ? null : {match: child, live: child.live}
    const below = offsetsUnder({...input, match: child, anchor: seated ?? anchor})
    if (seated === null) return below
    if (anchor !== null && beyond(shiftOf(anchor))) return below
    const shift = shiftOf(seated)
    return beyond(shift) && heads.has(child) ? [[child, shift], ...below] : below
  })
}

function selectors(live: LiveComponent): Map<string, string> {
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

function decided(input: {
  deltas: Delta[]
  element: Element
  decisions: Decision[]
  color: DesignConfig['color']
}): Delta[] {
  const {element, decisions, color} = input
  const anchors = new Set([element.node.id, ...element.texts.map((node) => node.id)])
  const mine = decisions.filter((entry) => anchors.has(entry.anchor))
  const accepted = new Set(mine.filter((entry) => entry.kind === 'accept-delta').map((entry) => String(entry.value)))
  const scale = mine.reduce(
    (found, entry) => (entry.kind === 'tolerance' && typeof entry.value === 'number' ? entry.value : found),
    1,
  )
  return input.deltas
    .filter((delta) => !accepted.has(delta.kind))
    .filter((delta) => scale === 1 || deltaKinds.size({delta, color}) > scale)
}

function slotDeltas(input: {element: Element; deltas: Delta[]}): Delta[] {
  const {element, deltas} = input
  if (element.node.kind !== 'image') return deltas
  if (element.live.placeholder === null) return deltas.filter((delta) => !PICTURE_PAINT.has(delta.kind))
  return deltas.filter((delta) => !SLOT_STAGES.has(designConfig.kindStage(delta.kind)))
}

const SLOT_STAGES = new Set<ReturnType<typeof designConfig.kindStage>>(['paint', 'content'])

const PICTURE_PAINT = new Set<Delta['kind']>(['background', 'foreground', 'border', 'pixels'])

function pixelRow(input: {element: Element; deltas: Delta[]}): Delta[] {
  const {element, deltas} = input
  if (deltas.length > 0 || element.mismatch < TOLERANCES.tileGate) return deltas
  return [{kind: 'pixels', live: rounded(element.mismatch), target: 0}]
}

function rounded(mismatch: number): number {
  return Math.round(mismatch * MISMATCH_PRECISION) / MISMATCH_PRECISION
}

const MISMATCH_PRECISION = 10_000
