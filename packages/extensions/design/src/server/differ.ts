import pixelmatch from 'pixelmatch'
import {diff} from '@blazediff/core'
import {z} from 'zod'
import {groupBy, range, uniqBy} from 'es-toolkit'
import {toolError, type AnyToolBuilder} from '@conciv/extension'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import {basename} from 'node:path'
import type {SessionId} from '@conciv/protocol/chat-types'
import {
  BoxSchema,
  captureDef,
  clearDef,
  DESIGN_GUIDE,
  diffDef,
  GlyphSchema,
  LiveStylesSchema,
  measureDef,
  MeasureResultSchema,
  NO_TARGET_MESSAGE,
  SourceLocSchema,
  statusDef,
  targetDef,
  winnerDef,
  WinnerResultSchema,
  type CaptureInput,
  type CaptureResult,
  type ClearInput,
  type ClearResult,
  type ComponentReport,
  type DiffInput,
  type DiffReport,
  type StatusReport,
  type WinnerInput,
  type WinnerResult,
} from '../shared/defs.js'
import {aboveTolerance, SOURCE_ATTR, TOLERANCES} from '../shared/tolerances.js'
import type {
  Box,
  ColorMetric,
  Comparators,
  CssMap,
  Delta,
  DesignContext,
  DesignPage,
  DesignRuntime,
  Differ,
  GeometryEstimator,
  LiveCapture,
  LiveComponent,
  LiveRole,
  Matcher,
  Pair,
  PixelComparator,
  PixelRegion,
  Raster,
  Role,
  ServerStep,
  TargetModel,
  TargetRecord,
  TargetStore,
  TextGroup,
  TextRun,
  Unmatched,
  XrayLink,
} from '../shared/types.js'
import {glyphCoreColor, isOpaqueHex, sampledFills, sideFrom} from './deltas.js'
import {lookups, mapDeclaration, readLiveText, type LiveText} from './provenance.js'
import {
  boxBlur,
  crop,
  decodePng,
  diffMask,
  edgeDensity,
  edgeMap,
  encodePng,
  expand,
  findRegions,
  medianColor,
  overlapping,
  paintOver,
  sameLine,
  trimToInk,
  union,
} from './raster.js'
import {estimateTypography, liveRoute, pathnameIn, registerTarget, segmentationQuality} from './target.js'

const DIFF_OPTIONS = {threshold: 0.1, includeAA: false, diffMask: true} as const

function pixelResult(input: {output: Uint8Array; count: number; width: number; height: number}): {
  mismatch: number
  mask: Uint8Array
  regions: PixelRegion[]
} {
  const {output, count, width, height} = input
  const total = width * height
  const mask = diffMask({output, width, height})
  return {
    mismatch: total === 0 ? 0 : count / total,
    mask,
    regions: findRegions({mask, width, height, minSize: 1}).map((box) => ({box, kind: 'changed'})),
  }
}

const blazediffComparator: PixelComparator = {
  name: 'blazediff',
  compare: ({a, b}) => {
    const output = new Uint8Array(a.data.length)
    const count = diff(a.data, b.data, output, a.width, a.height, DIFF_OPTIONS)
    return pixelResult({output, count, width: a.width, height: a.height})
  },
}

const pixelmatchComparator: PixelComparator = {
  name: 'pixelmatch',
  compare: ({a, b}) => {
    const output = new Uint8Array(a.data.length)
    const count = pixelmatch(a.data, b.data, output, a.width, a.height, DIFF_OPTIONS)
    return pixelResult({output, count, width: a.width, height: a.height})
  },
}

const MIN_EDGE_DENSITY = 0.01
const MIN_RUN_OVERLAP = 0.5
const EDGE_WIDTH = 2

type Run = {start: number; end: number}

function findRuns(values: Uint32Array): Run[] {
  const runs: Run[] = []
  values.forEach((value, index) => {
    if (value === 0) return
    const last = runs.at(-1)
    if (last !== undefined && last.end === index - 1) {
      last.end = index
      return
    }
    runs.push({start: index, end: index})
  })
  return runs
}

function chooseSpan(input: {runs: Run[]; from: number; to: number}): Run | null {
  const chosen = input.runs.filter((run) => {
    const overlap = Math.min(run.end + 1, input.to) - Math.max(run.start, input.from)
    return overlap >= (run.end - run.start + 1) * MIN_RUN_OVERLAP
  })
  if (chosen.length === 0) return null
  return {start: Math.min(...chosen.map((run) => run.start)), end: Math.max(...chosen.map((run) => run.end))}
}

function projection(input: {
  edges: Uint8Array
  width: number
  columns: Run
  rows: Run
  byColumn: boolean
}): Uint32Array {
  const {edges, width, columns, rows, byColumn} = input
  const out = new Uint32Array(byColumn ? width : edges.length / width)
  for (let y = rows.start; y <= rows.end; y += 1) {
    for (let x = columns.start; x <= columns.end; x += 1) {
      if (edges[y * width + x] !== 1) continue
      const index = byColumn ? x : y
      out[index] = (out[index] ?? 0) + 1
    }
  }
  return out
}

function clamp(input: {from: number; to: number; size: number}): Run | null {
  const start = Math.max(0, Math.floor(input.from))
  const end = Math.min(input.size - 1, Math.ceil(input.to) - 1)
  return end < start ? null : {start, end}
}

function interior(run: Run): Run | null {
  return run.end - EDGE_WIDTH < run.start + EDGE_WIDTH
    ? null
    : {start: run.start + EDGE_WIDTH, end: run.end - EDGE_WIDTH}
}

function density(input: {edges: Uint8Array; width: number; columns: Run; rows: Run}): number {
  const count = projection({...input, byColumn: true}).reduce((sum, value) => sum + value, 0)
  return count / ((input.columns.end - input.columns.start + 1) * (input.rows.end - input.rows.start + 1))
}

const edgeProjection: GeometryEstimator = {
  name: 'edge-projection',
  estimate: ({target, liveBox}) => {
    const {width, height} = target
    const margin = TOLERANCES.tileMargin
    const edges = edgeMap(target)
    const allRows = {start: 0, end: height - 1}
    const tileColumns = clamp({from: liveBox.x - margin, to: liveBox.x + liveBox.w + margin, size: width})
    const tileRows = clamp({from: liveBox.y - margin, to: liveBox.y + liveBox.h + margin, size: height})
    const band = clamp({from: liveBox.y, to: liveBox.y + liveBox.h, size: height})
    if (tileColumns === null || tileRows === null || band === null) return {targetBox: null}
    if (density({edges, width, columns: tileColumns, rows: tileRows}) < MIN_EDGE_DENSITY) return {targetBox: null}
    const columns = chooseSpan({
      runs: findRuns(projection({edges, width, columns: {start: 0, end: width - 1}, rows: band, byColumn: true})),
      from: liveBox.x,
      to: liveBox.x + liveBox.w,
    })
    if (columns === null) return {targetBox: null}
    const columnsInterior = interior(columns)
    if (columnsInterior === null) return {targetBox: null}
    const rows = chooseSpan({
      runs: findRuns(projection({edges, width, columns: columnsInterior, rows: allRows, byColumn: false})),
      from: liveBox.y,
      to: liveBox.y + liveBox.h,
    })
    if (rows === null) return {targetBox: null}
    const box: Box = {
      x: columns.start + 1,
      y: rows.start + 1,
      w: columns.end - columns.start - 1,
      h: rows.end - rows.start - 1,
    }
    return {targetBox: box.w > 0 && box.h > 0 ? box : null}
  },
}

const LiveComponentTreeSchema: z.ZodType<LiveComponent> = z.object({
  source: SourceLocSchema.nullable(),
  tag: z.string(),
  text: z.string(),
  box: BoxSchema,
  textBox: BoxSchema.nullable(),
  glyphs: z.array(GlyphSchema),
  axis: z.enum(['row', 'column']).nullable(),
  columns: z.number().nullable(),
  styles: LiveStylesSchema,
  index: z.number(),
  path: z.string(),
  get children() {
    return z.array(LiveComponentTreeSchema)
  },
})

const MeasureReplySchema = MeasureResultSchema.extend({components: z.array(LiveComponentTreeSchema)})

async function measure(input: {
  width?: number
  height?: number
  timeout?: number
  page: ServerToolPageAccess
}): Promise<LiveCapture> {
  const {width, height, page} = input
  const reply = MeasureReplySchema.parse(
    await page.call(measureDef.name, {
      ...(width === undefined ? {} : {width}),
      ...(height === undefined ? {} : {height}),
      timeout: input.timeout ?? TOLERANCES.measureTimeoutMs,
    }),
  )
  return {
    raster: decodePng(Buffer.from(reply.image, 'base64')),
    viewport: {width: reply.width, height: reply.height},
    route: reply.route,
    components: reply.components,
    capturePath: reply.capturePath,
    source: reply.source,
    masks: reply.masks,
    ...(reply.limits === undefined ? {} : {limits: reply.limits}),
  }
}

function sourceConfidence(live: LiveCapture): number {
  if (live.limits === undefined || live.limits.inlineWidths === 0) return 1
  return TOLERANCES.inlineWidthConfidence
}

function clip(input: {box: Box; to: Box}): Box {
  const {box, to} = input
  const x = Math.max(box.x, to.x)
  const y = Math.max(box.y, to.y)
  return {x, y, w: Math.min(box.x + box.w, to.x + to.w) - x, h: Math.min(box.y + box.h, to.y + to.h) - y}
}

function shift(input: {box: Box; by: Box}): Box {
  return {...input.box, x: input.box.x + input.by.x, y: input.box.y + input.by.y}
}

function sameGeometry(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  const edges = [a.x - b.x, a.y - b.y, a.x + a.w - b.x - b.w, a.y + a.h - b.y - b.h]
  return edges.every((edge) => Math.abs(edge) <= TOLERANCES.geometryPx)
}

function sourceKey(component: LiveComponent): string | null {
  const {source} = component
  return source === null ? null : `${source.file}:${source.line}:${source.column}`
}

function componentSelector(input: {component: LiveComponent; parent: Pair | null; shared: boolean}): string {
  const {component, parent, shared} = input
  const key = sourceKey(component)
  if (key === null) return parent === null ? component.tag : `${parent.selector} > ${component.tag}`
  const selector = `[${SOURCE_ATTR}="${key}"]`
  return shared ? `${selector}:nth-child(${component.index})` : selector
}

type Pages = {live: Raster; target: Raster; blurredLive: Raster; blurredTarget: Raster; page: Box}

function tileMismatch(input: {pages: Pages; box: Box; comparators: Comparators}): number {
  const {pages, box, comparators} = input
  const tile = expand({box, by: TOLERANCES.tileMargin})
  const a = crop({raster: pages.blurredLive, box: tile}).raster
  const b = crop({raster: pages.blurredTarget, box: tile}).raster
  return comparators.pixel.compare({a, b}).mismatch
}

function estimateTarget(input: {pages: Pages; box: Box; parent: Pair | null; comparators: Comparators}): Box | null {
  const {pages, box, parent, comparators} = input
  const window = parent?.targetBox ? expand({box: parent.targetBox, by: TOLERANCES.tileMargin}) : pages.page
  const target = crop({raster: pages.target, box: window})
  const live = crop({raster: pages.live, box: window})
  const origin = target.box
  const {targetBox} = comparators.geometry.estimate({
    live: live.raster,
    target: target.raster,
    liveBox: {...box, x: box.x - origin.x, y: box.y - origin.y},
  })
  return targetBox === null ? null : shift({box: targetBox, by: origin})
}

function colorAgrees(input: {pages: Pages; pair: Pair; comparators: Comparators}): boolean {
  const {pages, pair, comparators} = input
  const declared = pair.live.styles.background
  if (pair.targetBox === null || !isOpaqueHex(declared)) return true
  const sampled = sampledFills({
    raster: pages.target,
    box: pair.targetBox,
    glyphs: [pair.targetBox],
    color: comparators.color,
  }).background
  return comparators.color.distance({a: declared, b: sampled}) <= TOLERANCES.declaredColorDeltaE
}

function matchPairs(input: {
  components: LiveComponent[]
  parent: Pair | null
  depth: number
  maxDepth: number
  pages: Pages
  comparators: Comparators
}): Pair[] {
  const {components, parent, depth, maxDepth, pages, comparators} = input
  const keys = components.map(sourceKey)
  const siblings = components.flatMap((component, position): Pair[] => {
    const liveBox = clip({box: component.box, to: pages.page})
    if (liveBox.w <= 0 || liveBox.h <= 0) return []
    const mismatch = tileMismatch({pages, box: liveBox, comparators})
    const equal = mismatch < TOLERANCES.tileGate
    const key = keys[position] ?? null
    const shared = key !== null && keys.indexOf(key) !== keys.lastIndexOf(key)
    return [
      {
        live: component,
        selector: componentSelector({component, parent, shared}),
        liveBox,
        targetBox: equal ? liveBox : estimateTarget({pages, box: liveBox, parent, comparators}),
        mismatch,
        depth,
        parent,
        prev: null,
        next: null,
      },
    ]
  })
  siblings.forEach((pair, index) => {
    pair.prev = siblings[index - 1] ?? null
    pair.next = siblings[index + 1] ?? null
  })
  return siblings.flatMap((pair) => {
    const descend =
      depth < maxDepth &&
      pair.mismatch >= TOLERANCES.tileGate &&
      pair.targetBox !== null &&
      sameGeometry({a: pair.liveBox, b: pair.targetBox}) &&
      colorAgrees({pages, pair, comparators})
    if (!descend) return [pair]
    return [
      pair,
      ...matchPairs({components: pair.live.children, parent: pair, depth: depth + 1, maxDepth, pages, comparators}),
    ]
  })
}

const tileMatcher: Matcher = {
  name: 'tile',
  match: ({live, target, comparators, depth}) => {
    const page: Box = {
      x: 0,
      y: 0,
      w: Math.min(live.raster.width, target.raster.width),
      h: Math.min(live.raster.height, target.raster.height),
    }
    const liveRaster = crop({raster: live.raster, box: page}).raster
    const targetRaster = crop({raster: target.raster, box: page}).raster
    const pages: Pages = {
      live: liveRaster,
      target: targetRaster,
      blurredLive: boxBlur({raster: liveRaster, radius: TOLERANCES.blurRadius}),
      blurredTarget: boxBlur({raster: targetRaster, radius: TOLERANCES.blurRadius}),
      page,
    }
    const whole = comparators.pixel.compare({a: pages.blurredLive, b: pages.blurredTarget})
    const pairs = matchPairs({components: live.components, parent: null, depth: 1, maxDepth: depth, pages, comparators})
    return {
      mismatch: whole.mismatch,
      mask: whole.mask,
      pairs,
      matchedTargetBoxes: pairs.flatMap((pair) => pair.targetBox ?? []),
    }
  },
}

type Item = {side: 'live' | 'target'; text: string; boxes: Box[]; owner: LiveComponent | null}
type Grouped = {group: TextGroup; mask: Box[]}

function flattened(components: LiveComponent[]): LiveComponent[] {
  return components.flatMap((component) => [component, ...flattened(component.children)])
}

function readingOrder(a: Item, b: Item): number {
  const first = a.boxes[0]
  const second = b.boxes[0]
  if (first === undefined || second === undefined) return 0
  if (sameLine({a: first, b: second})) return first.x - second.x
  return first.y - second.y
}

function joined(items: Item[]): string {
  return items
    .map((item) => item.text.trim())
    .filter((text) => text !== '')
    .join(' ')
}

function folded(text: string): string {
  return [...text.toLowerCase()].filter((character) => character.trim() !== '').join('')
}

function inkColor(input: {raster: Raster; boxes: Box[]; color: ColorMetric}): string | null {
  const {raster, boxes, color} = input
  const box = expand({box: union(boxes), by: TOLERANCES.tileMargin})
  const tile = crop({raster, box}).raster
  const background = medianColor({raster: tile, exclude: edgeMap(tile)})
  return glyphCoreColor({raster, box, glyphs: boxes, background, color})
}

function inkAgrees(input: {
  live: Raster
  target: Raster
  liveBoxes: Box[]
  targetBoxes: Box[]
  color: ColorMetric
}): boolean {
  const {color} = input
  const a = inkColor({raster: input.live, boxes: input.liveBoxes, color})
  const b = inkColor({raster: input.target, boxes: input.targetBoxes, color})
  return a !== null && b !== null && color.distance({a, b}) <= TOLERANCES.colorDeltaE
}

function placeAgrees(input: {liveBoxes: Box[]; targetBoxes: Box[]}): boolean {
  const a = union(input.liveBoxes)
  const b = union(input.targetBoxes)
  const edges = [a.x - b.x, a.y - b.y, a.x + a.w - b.x - b.w, a.y + a.h - b.y - b.h]
  return edges.every((edge) => Math.abs(edge) <= TOLERANCES.geometryPx)
}

function intersection(input: {a: Box; b: Box}): Box | null {
  const {a, b} = input
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const w = Math.min(a.x + a.w, b.x + b.w) - x
  const h = Math.min(a.y + a.h, b.y + b.h) - y
  return w > 0 && h > 0 ? {x, y, w, h} : null
}

function words(text: string): string[] {
  return [...text]
    .map((character) => (character.trim() === '' ? ' ' : character))
    .join('')
    .split(' ')
    .filter((word) => word !== '')
}

function foundAt(input: {wanted: string[]; among: string[]; from: number}): number | undefined {
  const {wanted, from} = input
  const folds = input.among.map((word) => word.toLowerCase())
  return range(from, Math.max(from, folds.length - wanted.length + 1)).find((start) =>
    wanted.every((word, offset) => folds[start + offset] === word.toLowerCase()),
  )
}

function misaligned(input: {liveItems: Item[]; targetText: string}): {item: Item; remainder: string} | null {
  const target = words(input.targetText)
  const walk = input.liveItems.reduce<{cursor: number; missing: Item | null}>(
    (state, item) => {
      if (state.missing !== null) return state
      const wanted = words(item.text)
      const at = foundAt({wanted, among: target, from: state.cursor})
      return at === undefined ? {cursor: state.cursor, missing: item} : {cursor: at + wanted.length, missing: null}
    },
    {cursor: 0, missing: null},
  )
  if (walk.missing === null) return null
  return {item: walk.missing, remainder: target.slice(walk.cursor).join(' ')}
}

type Constituent = {item: Item; trimmed: Box[]; agrees: boolean}

function constituent(input: {item: Item; live: Raster; target: Raster; color: ColorMetric}): Constituent {
  const {item, live, target, color} = input
  const trimmed = item.boxes.map((box) => trimToInk({raster: live, box}))
  const agrees = inkAgrees({live, target, liveBoxes: trimmed, targetBoxes: item.boxes, color})
  return {item, trimmed, agrees}
}

function maskedBoxes(input: {constituent: Constituent; targetBoxes: Box[]}): Box[] {
  const {constituent: part, targetBoxes} = input
  const reach = part.trimmed.map((box) => expand({box, by: TOLERANCES.geometryPx}))
  const target = targetBoxes.flatMap((a) => reach.flatMap((b) => intersection({a, b}) ?? []))
  return [...part.trimmed, ...target]
}

function connected(items: Item[]): Item[][] {
  const parent = items.map((_, index) => index)
  const root = (index: number): number => {
    const above = parent[index] ?? index
    if (above === index) return index
    const top = root(above)
    parent[index] = top
    return top
  }
  items.forEach((item, index) => {
    range(index + 1, items.length).forEach((next) => {
      const touching = item.boxes.some((a) => items[next]?.boxes.some((b) => overlapping({a, b})) === true)
      if (touching) parent[root(next)] = root(index)
    })
  })
  const byRoot = groupBy(range(items.length), (index) => String(root(index)))
  return Object.values(byRoot).map((indexes) => indexes.flatMap((index) => items[index] ?? []))
}

function agreement(input: {parts: Constituent[]; targetBoxes: Box[]; sameText: boolean}): {
  agrees: boolean
  mask: Box[]
} {
  const {parts, targetBoxes, sameText} = input
  const samePlace = placeAgrees({liveBoxes: parts.flatMap((part) => part.trimmed), targetBoxes})
  if (!sameText || !samePlace) return {agrees: false, mask: []}
  const agreeing = parts.filter((part) => part.agrees)
  return {
    agrees: agreeing.length === parts.length,
    mask: agreeing.flatMap((part) => maskedBoxes({constituent: part, targetBoxes})),
  }
}

function attributed(input: {group: TextGroup; liveItems: Item[]; sameText: boolean}): TextGroup {
  const {group, liveItems, sameText} = input
  const missing = sameText ? null : misaligned({liveItems, targetText: group.targetText})
  if (missing === null || missing.item.owner === null) return group
  return {...group, liveText: missing.item.text.trim(), targetText: missing.remainder, owner: missing.item.owner}
}

function toGroup(input: {members: Item[]; live: Raster; target: Raster; color: ColorMetric}): Grouped | null {
  const {live, target, color} = input
  const sorted = input.members.toSorted(readingOrder)
  const liveItems = sorted.filter((item) => item.side === 'live')
  const targetItems = sorted.filter((item) => item.side === 'target')
  const owner = liveItems[0]?.owner ?? null
  if (owner === null || targetItems.length === 0) return null
  const targetBoxes = targetItems.flatMap((item) => item.boxes)
  const liveText = joined(liveItems)
  const targetText = joined(targetItems)
  const sameText = folded(liveText) === folded(targetText)
  const parts = liveItems.map((item) => constituent({item, live, target, color}))
  const {agrees, mask} = agreement({parts, targetBoxes, sameText})
  const liveBoxes = liveItems.flatMap((item) => item.boxes)
  const group = {live: liveBoxes, target: targetBoxes, liveText, targetText, agrees, owner}
  return {group: attributed({group, liveItems, sameText}), mask}
}

function textDiffers(group: TextGroup): boolean {
  return folded(group.liveText) !== folded(group.targetText)
}

export function groupText(input: {
  components: LiveComponent[]
  runs: TextRun[]
  live: Raster
  target: Raster
  color: ColorMetric
}): {groups: TextGroup[]; agreeing: Box[]} {
  const {components, runs, live, target, color} = input
  if (runs.length === 0) return {groups: [], agreeing: []}
  const liveItems = flattened(components).flatMap((owner) =>
    owner.glyphs.map((glyph): Item => ({side: 'live', text: glyph.text, boxes: glyph.boxes, owner})),
  )
  const targetItems = runs.map((run): Item => ({side: 'target', text: run.text, boxes: [run.box], owner: null}))
  const grouped = connected([...liveItems, ...targetItems]).flatMap(
    (members) => toGroup({members, live, target, color}) ?? [],
  )
  return {groups: grouped.map(({group}) => group), agreeing: grouped.flatMap(({mask}) => mask)}
}

const BLANK_DENSITY = 0.01

function large(box: Box): boolean {
  return box.w >= TOLERANCES.unmatchedMinimum && box.h >= TOLERANCES.unmatchedMinimum
}

function blank(input: {raster: Raster; box: Box}): boolean {
  return edgeDensity(edgeMap(crop(input).raster)) < BLANK_DENSITY
}

function zeroed(input: {edges: Uint8Array; width: number; height: number; boxes: Box[]}): Uint8Array {
  const {edges, width, height, boxes} = input
  boxes.forEach((box) => {
    const area = expand({box, by: TOLERANCES.tileMargin})
    const x0 = Math.max(0, Math.floor(area.x))
    const x1 = Math.min(width, Math.ceil(area.x + area.w))
    for (let y = Math.max(0, Math.floor(area.y)); y < Math.min(height, Math.ceil(area.y + area.h)); y += 1) {
      if (x1 > x0) edges.fill(0, y * width + x0, y * width + x1)
    }
  })
  return edges
}

function unmatchedRegions(input: {target: TargetModel; matched: Box[]; pairs: Pair[]; live: LiveCapture}): Unmatched[] {
  const {target, matched, pairs, live} = input
  const {width, height} = target.raster
  const minimum = TOLERANCES.unmatchedMinimum
  const missing = findRegions({
    mask: zeroed({edges: edgeMap(target.raster), width, height, boxes: matched}),
    width,
    height,
    minSize: minimum,
  })
    .filter(large)
    .map((box): Unmatched => ({kind: 'missing', target: box}))
  const extras = new Set<Pair>()
  pairs.forEach((pair) => {
    if (pair.parent !== null && extras.has(pair.parent)) return
    if (!large(pair.liveBox)) return
    if (!blank({raster: target.raster, box: pair.liveBox}) || blank({raster: live.raster, box: pair.liveBox})) return
    extras.add(pair)
  })
  const extra = [...extras].map((pair): Unmatched => ({
    kind: 'extra',
    live: pair.liveBox,
    ...(pair.live.source === null ? {} : {source: pair.live.source}),
  }))
  return [...missing, ...extra]
}

type TextVerdict = 'text' | 'sample-data' | null

function textDelta(input: {live: LiveRole; target: Role; equal: boolean}): TextVerdict {
  const {live, target, equal} = input
  switch (live) {
    case 'expression':
      return null
    case 'mixed':
      return target === 'unknown' && !equal ? 'text' : null
    case 'literal':
      if (equal) return target === 'unknown' ? null : 'sample-data'
      return target === 'placeholder' ? null : 'text'
  }
}

type RouteItem = NonNullable<DiffReport['route']>

const HINT = 'no element carries data-conciv-source; the page is not a dev build compiled by the conciv plugin'
const ORIGIN_HINT = 'the conciv engine origin is unknown, so xray is a path on the engine and not a full url'
const MISMATCH_PRECISION = 10_000

async function currentTarget(input: {design: DesignRuntime; session: string}): Promise<TargetRecord> {
  const record = await input.design.store.current({session: input.session})
  if (record !== null) return record
  throw toolError('no-target', {message: NO_TARGET_MESSAGE})
}

async function otherRoute(input: {record: TargetRecord; page: ServerToolPageAccess}): Promise<RouteItem | null> {
  const target = input.record.route
  if (target === undefined) return null
  const live = await liveRoute(input.page).catch(() => null)
  if (live === null) return null
  const compared = target.includes('?') ? live : pathnameIn(live)
  return compared === target ? null : {live, target}
}

function refused(input: {record: TargetRecord; route: RouteItem; xray: XrayLink}): DiffReport {
  const {record, route, xray} = input
  return {
    target: {id: record.id, ...(record.route === undefined ? {} : {route: record.route}), width: record.width},
    mismatch: 0,
    diffImage: '',
    livePath: '',
    xray: xray.url,
    components: [],
    unmatched: [],
    warnings: [],
    sources: [],
    route,
    hint: `the tab shows ${route.live} but the design target is the design of ${route.target}; navigate the tab to ${route.target}, then diff again`,
  }
}

function paintDiff(input: {live: Raster; mask: Uint8Array; width: number}): Raster {
  const {live, mask, width} = input
  const data = new Uint8Array(live.data)
  mask.forEach((value, index) => {
    if (value !== 1) return
    const x = index % width
    const y = (index - x) / width
    data.set([255, 0, 0, 255], (y * live.width + x) * 4)
  })
  return {width: live.width, height: live.height, data}
}

function rounded(mismatch: number): number {
  return Math.round(mismatch * MISMATCH_PRECISION) / MISMATCH_PRECISION
}

function pairArea(pair: Pair): number {
  return pair.liveBox.w * pair.liveBox.h
}

type Ranked = {pair: Pair; report: ComponentReport}

function measured(ranked: Ranked): number {
  return ranked.report.deltas.length > 0 ? 1 : 0
}

async function resolveWinners(input: {
  wanted: ReturnType<typeof lookups>
  width: number
  height: number
  page: ServerToolPageAccess
}): Promise<WinnerResult> {
  const groups = groupBy(
    uniqBy(input.wanted, (lookup) => lookup.property),
    (lookup) => lookup.owner.selector,
  )
  const results = await Promise.all(
    Object.entries(groups).map(async ([selector, group]) =>
      WinnerResultSchema.parse(
        await input.page.call(winnerDef.name, {
          selector,
          properties: group.map((lookup) => lookup.property),
          width: input.width,
          height: input.height,
        }),
      ),
    ),
  )
  return Object.fromEntries(results.flatMap((result) => Object.entries(result)))
}

async function attribute(input: {
  ranked: Ranked
  design: DesignRuntime
  page: ServerToolPageAccess
  cssMap: CssMap
  width: number
  height: number
}): Promise<ComponentReport> {
  const {ranked, design, page, cssMap} = input
  const {pair, report} = ranked
  const winners = await resolveWinners({
    wanted: report.deltas.flatMap((delta) => lookups({delta, pair})),
    width: input.width,
    height: input.height,
    page,
  })
  const deltas = await Promise.all(
    report.deltas.map(async (delta) => {
      if (delta.kind === 'text') return sourced({delta, pair})
      const [found] = lookups({delta, pair}).flatMap(({property, owner}) => {
        const winner = winners[property]
        return winner === null || winner === undefined || winner.inherited ? [] : [{property, winner, owner}]
      })
      if (found === undefined) return delta
      const provenance = await mapDeclaration({
        winner: found.winner,
        property: found.property,
        component: found.owner.live,
        target: delta.target,
        cwd: design.cwd,
        cssMap,
        mappers: design.mappers,
      })
      return {...delta, ...provenance}
    }),
  )
  return {...report, deltas}
}

async function withProvenance(input: {
  ranked: Ranked[]
  design: DesignRuntime
  page: ServerToolPageAccess
  width: number
  height: number
}): Promise<ComponentReport[]> {
  const {ranked, design, page, width, height} = input
  if (ranked.length === 0) return []
  const cssMap = await design.cssMap()
  return Promise.all(ranked.map((entry) => attribute({ranked: entry, design, page, cssMap, width, height})))
}

function targetRuns(target: TargetModel): TextRun[] {
  return target.nodes.flatMap((node) => (node.kind === 'text' ? [{box: node.box, text: node.text}] : []))
}

function boxKey(box: Box): string {
  return `${box.x},${box.y},${box.w},${box.h}`
}

function groupRole(input: {group: TextGroup; roles: Map<string, Role>}): Role {
  const found = new Set(input.group.target.map((box) => input.roles.get(boxKey(box)) ?? 'unknown'))
  const [only] = found
  return found.size === 1 && only !== undefined ? only : 'unknown'
}

function literalsAgree(input: {live: LiveText; group: TextGroup}): boolean {
  const {live, group} = input
  if (live.role !== 'mixed') return !textDiffers(group)
  const target = folded(group.targetText)
  return live.literals.every((literal) => target.includes(folded(literal)))
}

async function verdicts(input: {
  groups: TextGroup[]
  target: TargetModel
  cwd: string
}): Promise<Map<TextGroup, TextVerdict>> {
  const {groups, target, cwd} = input
  const roles = new Map(
    target.nodes.flatMap((node): [string, Role][] =>
      node.kind === 'text' ? [[boxKey(node.box), node.role ?? 'unknown']] : [],
    ),
  )
  const judged = await Promise.all(
    groups.map(async (group): Promise<[TextGroup, TextVerdict]> => {
      const live = await readLiveText({cwd, source: group.owner.source})
      const role = groupRole({group, roles})
      const equal = live === null ? !textDiffers(group) : literalsAgree({live, group})
      return [group, textDelta({live: live?.role ?? 'literal', target: role, equal})]
    }),
  )
  return new Map(judged)
}

function warnings(input: {groups: TextGroup[]; judged: Map<TextGroup, TextVerdict>}): Delta[] {
  return input.groups
    .filter((group) => input.judged.get(group) === 'sample-data')
    .map((group) => {
      const delta: Delta = {kind: 'text', live: group.liveText, target: group.targetText, warning: 'sample-data'}
      const {source} = group.owner
      return source === null
        ? delta
        : {...delta, via: 'source', file: source.file, line: source.line, column: source.column}
    })
}

function ownedTargetGlyphs(input: {groups: TextGroup[]; pair: Pair}): Box[] {
  return input.groups.filter((group) => group.owner === input.pair.live).flatMap((group) => group.target)
}

function textDeltas(input: {groups: TextGroup[]; pair: Pair; judged: Map<TextGroup, TextVerdict>}): Delta[] {
  return input.groups
    .filter((group) => group.owner === input.pair.live && input.judged.get(group) === 'text')
    .map((group) => ({kind: 'text', live: group.liveText, target: group.targetText}))
}

function sourced(input: {delta: Delta; pair: Pair}): Delta {
  const {source} = input.pair.live
  if (source === null) return input.delta
  return {...input.delta, via: 'source', file: source.file, line: source.line, column: source.column}
}

function reportHint(input: {attributed: boolean; absolute: boolean}): {hint?: string} {
  const hints = [input.attributed ? null : HINT, input.absolute ? null : ORIGIN_HINT].filter((hint) => hint !== null)
  return hints.length === 0 ? {} : {hint: hints.join('; ')}
}

async function runDiff(request: {
  input: DiffInput
  session: string
  design: DesignRuntime
  page: ServerToolPageAccess
}): Promise<DiffReport> {
  const {input, session, design, page} = request
  const record = await currentTarget({design, session})
  const xray = design.xrayUrl({id: record.id, session})
  const route = await otherRoute({record, page})
  if (route !== null) return refused({record, route, xray})
  const target = await design.store.model(record.id)
  const reading = await measure({width: record.width, height: record.height, page})
  const live = {...reading, raster: paintOver({onto: reading.raster, from: target.raster, boxes: reading.masks})}
  const stamp = {source: live.source, confidence: sourceConfidence(live), width: record.width}
  const {groups, agreeing} = groupText({
    components: live.components,
    runs: targetRuns(target),
    live: live.raster,
    target: target.raster,
    color: design.comparators.color,
  })
  const judged = await verdicts({groups, target, cwd: design.cwd})
  await estimateTypography({groups, target, id: record.id, store: design.store, page, color: design.comparators.color})
  const masked = paintOver({
    onto: live.raster,
    from: target.raster,
    boxes: agreeing.map((box) => expand({box, by: TOLERANCES.glyphHalo + TOLERANCES.blurRadius})),
  })
  const matched = design.matcher.match({
    live: {...live, raster: masked},
    target,
    comparators: design.comparators,
    depth: input.depth,
  })
  const pageBox = {x: 0, y: 0, w: live.viewport.width, h: live.viewport.height}
  const reported = matched.pairs.filter((pair) => pair.mismatch >= TOLERANCES.tileGate)
  const ranked = reported
    .map((pair): Ranked => {
      const children = matched.pairs.filter((child) => child.parent === pair)
      const color = design.comparators.color
      const liveGlyphs = pair.live.glyphs.flatMap((glyph) => glyph.boxes)
      const targetGlyphs = ownedTargetGlyphs({groups, pair})
      const liveSide = sideFrom({
        pair,
        from: 'live',
        children,
        page: pageBox,
        raster: live.raster,
        color,
        glyphs: liveGlyphs,
      })
      const targetSide = sideFrom({
        pair,
        from: 'target',
        children,
        page: pageBox,
        raster: target.raster,
        color,
        glyphs: targetGlyphs,
      })
      const kinds =
        liveSide === null || targetSide === null
          ? []
          : design.deltaKinds.flatMap((kind) =>
              kind.measure({live: liveSide, target: targetSide, color: design.comparators.color}),
            )
      const deltas = [...kinds, ...textDeltas({groups, pair, judged})].map((delta) => ({...delta, ...stamp}))
      return {
        pair,
        report: {
          source: pair.live.source,
          tag: pair.live.tag,
          selector: pair.selector,
          live: pair.liveBox,
          target: pair.targetBox,
          mismatch: rounded(pair.mismatch),
          deltas,
          children: reported.filter((child) => child.parent === pair).length,
        },
      }
    })
    .filter(({report}) => report.deltas.length > 0 || report.children === 0)
    .toSorted(
      (a, b) => measured(b) - measured(a) || b.pair.mismatch * pairArea(b.pair) - a.pair.mismatch * pairArea(a.pair),
    )
    .slice(0, input.limit)
  const components = await withProvenance({ranked, design, page, width: record.width, height: record.height})
  return design.store.writeRun({
    id: record.id,
    live: live.raster,
    diff: paintDiff({live: masked, mask: matched.mask, width: Math.min(live.raster.width, target.raster.width)}),
    result: {
      target: {id: record.id, ...(record.route === undefined ? {} : {route: record.route}), width: record.width},
      xray: xray.url,
      mismatch: rounded(matched.mismatch),
      components,
      unmatched: unmatchedRegions({target, matched: matched.matchedTargetBoxes, pairs: matched.pairs, live}),
      warnings: warnings({groups, judged}).map((delta) => ({...delta, ...stamp})),
      segmentation: segmentationQuality(target),
      capturePath: live.capturePath,
      sources: [live.source],
      ...(live.limits === undefined ? {} : {limits: live.limits}),
      ...reportHint({attributed: live.components.length > 0, absolute: xray.absolute}),
    },
  })
}

function runTime(report: DiffReport): number | null {
  const at = Number(basename(report.livePath).split('-')[1])
  return Number.isFinite(at) ? at : null
}

async function targetStatus(input: {store: TargetStore; session: string}): Promise<StatusReport> {
  const {store} = input
  const record = await store.current({session: input.session})
  if (record === null) return {targets: [], done: false}
  const report = await store.lastResult(record.id)
  const reregister = await store.model(record.id).then(
    () => false,
    () => true,
  )
  const lastAt = report === null ? null : runTime(report)
  const above = report === null ? 0 : aboveTolerance(report)
  const done = !reregister && lastAt !== null && above === 0
  return {
    ...(record.route === undefined ? {} : {route: record.route}),
    targets: [{id: record.id, width: record.width, mismatch: report?.mismatch ?? null, above, lastAt}],
    done,
    ...(done ? {} : {next: DESIGN_GUIDE}),
    ...(reregister ? {reregister} : {}),
  }
}

const captureStep: ServerStep<CaptureInput, CaptureResult> = async (input, ctx, _request, page) => {
  const live = await measure({height: input.height, timeout: input.timeout, page})
  const path = await ctx.design.store.writeCapture({png: encodePng(live.raster)})
  return {path, width: live.raster.width, height: live.raster.height, route: live.route, components: live.components}
}

const clearStep: ServerStep<ClearInput, ClearResult> = async (input, ctx, request) => {
  const {store} = ctx.design
  const id = input.target ?? (await store.current({session: request.sessionId}))?.id
  return {removed: await store.remove(input.all === true ? {all: true} : {id})}
}

const winnerStep: ServerStep<WinnerInput, WinnerResult> = async (input, _ctx, _request, page) =>
  WinnerResultSchema.parse(await page.call(winnerDef.name, input))

export function createDiffer(input: {runtime: DesignRuntime; store: TargetStore; page: DesignPage}): Differ {
  const {store, page} = input
  const design = {...input.runtime, store}
  const tab = (session: SessionId): ServerToolPageAccess => ({
    call: (name, query) => page.ask({sessionId: session, name, input: query}),
  })
  return {
    register: ({input: target, session}) => registerTarget({input: target, session, design, page: tab(session)}),
    run: ({input: query, session}) => runDiff({input: query, session, design, page: tab(session)}),
    status: ({session}) => targetStatus({store, session}),
  }
}

export const SERVER_STEPS = [
  targetDef.server((input, ctx: DesignContext, request) => ctx.differ.register({input, session: request.sessionId})),
  diffDef.server((input, ctx: DesignContext, request) => ctx.differ.run({input, session: request.sessionId})),
  statusDef.server((_input, ctx: DesignContext, request) => ctx.differ.status({session: request.sessionId})),
  captureDef.server(captureStep),
  winnerDef.server(winnerStep),
  clearDef.server(clearStep),
] as const satisfies readonly AnyToolBuilder[]

export const PIXEL_COMPARATORS = {
  blazediff: blazediffComparator,
  pixelmatch: pixelmatchComparator,
} as const satisfies Record<string, PixelComparator>

export const GEOMETRY = {'edge-projection': edgeProjection} as const satisfies Record<string, GeometryEstimator>

export const MATCHERS = {tile: tileMatcher} as const satisfies Record<string, Matcher>
