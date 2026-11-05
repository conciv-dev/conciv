import {median} from 'es-toolkit'
import {SOURCE_ATTR, type Tolerances} from '../shared/tolerances.js'
import type {Box, Fingerprint, LiveComponent, Raster} from '../shared/types.js'
import type {Geometry, Match, Offset, Shift} from '../shared/defs.js'
import {walk} from '../shared/tree.js'
import {fnv, trimToInk} from './raster.js'
import {centre, nearestLine, union} from '../shared/box.js'
import {folded} from '../shared/tolerances.js'

export function createGeometry(input: {tolerances: Tolerances}): Geometry {
  const {tolerances} = input
  return {
    align: (request) => align({...request, tolerances}),
    fingerprint,
    targetBox,
    selectors,
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
    textHash: fnv(folded(component.glyphs.map((glyph) => glyph.text).join(' '))),
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
  const ink = trimToInk({raster, box: line})
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
