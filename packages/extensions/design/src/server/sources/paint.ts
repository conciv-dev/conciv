import {range} from 'es-toolkit'
import type {z} from 'zod'
import type {Box, DesignNode, Raster} from '../../shared/defs.js'
import {designConfig} from '../../shared/tolerances.js'
import {box as geometry} from '../../shared/box.js'

export function createPaint(input: {raster: Raster; config: DesignConfig}): {
  fill(nodes: Item[]): Item[]
  gradient(input: {box: Box; holes: Box[]}): boolean
} {
  const raster: Pixels = {
    width: input.raster.width,
    height: input.raster.height,
    data: input.raster.pixels(),
    rgb: (index) => input.raster.rgb(index),
  }
  const context: Context = {
    raster,
    tolerances: designConfig.tolerances,
    color: designConfig.colorMetrics[input.config.color],
  }
  return {
    fill: (nodes) => nodes.map((node) => painted({node, nodes, context})),
    gradient: ({box, holes}) => fillShape({context, box, holes}).kind === 'gradient',
  }
}

type DesignConfig = z.output<typeof designConfig>
type Tolerances = typeof designConfig.tolerances
type Rgb = [number, number, number]
type Pixels = {width: number; height: number; data: Uint8Array; rgb(index: number): Rgb}
type Bare<Node> = Node extends unknown ? Omit<Node, 'id' | 'hash' | 'children' | 'layout'> : never
type Item = Bare<DesignNode>
type BoxItem = Extract<Item, {kind: 'box'}>
type Gradient = NonNullable<NonNullable<BoxItem['paint']>['gradient']>
type Distance = (input: {a: string; b: string}) => number
type Context = {raster: Pixels; tolerances: Tolerances; color: Distance}
type FillShape = {kind: 'solid'} | {kind: 'picture'} | {kind: 'gradient'; gradient: Gradient}
type Axis = Gradient['axis']

const SOLID: FillShape = {kind: 'solid'}
const PICTURE: FillShape = {kind: 'picture'}
const MIN_LINES = 2
const EDGE_THRESHOLD = 48

function painted(input: {node: Item; nodes: Item[]; context: Context}): Item {
  const {node, nodes, context} = input
  if (node.kind !== 'box' || node.paint !== undefined) return node
  const {raster, tolerances} = context
  const background = edgeFreeMedian({raster, box: node.box})
  const holes = nodes
    .filter((other) => parentOf({node: other, nodes}) === node)
    .map((other) => geometry.expand({box: other.box, by: tolerances.glyphHalo}))
  const box = geometry.inset({box: node.box, by: tolerances.geometryPx + node.radius})
  const shape = fillShape({context, box, holes})
  if (shape.kind === 'picture' && holes.length === 0) return {kind: 'image', box: node.box, holds: 0}
  if (shape.kind === 'gradient') return {...node, paint: {background, gradient: shape.gradient}}
  return {...node, paint: {background}}
}

function parentOf(input: {node: Item; nodes: Item[]}): Item | undefined {
  const {node, nodes} = input
  return nodes
    .filter(
      (outer) =>
        outer.kind === 'box' &&
        outer !== node &&
        geometry.area(outer.box) > geometry.area(node.box) &&
        geometry.encloses({outer: outer.box, inner: node.box}),
    )
    .toSorted((a, b) => geometry.area(a.box) - geometry.area(b.box))[0]
}

function edgeFreeMedian(input: {raster: Pixels; box: Box}): string {
  const {raster} = input
  const area = geometry.clip({width: raster.width, height: raster.height, box: input.box, margin: 0})
  const index = (at: number): number => (area.y + Math.floor(at / area.w)) * raster.width + area.x + (at % area.w)
  const lum = Float32Array.from(range(area.w * area.h), (at) => {
    const [r, g, b] = raster.rgb(index(at))
    return 0.299 * r + 0.587 * g + 0.114 * b
  })
  const edge = (at: number): boolean => {
    const x = at % area.w
    const y = Math.floor(at / area.w)
    if (x < 1 || y < 1 || x >= area.w - 1 || y >= area.h - 1) return false
    const l = (dx: number, dy: number): number => lum[at + dy * area.w + dx] ?? 0
    const gx = l(1, -1) + 2 * l(1, 0) + l(1, 1) - l(-1, -1) - 2 * l(-1, 0) - l(-1, 1)
    const gy = l(-1, 1) + 2 * l(0, 1) + l(1, 1) - l(-1, -1) - 2 * l(0, -1) - l(1, -1)
    return Math.hypot(gx, gy) > EDGE_THRESHOLD
  }
  const kept = range(area.w * area.h).flatMap((at) => (edge(at) ? [] : [index(at)]))
  return designConfig.hex([0, 1, 2].map((channel) => histogramMedian({raster, indices: kept, channel})))
}

function histogramMedian(input: {raster: Pixels; indices: number[]; channel: number}): number {
  const {raster, indices, channel} = input
  const histogram = new Uint32Array(256)
  indices.forEach((index) => {
    const value = raster.data[index * 4 + channel] ?? 0
    histogram[value] = (histogram[value] ?? 0) + 1
  })
  const cumulative = [...histogram].reduce<number[]>((sums, value) => [...sums, (sums.at(-1) ?? 0) + value], [])
  const found = cumulative.findIndex((seen) => seen >= indices.length / 2)
  return found === -1 ? 0 : found
}

function fillShape(input: {context: Context; box: Box; holes: Box[]}): FillShape {
  const {context, box, holes} = input
  if (box.w < MIN_LINES || box.h < MIN_LINES) return SOLID
  const mask = new Uint8Array(box.w * box.h)
  holes.forEach((hole) => {
    const x0 = Math.max(0, hole.x - box.x)
    const x1 = Math.min(box.w, hole.x + hole.w - box.x)
    if (x1 <= x0) return
    range(Math.max(0, hole.y - box.y), Math.min(box.h, hole.y + hole.h - box.y)).forEach((y) => {
      mask.fill(1, y * box.w + x0, y * box.w + x1)
    })
  })
  const rowMeans = lineMeans({raster: context.raster, area: box, mask, axis: 'vertical'})
  const columnMeans = lineMeans({raster: context.raster, area: box, mask, axis: 'horizontal'})
  const vertical = varies({means: rowMeans, context})
  const horizontal = varies({means: columnMeans, context})
  if (!vertical && !horizontal) return SOLID
  if (vertical && horizontal) return PICTURE
  const axis: Axis = vertical ? 'vertical' : 'horizontal'
  const means = vertical ? rowMeans : columnMeans
  const from = means[0]
  const to = means.at(-1)
  if (from === undefined || to === undefined || !smooth({means, context})) return PICTURE
  return {kind: 'gradient', gradient: {from, to, axis}}
}

function lineMeans(input: {raster: Pixels; area: Box; mask: Uint8Array; axis: Axis}): string[] {
  const {raster, area, mask, axis} = input
  const lines = axis === 'vertical' ? area.h : area.w
  const across = axis === 'vertical' ? area.w : area.h
  return range(lines).flatMap((line) => {
    const total = range(across).reduce(
      (sums, step) => {
        const x = axis === 'vertical' ? step : line
        const y = axis === 'vertical' ? line : step
        if (mask[y * area.w + x] === 1) return sums
        const index = ((area.y + y) * raster.width + area.x + x) * 4
        sums.red += raster.data[index] ?? 0
        sums.green += raster.data[index + 1] ?? 0
        sums.blue += raster.data[index + 2] ?? 0
        sums.count += 1
        return sums
      },
      {red: 0, green: 0, blue: 0, count: 0},
    )
    if (total.count === 0) return []
    return [designConfig.hex([total.red, total.green, total.blue].map((channel) => Math.round(channel / total.count)))]
  })
}

function varies(input: {means: string[]; context: Context}): boolean {
  const {means, context} = input
  const first = means[0]
  const last = means.at(-1)
  if (first === undefined || last === undefined) return false
  return context.color({a: first, b: last}) > context.tolerances.colorDeltaE
}

function smooth(input: {means: string[]; context: Context}): boolean {
  const {means, context} = input
  return means.every((mean, index) => {
    const next = means[index + 1]
    return next === undefined || context.color({a: mean, b: next}) <= context.tolerances.colorDeltaE
  })
}
