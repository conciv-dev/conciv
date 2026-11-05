import {chunk, groupBy, partition, range, uniqBy, zip} from 'es-toolkit'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import {DESIGN_TOOLS, type Box, type DesignNode, type LiveComponent, type Match, type Raster} from '../shared/defs.js'
import {box as boxes} from '../shared/box.js'
import {designConfig} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'
import {createRaster} from './raster.js'

export function createTypography(input: {color: string}) {
  const {color} = input
  const rendered = new Map<string, Ink>()
  return {
    agreeing: (request: {
      components: LiveComponent[]
      root: DesignNode
      live: Raster
      target: Raster
      reuse: Reuse | null
    }): {agreeing: Box[]; masks: Map<string, Box[]>} => agreeingText({...request, color}),
    estimate: (request: {
      texts: {node: TextNode; owner: LiveComponent}[]
      raster: Raster
      page: ServerToolPageAccess
    }): Promise<{estimates: Record<string, Typography>; skipped: number}> =>
      estimateTypography({...request, color, rendered}),
    dispose: (): void => rendered.clear(),
  }
}

type TextNode = Extract<Match['node'], {kind: 'text'}>

type Reuse = {textMasks: Map<string, Box[]>; unchanged: (box: Box) => boolean}

type Typography = NonNullable<TextNode['typography']>

type Rgb = ReturnType<Raster['rgb']>

type Ink = {height: number; contrast: number}

type Render = {text: string; font: string; size: number; weight: number; color: string; background: string}

type TypeJob = {node: TextNode; owner: LiveComponent; color: string; background: string; ink: Box; contrast: number}

type SizeFound = {size: number; confidence: number}

type Context = {page: ServerToolPageAccess; rendered: Map<string, Ink>}

type TextItem = {side: 'live' | 'target'; text: string; boxes: Box[]; owner: LiveComponent | null}

type Constituent = {item: TextItem; trimmed: Box[]; agrees: boolean}

const TOLERANCES = designConfig.tolerances

const [, , , , , , renderDef] = DESIGN_TOOLS

const REGULAR_WEIGHT = 400

const BOLD_WEIGHT = 700

const HALF_STEPS = 2

const MAX_CONTRAST = designConfig.rgbDistance({a: [0, 0, 0], b: [255, 255, 255]})

function agreeingText(input: {
  components: LiveComponent[]
  root: DesignNode
  live: Raster
  target: Raster
  color: string
  reuse: Reuse | null
}): {agreeing: Box[]; masks: Map<string, Box[]>} {
  const {components, live, target, color, reuse} = input
  const runs = [...walk(input.root)].flatMap(({node}) => (node.kind === 'text' ? [node] : []))
  if (runs.length === 0) return {agreeing: [], masks: new Map()}
  const liveItems = flattened(components).flatMap((owner) =>
    owner.glyphs.map((glyph): TextItem => ({side: 'live', text: glyph.text, boxes: glyph.boxes, owner})),
  )
  const targetItems = runs.map((run): TextItem => ({side: 'target', text: run.text, boxes: [run.box], owner: null}))
  const masks = connected([...liveItems, ...targetItems]).map((members): [string, Box[]] => {
    const key = JSON.stringify(members.map((member) => [member.side, member.text, member.boxes]))
    const kept = reuse?.textMasks.get(key)
    const region = boxes.expand({box: boxes.union(members.flatMap((member) => member.boxes)), by: TOLERANCES.tileSide})
    if (kept !== undefined && reuse !== null && reuse.unchanged(region)) return [key, kept]
    return [key, groupMask({members, live, target, color})]
  })
  return {agreeing: masks.flatMap(([, mask]) => mask), masks: new Map(masks)}
}

function flattened(components: LiveComponent[]): LiveComponent[] {
  return components.flatMap((component) => [component, ...flattened(component.children)])
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
      const touching = item.boxes.some((a) => items[next]?.boxes.some((b) => boxes.overlaps({a, b})) === true)
      if (touching) parent[root(next)] = root(index)
    })
  })
  const byRoot = groupBy(range(items.length), (index) => String(root(index)))
  return Object.values(byRoot).map((indexes) => indexes.flatMap((index) => items[index] ?? []))
}

function groupMask(input: {members: TextItem[]; live: Raster; target: Raster; color: string}): Box[] {
  const {live, target, color} = input
  const sorted = input.members.toSorted(itemOrder)
  const liveItems = sorted.filter((item) => item.side === 'live')
  const targetItems = sorted.filter((item) => item.side === 'target')
  if (liveItems[0]?.owner === null || liveItems[0] === undefined || targetItems.length === 0) return []
  const targetBoxes = targetItems.flatMap((item) => item.boxes)
  const sameText = squeezed(joined(liveItems)) === squeezed(joined(targetItems))
  const parts = liveItems.map((item) => constituent({item, live, target, color}))
  const samePlace = placeAgrees({liveBoxes: parts.flatMap((part) => part.trimmed), targetBoxes})
  if (!sameText || !samePlace) return []
  return parts.filter((part) => part.agrees).flatMap((part) => maskedBoxes({constituent: part, targetBoxes}))
}

function itemOrder(a: TextItem, b: TextItem): number {
  const first = a.boxes[0]
  const second = b.boxes[0]
  if (first === undefined || second === undefined) return 0
  return boxes.readingOrder({a: first, b: second})
}

function joined(items: TextItem[]): string {
  return items
    .map((item) => item.text.trim())
    .filter((text) => text !== '')
    .join(' ')
}

function squeezed(text: string): string {
  return [...text.toLowerCase()].filter((character) => character.trim() !== '').join('')
}

function constituent(input: {item: TextItem; live: Raster; target: Raster; color: string}): Constituent {
  const {item, live, target, color} = input
  const trimmed = item.boxes.map((box) => live.trim(box))
  const agrees = inkAgrees({live, target, liveBoxes: trimmed, targetBoxes: item.boxes, color})
  return {item, trimmed, agrees}
}

function inkAgrees(input: {
  live: Raster
  target: Raster
  liveBoxes: Box[]
  targetBoxes: Box[]
  color: string
}): boolean {
  const {color} = input
  const a = inkColor({raster: input.live, boxes: input.liveBoxes, color})
  const b = inkColor({raster: input.target, boxes: input.targetBoxes, color})
  return a !== null && b !== null && designConfig.colorMetrics.ciede2000({a, b}) <= TOLERANCES.colorDeltaE
}

function inkColor(input: {raster: Raster; boxes: Box[]; color: string}): string | null {
  const {raster, color} = input
  const [, foreground] = raster.fills({
    box: boxes.expand({box: boxes.union(input.boxes), by: TOLERANCES.tileMargin}),
    glyphs: input.boxes,
    color,
  })
  return foreground ?? null
}

function placeAgrees(input: {liveBoxes: Box[]; targetBoxes: Box[]}): boolean {
  const a = boxes.union(input.liveBoxes)
  const b = boxes.union(input.targetBoxes)
  const edges = [a.x - b.x, a.y - b.y, a.x + a.w - b.x - b.w, a.y + a.h - b.y - b.h]
  return edges.every((edge) => Math.abs(edge) <= TOLERANCES.geometryPx)
}

function maskedBoxes(input: {constituent: Constituent; targetBoxes: Box[]}): Box[] {
  const {constituent: part, targetBoxes} = input
  const reach = part.trimmed.map((box) => boxes.expand({box, by: TOLERANCES.geometryPx}))
  const target = targetBoxes.flatMap((a) => reach.flatMap((b) => boxes.intersection({a, b}) ?? []))
  return [...part.trimmed, ...target]
}

async function estimateTypography(input: {
  texts: {node: TextNode; owner: LiveComponent}[]
  raster: Raster
  page: ServerToolPageAccess
  color: string
  rendered: Map<string, Ink>
}): Promise<{estimates: Record<string, Typography>; skipped: number}> {
  const context = {page: input.page, rendered: input.rendered}
  const jobs = typeJobs(input)
  if (jobs.length === 0) return {estimates: {}, skipped: 0}
  const skippedKeys = new Set(await renderInks({...context, renders: jobs.map(liveRender)}))
  const [skipped, rendered] = partition(jobs, (job) => skippedKeys.has(renderKey(liveRender(job))))
  const estimates = Object.fromEntries(await Promise.all(rendered.map((job) => estimate({...context, job}))))
  return {estimates, skipped: skipped.length}
}

function typeJobs(input: {texts: {node: TextNode; owner: LiveComponent}[]; raster: Raster; color: string}): TypeJob[] {
  const {raster} = input
  return uniqBy(input.texts, (entry) => entry.node.id)
    .filter((entry) => needsEstimate({typography: entry.node.typography, live: entry.owner.styles.fontFamily}))
    .map(({node, owner}) => {
      const {raster: tile, box: area} = raster.region({box: node.box, margin: TOLERANCES.typeHalo})
      const [background = owner.styles.background, foreground] = raster.fills({
        box: area,
        glyphs: [node.box],
        color: input.color,
      })
      const ink = ownInk({tile, area, background: tile.rgb(0)})
      return {
        node,
        owner,
        color: foreground ?? owner.styles.color,
        background,
        ink,
        contrast: contrast({raster, box: ink, background: tile.rgb(0)}),
      }
    })
}

function needsEstimate(input: {typography: Typography | undefined; live: string}): boolean {
  const {typography} = input
  if (typography === undefined) return true
  if (typography.confidence === 1) return false
  return !sameFamily({a: typography.font, b: input.live})
}

function ownInk(input: {tile: Raster; area: Box; background: Rgb}): Box {
  const {tile, area} = input
  const {width, height} = tile
  const mask = Uint8Array.from(range(width * height), (index) => {
    const pixel = tile.rgb(index)
    const apart = pixel.some(
      (channel, at) => Math.abs(channel - (input.background[at] ?? channel)) > TOLERANCES.inkTrimThreshold,
    )
    return apart ? 1 : 0
  })
  const inside = regionBoxes({mask, width, height}).filter(
    (region) => region.x > 0 && region.y > 0 && region.x + region.w < width && region.y + region.h < height,
  )
  if (inside.length === 0) {
    const trimmed = tile.trim({x: 0, y: 0, w: width, h: height})
    return {...trimmed, x: trimmed.x + area.x, y: trimmed.y + area.y}
  }
  const own = boxes.union(inside)
  return {...own, x: own.x + area.x, y: own.y + area.y}
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

async function renderInks(input: Context & {renders: Render[]}): Promise<string[]> {
  const missing = uniqBy(
    input.renders.filter((render) => !input.rendered.has(renderKey(render))),
    renderKey,
  )
  return chunk(missing, TOLERANCES.renderChunk).reduce<Promise<string[]>>(
    async (before, renders) => [...(await before), ...(await renderChunk({...input, renders}))],
    Promise.resolve([]),
  )
}

async function renderChunk(input: Context & {renders: Render[]}): Promise<string[]> {
  const reply = await input.page
    .call(renderDef.name, {renders: input.renders, timeout: TOLERANCES.measureTimeoutMs})
    .then((result) => renderDef.outputSchema?.parse(result) ?? null)
    .catch(() => null)
  if (reply === null) return input.renders.map(renderKey)
  zip(input.renders, reply.images).forEach(([render, image]) => {
    if (render === undefined || image === undefined) return
    input.rendered.set(renderKey(render), inkOf(createRaster(Buffer.from(image, 'base64'))))
  })
  return []
}

function renderKey(render: Render): string {
  return [render.text, render.font, render.color, render.background, render.size, render.weight].join('|')
}

function inkOf(raster: Raster): Ink {
  const box = raster.trim({x: 0, y: 0, w: raster.width, h: raster.height})
  return {height: box.h, contrast: contrast({raster, box, background: raster.rgb(0)})}
}

function contrast(input: {raster: Raster; box: Box; background: Rgb}): number {
  const {raster, box, background} = input
  const area = box.w * box.h
  if (area <= 0) return 0
  const total = range(box.y, box.y + box.h).reduce(
    (sum, y) =>
      sum +
      range(box.x, box.x + box.w).reduce(
        (row, x) => row + designConfig.rgbDistance({a: raster.rgb(y * raster.width + x), b: background}),
        0,
      ),
    0,
  )
  return total / (area * MAX_CONTRAST)
}

async function estimate(input: Context & {job: TypeJob}): Promise<[string, Typography]> {
  const {job} = input
  const {fontSize, fontWeight, fontFamily, lineHeight} = job.owner.styles
  const found = await sizeFound({...input, live: fontSize})
  const regular = await inkAt({...input, render: renderAt({job, size: found.size, weight: REGULAR_WEIGHT})})
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

async function inkAt(input: Context & {render: Render}): Promise<Ink> {
  await renderInks({...input, renders: [input.render]})
  return input.rendered.get(renderKey(input.render)) ?? {height: 0, contrast: 0}
}

async function sizeFound(input: Context & {job: TypeJob; live: number}): Promise<SizeFound> {
  const {job, live} = input
  const wanted = job.ink.h
  const height = async (size: number): Promise<number> =>
    (await inkAt({...input, render: renderAt({job, size, weight: job.owner.styles.fontWeight})})).height
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

function regionBoxes(input: {mask: Uint8Array; width: number; height: number}): Box[] {
  const {mask, width, height} = input
  const labels = new Int32Array(width * height)
  return range(width * height).flatMap((start) => {
    if (mask[start] !== 1 || labels[start] !== 0) return []
    labels[start] = 1
    return [floodFill({mask, labels, width, height, start})]
  })
}

function floodFill(input: {mask: Uint8Array; labels: Int32Array; width: number; height: number; start: number}): Box {
  const {mask, labels, width, height, start} = input
  const bounds = {minX: width, minY: height, maxX: 0, maxY: 0}
  const stack = [start]
  while (stack.length > 0) {
    const index = stack.pop() ?? 0
    const x = index % width
    const y = (index - x) / width
    bounds.minX = Math.min(bounds.minX, x)
    bounds.minY = Math.min(bounds.minY, y)
    bounds.maxX = Math.max(bounds.maxX, x)
    bounds.maxY = Math.max(bounds.maxY, y)
    const neighbours = [
      x > 0 ? index - 1 : -1,
      x < width - 1 ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y < height - 1 ? index + width : -1,
    ]
    neighbours.forEach((next) => {
      if (next < 0 || mask[next] !== 1 || labels[next] !== 0) return
      labels[next] = 1
      stack.push(next)
    })
  }
  return {x: bounds.minX, y: bounds.minY, w: bounds.maxX - bounds.minX + 1, h: bounds.maxY - bounds.minY + 1}
}

function sameFamily(input: {a: string; b: string}): boolean {
  return leadingFamily(input.a).toLowerCase() === leadingFamily(input.b).toLowerCase()
}

function leadingFamily(stack: string): string {
  return (stack.split(',')[0] ?? '').replaceAll('"', '').replaceAll("'", '').trim()
}
