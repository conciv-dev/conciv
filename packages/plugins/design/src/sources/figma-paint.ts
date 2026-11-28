import {range} from 'es-toolkit'
import type {Box, DesignNode} from '../model/design.js'
import {expand, inset, mask} from '../model/box.js'
import {colorDistance, hex} from '../model/color.js'
import type {Raster} from '../raster/raster.js'

type Axis = 'vertical' | 'horizontal'
type FillShape =
  | {kind: 'solid'}
  | {kind: 'picture'}
  | {kind: 'gradient'; gradient: {from: string; to: string; axis: Axis}}

const MIN_LINES = 2
const CHANNELS = 4
const GEOMETRY_PX = 2
const GLYPH_HALO = 1
const COLOR_DELTA_E = 3
const SOLID: FillShape = {kind: 'solid'}
const PICTURE: FillShape = {kind: 'picture'}

export function sampledPaint(input: {root: DesignNode; raster: Raster}): DesignNode {
  const {root, raster} = input
  return {...root, children: root.children.map((child) => painted({node: child, raster}))}
}

function painted(input: {node: DesignNode; raster: Raster}): DesignNode {
  const {node, raster} = input
  const children = node.children.map((child) => painted({node: child, raster}))
  if (node.kind !== 'box' || node.paint !== undefined) return {...node, children}
  const background = raster.background(node.box)
  const holes = node.children.map((child) => expand({box: child.box, by: GLYPH_HALO}))
  const shape = fillShape({raster, box: inset({box: node.box, by: GEOMETRY_PX + node.radius}), holes})
  if (shape.kind === 'picture' && holes.length === 0)
    return {
      id: node.id,
      box: node.box,
      hash: '',
      ...(node.layout === undefined ? {} : {layout: node.layout}),
      ...(node.figma === undefined ? {} : {figma: node.figma}),
      kind: 'image',
      holds: 0,
      children: [],
    }
  if (shape.kind === 'gradient') return {...node, children, paint: {background, gradient: shape.gradient}}
  return {...node, children, paint: {background}}
}

function fillShape(input: {raster: Raster; box: Box; holes: Box[]}): FillShape {
  const {raster, box, holes} = input
  if (box.w < MIN_LINES || box.h < MIN_LINES) return SOLID
  const cells = mask({boxes: holes, within: box})
  const rowMeans = lineMeans({raster, area: box, cells, axis: 'vertical'})
  const columnMeans = lineMeans({raster, area: box, cells, axis: 'horizontal'})
  const vertical = varies(rowMeans)
  const horizontal = varies(columnMeans)
  if (!vertical && !horizontal) return SOLID
  if (vertical && horizontal) return PICTURE
  const axis: Axis = vertical ? 'vertical' : 'horizontal'
  const means = vertical ? rowMeans : columnMeans
  const from = means[0]
  const to = means.at(-1)
  if (from === undefined || to === undefined || !smooth(means)) return PICTURE
  return {kind: 'gradient', gradient: {from, to, axis}}
}

function lineMeans(input: {raster: Raster; area: Box; cells: Uint8Array; axis: Axis}): string[] {
  const {raster, area, cells, axis} = input
  const lines = axis === 'vertical' ? area.h : area.w
  const across = axis === 'vertical' ? area.w : area.h
  return range(lines).flatMap((line) => {
    const total = range(across).reduce(
      (sums, step) => {
        const x = axis === 'vertical' ? step : line
        const y = axis === 'vertical' ? line : step
        if (cells[y * area.w + x] === 1) return sums
        const index = ((area.y + y) * raster.width + area.x + x) * CHANNELS
        return {
          red: sums.red + (raster.data[index] ?? 0),
          green: sums.green + (raster.data[index + 1] ?? 0),
          blue: sums.blue + (raster.data[index + 2] ?? 0),
          count: sums.count + 1,
        }
      },
      {red: 0, green: 0, blue: 0, count: 0},
    )
    if (total.count === 0) return []
    return [hex([total.red, total.green, total.blue].map((channel) => Math.round(channel / total.count)))]
  })
}

function varies(means: string[]): boolean {
  const first = means[0]
  const last = means.at(-1)
  if (first === undefined || last === undefined) return false
  return colorDistance({a: first, b: last}) > COLOR_DELTA_E
}

function smooth(means: string[]): boolean {
  return means.every((mean, index) => {
    const next = means[index + 1]
    return next === undefined || colorDistance({a: mean, b: next}) <= COLOR_DELTA_E
  })
}
