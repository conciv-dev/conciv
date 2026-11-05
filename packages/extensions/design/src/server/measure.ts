import {createHash} from 'node:crypto'
import {z} from 'zod'
import {ssim} from 'ssim.js'
import pixelmatch from 'pixelmatch'
import {diff} from '@blazediff/core'
import {differenceCiede2000, parse} from 'culori'
import {AsyncRetryer} from '@tanstack/pacer/async-retryer'
import {chunk, groupBy, mean, partition, range, uniqBy, zip} from 'es-toolkit'
import {isPageVerbError} from '@conciv/extension'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import {PAGE_PING_TOOL} from '@conciv/protocol/page-types'
import {
  BoxSchema,
  GlyphSchema,
  LiveStylesSchema,
  MeasureResultSchema,
  OpinionSchema,
  PLACEHOLDER_KINDS,
  RenderResultSchema,
  SourceLocSchema,
  measureDef,
  renderDef,
  type Box,
  type ColorMetric,
  type Geometry,
  type Grid,
  type LiveCapture,
  type LiveComponent,
  type MatchText,
  type MeasureSource,
  type Measurer,
  type PixelComparator,
  type Pixels,
  type Rgb,
  type Raster,
  type Reuse,
  type ScoredTile,
  type TextRun,
  type TileCache,
  type TileRecord,
  type Typography,
} from '../shared/defs.js'
import {rgbDistance, sameFamily, TOLERANCES, type DesignConfig} from '../shared/tolerances.js'
import {expand, overlaps, union} from '../shared/box.js'
import {createRaster} from './raster.js'

export function createMeasurer(input: {
  config: Pick<DesignConfig, 'comparator' | 'color'>
  geometry: Geometry
}): Measurer {
  const {geometry} = input
  const color = COLOR_METRICS[input.config.color]
  const comparator = PIXEL_COMPARATORS[input.config.comparator]
  return {
    color,
    comparator,
    connected: widgetConnected,
    route: liveRoute,
    measure: async (request) => {
      const reply = await askMeasure(request)
      return {
        capture: liveCapture(reply),
        ...(reply.longestTask === undefined ? {} : {longestTask: reply.longestTask}),
        ...(reply.pageError === undefined ? {} : {pageError: reply.pageError}),
      }
    },
    texts: (request) => agreeingText({...request, color}),
    typography: (request) => estimateTypography({...request, color, geometry}),
    sources: measuredSources,
    confidence: sourceConfidence,
    compare: (request) => comparePages({...request, comparator, geometry}),
    similarity: similarityTiles,
    mean: ({tiles, within}) =>
      meanSimilarity(within === undefined ? tiles : tiles.filter((tile) => centred({inner: tile.box, outer: within}))),
    paintOver,
    paintDiff,
    share: maskShare,
    reuse: reuseFrom,
  }
}

async function askMeasure(input: {
  width?: number
  height?: number
  timeout?: number
  page: ServerToolPageAccess
}): Promise<MeasureReply> {
  const {width, height, page} = input
  return MeasureReplySchema.parse(
    await page.call(measureDef.name, {
      ...(width === undefined ? {} : {width}),
      ...(height === undefined ? {} : {height}),
      timeout: input.timeout ?? TOLERANCES.measureTimeoutMs,
    }),
  )
}

const LiveComponentTreeSchema: z.ZodType<LiveComponent> = z.object({
  source: SourceLocSchema.nullable(),
  key: z.string().nullable(),
  instance: z.string().nullable().default(null),
  owner: z.string().nullable(),
  tag: z.string(),
  text: z.string(),
  box: BoxSchema,
  textBox: BoxSchema.nullable(),
  glyphs: z.array(GlyphSchema),
  axis: z.enum(['row', 'column']).nullable(),
  columns: z.number().nullable(),
  styles: LiveStylesSchema,
  role: z.string().nullable(),
  hints: z.array(z.string()),
  index: z.number(),
  path: z.string(),
  opinion: OpinionSchema.optional(),
  drawn: z.boolean().default(false),
  placeholder: z.enum(PLACEHOLDER_KINDS).nullable().default(null),
  get children() {
    return z.array(LiveComponentTreeSchema)
  },
})

const MeasureReplySchema = MeasureResultSchema.extend({components: z.array(LiveComponentTreeSchema)})

type MeasureReply = z.infer<typeof MeasureReplySchema>

function liveCapture(reply: MeasureReply): LiveCapture {
  return {
    raster: createRaster(Buffer.from(reply.image, 'base64')),
    viewport: {width: reply.width, height: reply.height},
    route: reply.route,
    components: reply.components,
    capturePath: reply.capturePath,
    source: reply.source,
    masks: reply.masks,
    opinion: reply.opinion,
    framework: reply.framework,
    ...(reply.limits === undefined ? {} : {limits: reply.limits}),
  }
}

function measuredSources(live: LiveCapture): MeasureSource[] {
  return live.opinion ? [live.source, 'takumi'] : [live.source]
}

function sourceConfidence(live: LiveCapture): number {
  if (live.limits === undefined || live.limits.inlineWidths === 0) return 1
  return TOLERANCES.inlineWidthConfidence
}

async function widgetConnected(page: ServerToolPageAccess): Promise<void> {
  const retryer = new AsyncRetryer(() => pingWidget(page), {
    backoff: 'fixed',
    baseWait: TOLERANCES.widgetPoll,
    maxAttempts: Math.ceil(TOLERANCES.widgetWait / TOLERANCES.widgetPoll) + 1,
    throwOnError: false,
  })
  await retryer.execute()
}

async function pingWidget(page: ServerToolPageAccess): Promise<void> {
  await page.call(PAGE_PING_TOOL, {}).catch((error: unknown) => {
    if (isPageVerbError(error) && error.code === 'no-widget') throw error
  })
}

async function liveRoute(page: ServerToolPageAccess): Promise<string> {
  const {pathname, search} = PageRouteSchema.parse(await page.call('page_route', {}))
  return `${pathname}${search}`
}

const PageRouteSchema = z.object({pathname: z.string(), search: z.string()})

function agreeingText(input: {
  components: LiveComponent[]
  runs: TextRun[]
  live: Raster
  target: Raster
  color: ColorMetric
  reuse: Reuse | null
}): {agreeing: Box[]; masks: Map<string, Box[]>} {
  const {components, runs, live, target, color, reuse} = input
  if (runs.length === 0) return {agreeing: [], masks: new Map()}
  const liveItems = flattened(components).flatMap((owner) =>
    owner.glyphs.map((glyph): TextItem => ({side: 'live', text: glyph.text, boxes: glyph.boxes, owner})),
  )
  const targetItems = runs.map((run): TextItem => ({side: 'target', text: run.text, boxes: [run.box], owner: null}))
  const masks = connected([...liveItems, ...targetItems]).map((members): [string, Box[]] => {
    const key = JSON.stringify(members.map((member) => [member.side, member.text, member.boxes]))
    const kept = reuse?.textMasks.get(key)
    const region = expand({box: union(members.flatMap((member) => member.boxes)), by: TOLERANCES.tileSide})
    if (kept !== undefined && reuse !== null && reuse.unchanged(region)) return [key, kept]
    return [key, toGroup({members, live, target, color})?.mask ?? []]
  })
  return {agreeing: masks.flatMap(([, mask]) => mask), masks: new Map(masks)}
}

type TextItem = {side: 'live' | 'target'; text: string; boxes: Box[]; owner: LiveComponent | null}

type Grouped = {group: TextGroup; mask: Box[]}

function flattened(components: LiveComponent[]): LiveComponent[] {
  return components.flatMap((component) => [component, ...flattened(component.children)])
}

function readingOrder(a: TextItem, b: TextItem): number {
  const first = a.boxes[0]
  const second = b.boxes[0]
  if (first === undefined || second === undefined) return 0
  const shared = Math.max(0, Math.min(first.y + first.h, second.y + second.h) - Math.max(first.y, second.y))
  return shared >= Math.min(first.h, second.h) / 2 ? first.x - second.x : first.y - second.y
}

function joined(items: TextItem[]): string {
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
  return raster.fills({box: expand({box: union(boxes), by: TOLERANCES.tileMargin}), glyphs: boxes, color}).foreground
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

function wordsOf(text: string): string[] {
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

function misaligned(input: {liveItems: TextItem[]; targetText: string}): {item: TextItem; remainder: string} | null {
  const target = wordsOf(input.targetText)
  const scan = input.liveItems.reduce<{cursor: number; missing: TextItem | null}>(
    (state, item) => {
      if (state.missing !== null) return state
      const wanted = wordsOf(item.text)
      const at = foundAt({wanted, among: target, from: state.cursor})
      return at === undefined ? {cursor: state.cursor, missing: item} : {cursor: at + wanted.length, missing: null}
    },
    {cursor: 0, missing: null},
  )
  if (scan.missing === null) return null
  return {item: scan.missing, remainder: target.slice(scan.cursor).join(' ')}
}

type Constituent = {item: TextItem; trimmed: Box[]; agrees: boolean}

function constituent(input: {item: TextItem; live: Raster; target: Raster; color: ColorMetric}): Constituent {
  const {item, live, target, color} = input
  const trimmed = item.boxes.map((box) => live.ink(box))
  const agrees = inkAgrees({live, target, liveBoxes: trimmed, targetBoxes: item.boxes, color})
  return {item, trimmed, agrees}
}

function maskedBoxes(input: {constituent: Constituent; targetBoxes: Box[]}): Box[] {
  const {constituent: part, targetBoxes} = input
  const reach = part.trimmed.map((box) => expand({box, by: TOLERANCES.geometryPx}))
  const target = targetBoxes.flatMap((a) => reach.flatMap((b) => intersection({a, b}) ?? []))
  return [...part.trimmed, ...target]
}

function connected(items: TextItem[]): TextItem[][] {
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
      const touching = item.boxes.some((a) => items[next]?.boxes.some((b) => overlaps({a, b})) === true)
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

function attributed(input: {group: TextGroup; liveItems: TextItem[]; sameText: boolean}): TextGroup {
  const {group, liveItems, sameText} = input
  const missing = sameText ? null : misaligned({liveItems, targetText: group.targetText})
  if (missing === null || missing.item.owner === null) return group
  return {...group, liveText: missing.item.text.trim(), targetText: missing.remainder, owner: missing.item.owner}
}

function toGroup(input: {members: TextItem[]; live: Raster; target: Raster; color: ColorMetric}): Grouped | null {
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

type Ink = {height: number; contrast: number}

type Render = {text: string; font: string; size: number; weight: number; color: string; background: string}

type TextNode = MatchText

type TypeJob = {node: TextNode; owner: LiveComponent; color: string; background: string; ink: Box; contrast: number}

type SizeFound = {size: number; confidence: number}

const REGULAR_WEIGHT = 400

const BOLD_WEIGHT = 700

const HALF_STEPS = 2

const MAX_CONTRAST = rgbDistance({a: [0, 0, 0], b: [255, 255, 255]})

const RENDERED = new Map<string, Ink>()

async function estimateTypography(input: {
  texts: {node: TextNode; owner: LiveComponent}[]
  raster: Raster
  page: ServerToolPageAccess
  color: ColorMetric
  geometry: Geometry
}): Promise<{estimates: Record<string, Typography>; skipped: number}> {
  const {page} = input
  const jobs = typeJobs(input)
  if (jobs.length === 0) return {estimates: {}, skipped: 0}
  const skippedKeys = new Set(await renderInks({page, renders: jobs.map(liveRender)}))
  const [skipped, rendered] = partition(jobs, (job) => skippedKeys.has(renderKey(liveRender(job))))
  const estimates = Object.fromEntries(await Promise.all(rendered.map((job) => estimate({job, page}))))
  return {estimates, skipped: skipped.length}
}

function typeJobs(input: {
  texts: {node: TextNode; owner: LiveComponent}[]
  raster: Raster
  color: ColorMetric
  geometry: Geometry
}): TypeJob[] {
  const {raster, geometry} = input
  return uniqBy(input.texts, (entry) => entry.node.id)
    .filter((entry) => needsEstimate({typography: entry.node.typography, live: entry.owner.styles.fontFamily}))
    .map(({node, owner}) => {
      const area = raster.crop({box: node.box, margin: TOLERANCES.typeHalo})
      const fills = raster.fills({box: area.box, glyphs: [node.box], color: input.color})
      const background = area.raster.rgb(0)
      const ink = ownInk({area, background, geometry})
      return {
        node,
        owner,
        color: fills.foreground ?? owner.styles.color,
        background: fills.background,
        ink,
        contrast: contrast({raster, box: ink, background}),
      }
    })
}

function needsEstimate(input: {typography: Typography | undefined; live: string}): boolean {
  const {typography} = input
  if (typography === undefined) return true
  if (typography.confidence === 1) return false
  return !sameFamily({a: typography.font, b: input.live})
}

function ownInk(input: {area: {raster: Raster; box: Box}; background: Rgb; geometry: Geometry}): Box {
  const {raster, box} = input.area
  const {width, height} = raster
  const mask = Uint8Array.from(range(width * height), (index) => {
    const pixel = raster.rgb(index)
    const apart = pixel.some(
      (channel, at) => Math.abs(channel - (input.background[at] ?? channel)) > TOLERANCES.inkTrimThreshold,
    )
    return apart ? 1 : 0
  })
  const inside = input.geometry
    .regions({mask, width, height})
    .regions.filter(
      (region) =>
        region.box.x > 0 &&
        region.box.y > 0 &&
        region.box.x + region.box.w < width &&
        region.box.y + region.box.h < height,
    )
  if (inside.length === 0) return raster.ink({x: 0, y: 0, w: width, h: height})
  const own = union(inside.map((region) => region.box))
  return {...own, x: own.x + box.x, y: own.y + box.y}
}

function liveRender(job: TypeJob): Render {
  return renderAt({job, size: job.owner.styles.fontSize, weight: job.owner.styles.fontWeight})
}

function renderAt(input: {job: TypeJob; size: number; weight: number}): Render {
  const {job} = input
  return {
    text: job.node.text,
    font: job.owner.styles.fontFamily,
    size: input.size,
    weight: input.weight,
    color: job.color,
    background: job.background,
  }
}

async function renderInks(input: {page: ServerToolPageAccess; renders: Render[]}): Promise<string[]> {
  const missing = uniqBy(
    input.renders.filter((render) => !RENDERED.has(renderKey(render))),
    renderKey,
  )
  return chunk(missing, TOLERANCES.renderChunk).reduce<Promise<string[]>>(
    async (before, renders) => [...(await before), ...(await renderChunk({page: input.page, renders}))],
    Promise.resolve([]),
  )
}

async function renderChunk(input: {page: ServerToolPageAccess; renders: Render[]}): Promise<string[]> {
  const reply = await input.page
    .call(renderDef.name, {renders: input.renders, timeout: TOLERANCES.measureTimeoutMs})
    .then((result) => RenderResultSchema.parse(result))
    .catch(() => null)
  if (reply === null) return input.renders.map(renderKey)
  zip(input.renders, reply.images).forEach(([render, image]) => {
    if (render === undefined || image === undefined) return
    RENDERED.set(renderKey(render), inkOf(createRaster(Buffer.from(image, 'base64'))))
  })
  return []
}

function renderKey(render: Render): string {
  return [render.text, render.font, render.color, render.background, render.size, render.weight].join('|')
}

function inkOf(raster: Raster): Ink {
  const box = raster.ink({x: 0, y: 0, w: raster.width, h: raster.height})
  return {height: box.h, contrast: contrast({raster, box, background: raster.rgb(0)})}
}

function contrast(input: {raster: Raster; box: Box; background: Rgb}): number {
  const {raster, box, background} = input
  const area = box.w * box.h
  if (area <= 0) return 0
  let total = 0
  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) {
      total += rgbDistance({a: raster.rgb(y * raster.width + x), b: background})
    }
  }
  return total / (area * MAX_CONTRAST)
}

async function estimate(input: {job: TypeJob; page: ServerToolPageAccess}): Promise<[string, Typography]> {
  const {job, page} = input
  const {fontSize, fontWeight, fontFamily, lineHeight} = job.owner.styles
  const found = await sizeFound({job, page, live: fontSize})
  const regular = await inkAt({page, render: renderAt({job, size: found.size, weight: REGULAR_WEIGHT})})
  const ratio = regular.contrast === 0 ? 1 : job.contrast / regular.contrast
  return [
    job.node.id,
    {
      size: found.size,
      lineHeight: (lineHeight * found.size) / fontSize,
      weight: weightBy({ratio, live: fontWeight}),
      confidence: found.confidence,
      font: fontFamily,
      family: null,
    },
  ]
}

async function inkAt(input: {page: ServerToolPageAccess; render: Render}): Promise<Ink> {
  await renderInks({page: input.page, renders: [input.render]})
  return RENDERED.get(renderKey(input.render)) ?? {height: 0, contrast: 0}
}

async function sizeFound(input: {job: TypeJob; page: ServerToolPageAccess; live: number}): Promise<SizeFound> {
  const {job, page, live} = input
  const wanted = job.ink.h
  const height = async (size: number): Promise<number> =>
    (await inkAt({page, render: renderAt({job, size, weight: job.owner.styles.fontWeight})})).height
  const atLive = await height(live)
  if (atLive === wanted) return {size: live, confidence: 1}
  const span = {from: TOLERANCES.typeSearchMin, to: TOLERANCES.typeSearchMax + 1}
  const low = await lowest({...span, test: async (size) => (await height(size)) >= wanted})
  const high = (await lowest({...span, test: async (size) => (await height(size)) > wanted})) - 1
  if (low <= high) return {size: (low + high) / 2, confidence: 1}
  const ratio = atLive === 0 ? 1 : wanted / atLive
  return {size: Math.round(live * ratio * HALF_STEPS) / HALF_STEPS, confidence: TOLERANCES.ratioConfidence}
}

async function lowest(input: {from: number; to: number; test: (size: number) => Promise<boolean>}): Promise<number> {
  if (input.from >= input.to) return input.from
  const middle = Math.floor((input.from + input.to) / 2)
  if (await input.test(middle)) return lowest({...input, to: middle})
  return lowest({...input, from: middle + 1})
}

function weightBy(input: {ratio: number; live: number}): number {
  if (input.ratio >= TOLERANCES.boldCoverage) return BOLD_WEIGHT
  if (input.ratio <= TOLERANCES.regularCoverage) return REGULAR_WEIGHT
  return input.live
}

type TextGroup = {
  live: Box[]
  target: Box[]
  liveText: string
  targetText: string
  agrees: boolean
  owner: LiveComponent
}

function reuseFrom(input: Parameters<Measurer['reuse']>[0]): ReturnType<Measurer['reuse']> {
  const {before, live, target} = input
  const width = Math.min(live.width, target.width)
  const height = Math.min(live.height, target.height)
  const grid = tileGrid({width, height, side: TOLERANCES.tileSide})
  const rawTiles = tileHashes({raster: live, grid, margin: COMPARE_REACH})
  if (before === null || !sameGrid({a: before.grid, b: grid})) return {grid, rawTiles, reuse: null}
  const changed = new Set(rawTiles.flatMap((hash, index) => (before.rawTiles[index] === hash ? [] : [index])))
  const reuse = {
    textMasks: before.textMasks,
    measures: before.measures,
    unchanged: (box: Box) => tilesUnder({grid, box}).every((index) => !changed.has(index)),
  }
  return {grid, rawTiles, reuse}
}

function comparePages(input: {
  live: Raster
  target: Raster
  comparator: PixelComparator
  previous: TileCache | null
  geometry: Geometry
}): {
  mismatch: number
  mask: Uint8Array
  width: number
  height: number
  tiles: TileCache
  carried: number
} {
  const {live, target, comparator, previous, geometry} = input
  const width = Math.min(live.width, target.width)
  const height = Math.min(live.height, target.height)
  const grid = tileGrid({width, height, side: TOLERANCES.tileSide})
  const hashes = tileHashes({raster: live, grid, margin: COMPARE_REACH})
  const reusable = previous !== null && sameGrid({a: previous, b: grid}) ? previous.tiles : []
  const boxes = hashes.map((_, index) => tileBox({grid, index}))
  const changed = hashes.flatMap((hash, index) => (reusable[index]?.hash === hash ? [] : [index]))
  const mask = new Uint8Array(width * height)
  reusable.forEach((tile, index) => {
    const box = boxes[index]
    if (box === undefined || tile.hash !== hashes[index] || tile.mask === undefined) return
    unpackMask({packed: tile.mask, mask, width, box})
  })
  compareAreas({
    clusters: clusters({grid, changed, geometry}).map((cluster) => cluster.flatMap((index) => boxes[index] ?? [])),
    width,
    height,
  }).forEach((area) => compareTiles({live, target, comparator, mask, width, ...area}))
  const tiles = hashes.map((hash, index): TileRecord => {
    const kept = reusable[index]
    if (kept !== undefined && kept.hash === hash) return kept
    const box = boxes[index] ?? {x: 0, y: 0, w: 0, h: 0}
    const count = maskCount({mask, width, box})
    return count === 0
      ? {hash, mismatch: 0}
      : {hash, mismatch: count / (box.w * box.h), mask: packMask({mask, width, box})}
  })
  const total = width * height
  const differing = tiles.reduce((sum, tile, index) => sum + Math.round(tile.mismatch * tileArea(boxes[index])), 0)
  const mismatch = total === 0 ? 0 : differing / total
  return {
    mismatch,
    mask,
    width,
    height,
    tiles: {side: grid.side, columns: grid.columns, rows: grid.rows, width, height, tiles},
    carried: hashes.length - changed.length,
  }
}

function clusters(input: {grid: Grid; changed: number[]; geometry: Geometry}): number[][] {
  const {grid, changed, geometry} = input
  const wanted = new Set(changed)
  const cells = Uint8Array.from(range(grid.columns * grid.rows), (index) => (wanted.has(index) ? 1 : 0))
  return geometry.regions({mask: cells, width: grid.columns, height: grid.rows}).regions.map(({box: region}) =>
    changed.filter((index) => {
      const column = index % grid.columns
      const row = (index - column) / grid.columns
      return column >= region.x && column < region.x + region.w && row >= region.y && row < region.y + region.h
    }),
  )
}

function tileArea(box: Box | undefined): number {
  return box === undefined ? 0 : box.w * box.h
}

function sameGrid(input: {a: Pick<Grid, 'side' | 'width' | 'height'>; b: Grid}): boolean {
  const {a, b} = input
  return a.side === b.side && a.width === b.width && a.height === b.height
}

type CompareArea = {area: Box; boxes: Box[]}

function compareAreas(input: {clusters: Box[][]; width: number; height: number}): CompareArea[] {
  const {width, height} = input
  return input.clusters
    .filter((boxes) => boxes.length > 0)
    .map((boxes): CompareArea => {
      const reach = expand({box: union(boxes), by: TOLERANCES.tileSide})
      const x = Math.max(0, reach.x)
      const y = Math.max(0, reach.y)
      return {
        area: {x, y, w: Math.min(width, reach.x + reach.w) - x, h: Math.min(height, reach.y + reach.h) - y},
        boxes,
      }
    })
    .reduce((kept: CompareArea[], next) => absorbed({kept, next}), [])
}

function absorbed(input: {kept: CompareArea[]; next: CompareArea}): CompareArea[] {
  const {kept, next} = input
  const [touching, apart] = partition(kept, (other) => intersection({a: other.area, b: next.area}) !== null)
  if (touching.length === 0) return [...kept, next]
  return absorbed({
    kept: apart,
    next: {
      area: union([next.area, ...touching.map((other) => other.area)]),
      boxes: [...next.boxes, ...touching.flatMap((other) => other.boxes)],
    },
  })
}

function compareTiles(input: {
  live: Raster
  target: Raster
  comparator: PixelComparator
  mask: Uint8Array
  width: number
  area: Box
  boxes: Box[]
}): void {
  const {live, target, comparator, mask, width, area, boxes} = input
  const a = boxBlur({raster: live.crop({box: area}).raster, radius: TOLERANCES.blurRadius})
  const b = boxBlur({raster: target.crop({box: area}).raster, radius: TOLERANCES.blurRadius})
  const compared = comparator.compare({a, b})
  boxes.forEach((box) => copyMask({from: compared.mask, fromArea: area, onto: mask, width, box}))
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
  return live.from({width: live.width, height: live.height, data})
}

function centred(input: {inner: Box; outer: Box}): boolean {
  const {inner, outer} = input
  const x = inner.x + inner.w / 2
  const y = inner.y + inner.h / 2
  return x >= outer.x && x < outer.x + outer.w && y >= outer.y && y < outer.y + outer.h
}

function tilesUnder(input: {grid: Grid; box: Box}): number[] {
  const {grid, box} = input
  const left = Math.max(0, Math.floor(box.x / grid.side))
  const right = Math.min(grid.columns - 1, Math.floor((box.x + box.w) / grid.side))
  const top = Math.max(0, Math.floor(box.y / grid.side))
  const bottom = Math.min(grid.rows - 1, Math.floor((box.y + box.h) / grid.side))
  return range(top, bottom + 1).flatMap((row) => range(left, right + 1).map((column) => row * grid.columns + column))
}

const COMPARE_REACH = TOLERANCES.blurRadius + 2

function similarityTiles(input: {
  live: Raster
  target: Raster
  mask: Uint8Array
  differing: Uint8Array
  width: number
  height: number
}): ScoredTile[] {
  const {mask, width, height} = input
  const side = TOLERANCES.similarityTile
  if (width === 0 || height === 0) return []
  const page = {x: 0, y: 0, w: width, h: height}
  const target = input.target.crop({box: page}).raster
  const map = ssim(
    imageData(seenRaster({live: input.live.crop({box: page}).raster, target, differing: input.differing})),
    imageData(target),
    {
      ssim: 'bezkrovny',
      windowSize: side,
      downsample: false,
    },
  ).ssim_map
  return map.data.flatMap((value, index) => {
    const column = index % map.width
    const row = (index - column) / map.width
    const box = {
      x: column * side,
      y: row * side,
      w: Math.min(side, width - column * side),
      h: Math.min(side, height - row * side),
    }
    return maskShare({mask, width, height, box}) < 1 ? [{box, similarity: value}] : []
  })
}

function meanSimilarity(tiles: ScoredTile[]): number {
  return tiles.length === 0 ? 1 : mean(tiles.map((tile) => tile.similarity))
}

function maskShare(input: {mask: Uint8Array; width: number; height: number; box: Box}): number {
  const {mask, width, height, box} = input
  const x0 = Math.max(0, Math.floor(box.x))
  const y0 = Math.max(0, Math.floor(box.y))
  const x1 = Math.min(width, Math.ceil(box.x + box.w))
  const y1 = Math.min(height, Math.ceil(box.y + box.h))
  if (x1 <= x0 || y1 <= y0) return 0
  let count = 0
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) count += mask[y * width + x] === 1 ? 1 : 0
  }
  return count / ((x1 - x0) * (y1 - y0))
}

function paintOver(input: {onto: Raster; from: Raster; boxes: Box[]}): Raster {
  const {onto, from, boxes} = input
  const data = new Uint8Array(onto.data)
  const width = Math.min(onto.width, from.width)
  const height = Math.min(onto.height, from.height)
  boxes.forEach((box) => {
    const x0 = Math.max(0, Math.floor(box.x))
    const x1 = Math.min(width, Math.ceil(box.x + box.w))
    if (x1 <= x0) return
    range(Math.max(0, Math.floor(box.y)), Math.min(height, Math.ceil(box.y + box.h))).forEach((y) => {
      data.set(from.data.subarray((y * from.width + x0) * 4, (y * from.width + x1) * 4), (y * onto.width + x0) * 4)
    })
  })
  return onto.from({width: onto.width, height: onto.height, data})
}

function seenRaster(input: {live: Pixels; target: Pixels; differing: Uint8Array}): Pixels {
  const {live, target, differing} = input
  const data = Uint8Array.from(target.data)
  differing.forEach((bit, index) => {
    if (bit === 1) data.set(live.data.subarray(index * 4, index * 4 + 4), index * 4)
  })
  return {width: target.width, height: target.height, data}
}

function imageData(raster: Pixels): {data: Uint8ClampedArray; width: number; height: number} {
  return {
    data: new Uint8ClampedArray(raster.data.buffer, raster.data.byteOffset, raster.data.length),
    width: raster.width,
    height: raster.height,
  }
}

function boxBlur(input: {raster: Pixels; radius: number}): Pixels {
  if (input.radius <= 0) return input.raster
  const once = blurPass({raster: input.raster, radius: input.radius, horizontal: true})
  return blurPass({raster: once, radius: input.radius, horizontal: false})
}

function blurPass(input: {raster: Pixels; radius: number; horizontal: boolean}): Pixels {
  const {raster, radius, horizontal} = input
  const {width, height} = raster
  const data = new Uint8Array(raster.data.length)
  const line = {
    source: raster.data,
    data,
    radius,
    stride: horizontal ? 4 : width * 4,
    length: horizontal ? width : height,
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const along = horizontal ? x : y
      blurPixel({...line, along, base: (y * width + x) * 4 - along * line.stride})
    }
  }
  return {width, height, data}
}

function blurPixel(input: {
  source: Uint8Array
  data: Uint8Array
  radius: number
  stride: number
  length: number
  along: number
  base: number
}): void {
  const {source, data, radius, stride, length, along, base} = input
  for (let channel = 0; channel < 4; channel += 1) {
    let sum = 0
    for (let offset = -radius; offset <= radius; offset += 1) {
      sum += source[base + Math.min(length - 1, Math.max(0, along + offset)) * stride + channel] ?? 0
    }
    data[base + along * stride + channel] = Math.round(sum / (radius * 2 + 1))
  }
}

function tileGrid(input: {width: number; height: number; side: number}): Grid {
  const {width, height, side} = input
  return {side, columns: Math.ceil(width / side), rows: Math.ceil(height / side), width, height}
}

function tileBox(input: {grid: Grid; index: number}): Box {
  const {grid, index} = input
  const column = index % grid.columns
  const row = (index - column) / grid.columns
  const x = column * grid.side
  const y = row * grid.side
  return {x, y, w: Math.min(grid.side, grid.width - x), h: Math.min(grid.side, grid.height - y)}
}

function tileHashes(input: {raster: Raster; grid: Grid; margin: number}): string[] {
  const {raster, grid, margin} = input
  return range(grid.columns * grid.rows).map((index) => {
    const box = tileBox({grid, index})
    const x0 = Math.max(0, box.x - margin)
    const x1 = Math.min(grid.width, box.x + box.w + margin)
    const hash = createHash('sha1')
    range(Math.max(0, box.y - margin), Math.min(grid.height, box.y + box.h + margin)).forEach((y) => {
      hash.update(raster.data.subarray((y * raster.width + x0) * 4, (y * raster.width + x1) * 4))
    })
    return hash.digest('base64')
  })
}

function packMask(input: {mask: Uint8Array; width: number; box: Box}): string {
  const {mask, width, box} = input
  const bits = new Uint8Array(Math.ceil((box.w * box.h) / 8))
  range(box.w * box.h).forEach((cell) => {
    const column = cell % box.w
    const row = (cell - column) / box.w
    if (mask[(box.y + row) * width + box.x + column] !== 1) return
    bits[cell >> 3] = (bits[cell >> 3] ?? 0) | (1 << (cell & 7))
  })
  return Buffer.from(bits).toString('base64')
}

function unpackMask(input: {packed: string; mask: Uint8Array; width: number; box: Box}): void {
  const {mask, width, box} = input
  const bits = Buffer.from(input.packed, 'base64')
  range(box.w * box.h).forEach((cell) => {
    if (((bits[cell >> 3] ?? 0) & (1 << (cell & 7))) === 0) return
    const column = cell % box.w
    mask[(box.y + (cell - column) / box.w) * width + box.x + column] = 1
  })
}

function copyMask(input: {from: Uint8Array; fromArea: Box; onto: Uint8Array; width: number; box: Box}): void {
  const {from, fromArea, onto, width, box} = input
  range(box.h).forEach((row) => {
    const start = (box.y + row - fromArea.y) * fromArea.w + box.x - fromArea.x
    onto.set(from.subarray(start, start + box.w), (box.y + row) * width + box.x)
  })
}

function maskCount(input: {mask: Uint8Array; width: number; box: Box}): number {
  const {mask, width, box} = input
  return range(box.h).reduce((total, row) => {
    const start = (box.y + row) * width + box.x
    return total + mask.subarray(start, start + box.w).reduce((sum, value) => sum + value, 0)
  }, 0)
}

const PIXEL_COMPARATORS = {
  blazediff: {name: 'blazediff', compare: blazediffCompare},
  pixelmatch: {name: 'pixelmatch', compare: pixelmatchCompare},
} as const satisfies Record<string, PixelComparator>

const difference = differenceCiede2000()

const ciede2000: ColorMetric = {
  name: 'ciede2000',
  distance: ({a, b}) => {
    const from = parse(a)
    const to = parse(b)
    if (from === undefined || to === undefined) return 0
    return difference(from, to)
  },
}

const COLOR_METRICS = {ciede2000} as const satisfies Record<string, ColorMetric>

function blazediffCompare(input: {a: Pixels; b: Pixels}): {mismatch: number; mask: Uint8Array} {
  const {a, b} = input
  const output = new Uint8Array(a.data.length)
  const count = diff(a.data, b.data, output, a.width, a.height, DIFF_OPTIONS)
  return pixelResult({output, count, width: a.width, height: a.height})
}

function pixelmatchCompare(input: {a: Pixels; b: Pixels}): {mismatch: number; mask: Uint8Array} {
  const {a, b} = input
  const output = new Uint8Array(a.data.length)
  const count = pixelmatch(a.data, b.data, output, a.width, a.height, DIFF_OPTIONS)
  return pixelResult({output, count, width: a.width, height: a.height})
}

const DIFF_OPTIONS = {threshold: 0.1, includeAA: false, diffMask: true} as const

function pixelResult(input: {output: Uint8Array; count: number; width: number; height: number}): {
  mismatch: number
  mask: Uint8Array
} {
  const {output, count, width, height} = input
  const total = width * height
  return {mismatch: total === 0 ? 0 : count / total, mask: diffMask({output, width, height})}
}

function diffMask(input: {output: Uint8Array; width: number; height: number}): Uint8Array {
  const {output, width, height} = input
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < mask.length; i += 1) {
    const red = output[i * 4] === 255 && output[i * 4 + 1] === 0 && output[i * 4 + 2] === 0
    mask[i] = red && output[i * 4 + 3] === 255 ? 1 : 0
  }
  return mask
}

function intersection(input: {a: Box; b: Box}): Box | null {
  const {a, b} = input
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const w = Math.min(a.x + a.w, b.x + b.w) - x
  const h = Math.min(a.y + a.h, b.y + b.h) - y
  return w > 0 && h > 0 ? {x, y, w, h} : null
}
