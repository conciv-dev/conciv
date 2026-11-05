import {createHash} from 'node:crypto'
import {median, range} from 'es-toolkit'
import {SOURCE_ATTR, type Tolerances} from '../shared/tolerances.js'
import {
  type Box,
  type Fingerprint,
  type Geometry,
  type LiveComponent,
  type Match,
  type MaskRegion,
  type Offset,
  type Raster,
  type Shift,
} from '../shared/defs.js'
import {walk} from '../shared/tree.js'
import {union} from '../shared/box.js'
import {folded} from '../shared/tolerances.js'

export function createGeometry(input: {tolerances: Tolerances}): Geometry {
  const {tolerances} = input
  return {
    align: (request) => align({...request, tolerances}),
    fingerprint,
    targetBox,
    selectors,
    centre,
    holds,
    nearestLine,
    distance,
    mask: boxMask,
    regions: labelRegions,
  }
}

function fingerprint(
  component: Pick<LiveComponent, 'source' | 'key' | 'instance' | 'owner' | 'tag' | 'glyphs' | 'box'>,
): Fingerprint {
  return {
    source: component.source,
    key: component.key,
    instance: component.instance,
    owner: component.owner,
    tag: component.tag,
    textHash: textHash(folded(component.glyphs.map((glyph) => glyph.text).join(' '))),
    box: component.box,
  }
}

function align(input: {root: Match; live: Raster; exact: boolean; tolerances: Tolerances}): {
  global: Shift
  offsets: Offset[]
} {
  const {root, live, exact, tolerances} = input
  const paired = [...walk({root})].flatMap(({node, depth}): Seated[] =>
    depth === 0 || node.live === null ? [] : [{match: node, live: node.live}],
  )
  const global = exact ? boxShift(paired) : medianShift(paired.flatMap((seated) => textShift({seated, raster: live})))
  const moved = (seated: Seated): Shift => relative({a: displacement({seated, raster: live, exact}), b: global})
  const page: Offset[] = beyond({shift: global, tolerances}) ? [{match: null, shift: global}] : []
  return {global, offsets: [...page, ...offsetsUnder({match: root, anchor: null, moved, tolerances})]}
}

function targetBox(input: {node: Match['node']; live: PairedLive; raster: Raster; exact: boolean}): Box {
  const {node, live, raster, exact} = input
  if (node.kind !== 'text' || exact) return node.box
  const shift = inkShift({node, live, raster})
  return {...live.box, x: live.box.x + shift.dx, y: live.box.y + shift.dy}
}

function selectors(live: LiveComponent): Map<string, string> {
  return new Map([
    [live.path, componentSelector({component: live, parent: null, shared: false})],
    ...selectorsUnder({components: live.children, host: null}),
  ])
}

type PairedLive = NonNullable<Match['live']>

type Seated = {match: Match; live: PairedLive}

type TextNode = Extract<Match['node'], {kind: 'text'}>

const PAGE_SHIFT_PAIRS = 3

function boxShift(paired: Seated[]): Shift {
  const boxed = paired.filter(({match}) => match.node.kind !== 'text')
  if (boxed.length < PAGE_SHIFT_PAIRS) return {dx: 0, dy: 0}
  return medianShift(
    boxed.map(({match, live}) => ({dx: match.node.box.x - live.box.x, dy: match.node.box.y - live.box.y})),
  )
}

function medianShift(shifts: Shift[]): Shift {
  return {dx: median0(shifts.map((shift) => shift.dx)), dy: median0(shifts.map((shift) => shift.dy))}
}

function textShift(input: {seated: Seated; raster: Raster}): Shift[] {
  const {node} = input.seated.match
  if (node.kind !== 'text') return []
  return [inkShift({node, live: input.seated.live, raster: input.raster})]
}

function inkShift(input: {node: TextNode; live: PairedLive; raster: Raster}): Shift {
  const {node, live, raster} = input
  const line = nearestLine({lines: live.glyphs.flatMap((glyph) => glyph.boxes), box: node.box})
  if (line === null) return {dx: 0, dy: 0}
  const ink = raster.ink(line)
  return {dx: node.box.x - ink.x, dy: node.box.y - ink.y}
}

function displacement(input: {seated: Seated; raster: Raster; exact: boolean}): Shift {
  const {seated, raster, exact} = input
  const {node} = seated.match
  const ink = exact && node.kind === 'text' ? inkToInk({node, live: seated.live}) : null
  const target = targetBox({node, live: seated.live, raster, exact})
  return ink ?? {dx: target.x - seated.live.box.x, dy: target.y - seated.live.box.y}
}

function inkToInk(input: {node: TextNode; live: PairedLive}): Shift | null {
  const {node, live} = input
  const glyphs = live.glyphs.flatMap((glyph) => glyph.boxes)
  const lines = node.lines.map((line) => line.box)
  if (glyphs.length === 0 || lines.length === 0) return null
  const drawn = union(glyphs)
  const design = union(lines)
  return {
    dx: horizontal({design, live: drawn, alignment: live.styles.textAlign}),
    dy: centre(design).y - centre(drawn).y,
  }
}

function horizontal(input: {design: Box; live: Box; alignment: string}): number {
  const {design, live, alignment} = input
  if (alignment === 'center') return centre(design).x - centre(live).x
  if (alignment === 'right' || alignment === 'end') return design.x + design.w - (live.x + live.w)
  return design.x - live.x
}

function relative(input: {a: Shift; b: Shift}): Shift {
  return {dx: input.a.dx - input.b.dx, dy: input.a.dy - input.b.dy}
}

function beyond(input: {shift: Shift; tolerances: Tolerances}): boolean {
  const {shift, tolerances} = input
  return Math.abs(shift.dx) > tolerances.geometryPx || Math.abs(shift.dy) > tolerances.geometryPx
}

function offsetsUnder(input: {
  match: Match
  anchor: Seated | null
  moved: (seated: Seated) => Shift
  tolerances: Tolerances
}): Offset[] {
  const {anchor, moved, tolerances} = input
  return input.match.children.flatMap((child) => {
    const seated = child.live === null ? null : {match: child, live: child.live}
    const below = offsetsUnder({...input, match: child, anchor: seated ?? anchor})
    if (seated === null) return below
    if (anchor !== null && beyond({shift: moved(anchor), tolerances})) return below
    const shift = moved(seated)
    return beyond({shift, tolerances}) ? [{match: child, shift}, ...below] : below
  })
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
  const selector = `[${SOURCE_ATTR}="${key}"]`
  return shared ? `${selector}:nth-child(${component.index})` : selector
}

function sourceKey(component: LiveComponent): string | null {
  const {source} = component
  return source === null ? null : `${source.file}:${source.line}:${source.column}`
}

function median0(values: number[]): number {
  return values.length === 0 ? 0 : median(values)
}

function centre(box: Box): {x: number; y: number} {
  return {x: box.x + box.w / 2, y: box.y + box.h / 2}
}

function holds(input: {outer: Box; inner: Box}): boolean {
  const {outer, inner} = input
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}

function nearestLine(input: {lines: Box[]; box: Box}): Box | null {
  const target = centre(input.box)
  return input.lines.reduce<Box | null>((best, line) => {
    if (best === null) return line
    return distance({a: centre(line), b: target}) < distance({a: centre(best), b: target}) ? line : best
  }, null)
}

function distance(input: {a: {x: number; y: number}; b: {x: number; y: number}}): number {
  return Math.hypot(X_WEIGHT * (input.a.x - input.b.x), input.a.y - input.b.y)
}

const X_WEIGHT = 0.5

function boxMask(input: {boxes: Box[]; area: Box}): Uint8Array {
  const {boxes, area} = input
  const mask = new Uint8Array(area.w * area.h)
  boxes.forEach((box) => {
    const x0 = Math.max(0, box.x - area.x)
    const x1 = Math.min(area.w, box.x + box.w - area.x)
    if (x1 <= x0) return
    range(Math.max(0, box.y - area.y), Math.min(area.h, box.y + box.h - area.y)).forEach((y) => {
      mask.fill(1, y * area.w + x0, y * area.w + x1)
    })
  })
  return mask
}

function labelRegions(input: {mask: Uint8Array; width: number; height: number}): {
  labels: Int32Array
  regions: MaskRegion[]
} {
  const {mask, width, height} = input
  const labels = new Int32Array(width * height)
  const regions: MaskRegion[] = []
  for (let start = 0; start < width * height; start += 1) {
    if (mask[start] !== 1 || labels[start] !== 0) continue
    labels[start] = regions.length + 1
    regions.push(floodFill({mask, labels, width, height, start}))
  }
  return {labels, regions}
}

function floodFill(input: {
  mask: Uint8Array
  labels: Int32Array
  width: number
  height: number
  start: number
}): MaskRegion {
  const {mask, labels, width, height, start} = input
  const label = labels[start] ?? 0
  const bounds = {size: 0, minX: width, minY: height, maxX: 0, maxY: 0}
  const stack = [start]
  while (stack.length > 0) {
    const index = stack.pop() ?? 0
    const x = index % width
    const y = (index - x) / width
    bounds.size += 1
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
      labels[next] = label
      stack.push(next)
    })
  }
  return {
    label,
    size: bounds.size,
    box: {x: bounds.minX, y: bounds.minY, w: bounds.maxX - bounds.minX + 1, h: bounds.maxY - bounds.minY + 1},
  }
}

function textHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, TEXT_HASH_LENGTH)
}

const TEXT_HASH_LENGTH = 8
