import {z} from 'zod'
import {AsyncRetryer} from '@tanstack/pacer/async-retryer'
import {chunk, groupBy, partition, range, uniqBy, zip} from 'es-toolkit'
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
  type LiveCapture,
  type LiveComponent,
  type MatchText,
  type MeasureSource,
  type Measurer,
  type Raster,
  type Reuse,
  type TextRun,
  type Typography,
} from '../shared/defs.js'
import {sameFamily, TOLERANCES} from '../shared/tolerances.js'
import {expand, intersection, overlapping, sameLine, union} from '../shared/box.js'
import {crop, decodePng, labelRegions, rgbAt, rgbDistance, sampledFills, trimToInk, type Rgb} from './raster.js'

export function createMeasurer(input: {color: ColorMetric}): Measurer {
  const {color} = input
  return {
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
    typography: (request) => estimateTypography({...request, color}),
    sources: measuredSources,
    confidence: sourceConfidence,
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
    raster: decodePng(Buffer.from(reply.image, 'base64')),
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
  if (sameLine({a: first, b: second})) return first.x - second.x
  return first.y - second.y
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
  return sampledFills({raster, box: expand({box: union(boxes), by: TOLERANCES.tileMargin}), glyphs: boxes, color})
    .foreground
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
}): TypeJob[] {
  const {raster} = input
  return uniqBy(input.texts, (entry) => entry.node.id)
    .filter((entry) => needsEstimate({typography: entry.node.typography, live: entry.owner.styles.fontFamily}))
    .map(({node, owner}) => {
      const area = crop({raster, box: node.box, margin: TOLERANCES.typeHalo})
      const fills = sampledFills({raster, box: area.box, glyphs: [node.box], color: input.color})
      const background = rgbAt({raster: area.raster, index: 0})
      const ink = ownInk({area, background})
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

function ownInk(input: {area: {raster: Raster; box: Box}; background: Rgb}): Box {
  const {raster, box} = input.area
  const {width, height} = raster
  const mask = Uint8Array.from(range(width * height), (index) => {
    const pixel = rgbAt({raster, index})
    const apart = pixel.some(
      (channel, at) => Math.abs(channel - (input.background[at] ?? channel)) > TOLERANCES.inkTrimThreshold,
    )
    return apart ? 1 : 0
  })
  const inside = labelRegions({mask, width, height}).regions.filter(
    (region) =>
      region.box.x > 0 &&
      region.box.y > 0 &&
      region.box.x + region.box.w < width &&
      region.box.y + region.box.h < height,
  )
  if (inside.length === 0) return trimToInk({raster, box: {x: 0, y: 0, w: width, h: height}})
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
    RENDERED.set(renderKey(render), inkOf(decodePng(Buffer.from(image, 'base64'))))
  })
  return []
}

function renderKey(render: Render): string {
  return [render.text, render.font, render.color, render.background, render.size, render.weight].join('|')
}

function inkOf(raster: Raster): Ink {
  const box = trimToInk({raster, box: {x: 0, y: 0, w: raster.width, h: raster.height}})
  return {height: box.h, contrast: contrast({raster, box, background: rgbAt({raster, index: 0})})}
}

function contrast(input: {raster: Raster; box: Box; background: Rgb}): number {
  const {raster, box, background} = input
  const area = box.w * box.h
  if (area <= 0) return 0
  let total = 0
  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) {
      total += rgbDistance({a: rgbAt({raster, index: y * raster.width + x}), b: background})
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
