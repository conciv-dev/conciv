import {median} from 'es-toolkit'
import type {ContainerLayout, DesignNode, NodeLayout} from '../../shared/defs.js'
import {TOLERANCES} from '../../shared/tolerances.js'
import {walk} from '../../shared/tree.js'
import type {Box} from '../../shared/types.js'
import {union} from '../../shared/box.js'

export function inferLayout(root: DesignNode): DesignNode {
  const arranged = laidOut(root) ? root : arrangedNode(root)
  return {...arranged, children: arranged.children.map(inferLayout)}
}

type Placed = {node: DesignNode; box: Box; glyph: Box | null}
type Placement = Pick<NodeLayout, 'size' | 'index'>
type Arranged = {layout: ContainerLayout; placements: Map<string, Placement>}
type Axis = 'x' | 'y'
type Align = ContainerLayout['align']

function laidOut(node: DesignNode): boolean {
  return node.children.length === 0 || node.layout?.direction !== undefined
}

function arrangedNode(node: DesignNode): DesignNode {
  const {layout, placements} = arrange({box: node.box, children: node.children.map(placed)})
  return {
    ...node,
    layout: {...layout, ...seat(node.layout)},
    children: node.children.map((child) => ({...child, layout: {...child.layout, ...placements.get(child.id)}})),
  }
}

function seat(layout: DesignNode['layout']): Partial<Placement> {
  if (layout === undefined) return {}
  const {size, index} = layout
  return {...(size === undefined ? {} : {size}), ...(index === undefined ? {} : {index})}
}

function placed(node: DesignNode): Placed {
  const texts = [...walk({root: node})].flatMap((visit) =>
    visit.depth > 0 && visit.node.kind === 'text' ? [visit.node.box] : [],
  )
  return {node, box: node.box, glyph: texts.length === 0 ? null : union(texts)}
}

function arrange(input: {box: Box; children: Placed[]}): Arranged {
  const {box} = input
  const lines = linesFrom(input.children)
  const ordered = lines.flat()
  const direction = directionFrom(lines)
  const padding = paddingAround({box, inner: union(ordered.map((child) => child.box))})
  const width = box.w - padding.left - padding.right
  const rows = direction === 'row' || direction === 'grid' ? lines : []
  const runs = direction === 'column' || direction === 'stack' ? lines.filter((line) => line.length > 1) : []
  const filled = new Set(
    [...rows, ...runs]
      .filter((line) => fills({line, width}))
      .flat()
      .map((child) => child.node.id),
  )
  return {
    layout: {
      direction,
      gap: gapFrom({direction, lines}),
      align: alignFrom({direction, lines, box}),
      wrap: direction === 'row' && lines.length > 1,
      padding,
      runs: runs.map((line) => ({
        direction: 'row',
        children: line.map((child) => child.node.id),
        gap: summary(gapsAlong({boxes: line.map((child) => child.box), axis: 'x'})),
        align: crossAlignment({boxes: line.map((child) => child.box), axis: 'y'}) ?? 'start',
        wrap: false,
      })),
    },
    placements: new Map(
      ordered.map((child, position) => [child.node.id, {index: position + 1, size: sizeFrom({child, filled})}]),
    ),
  }
}

function linesFrom(children: Placed[]): Placed[][] {
  return children
    .toSorted((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
    .reduce<Placed[][]>((found, child) => {
      const line = found.find((candidate) => candidate.every((member) => rowAligned({a: member.box, b: child.box})))
      if (line === undefined) return [...found, [child]]
      line.push(child)
      return found
    }, [])
    .map((line) => line.toSorted((a, b) => a.box.x - b.box.x))
}

function rowAligned(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  if (sharedSpan({a, b, axis: 'y'}) <= 0 || sharedSpan({a, b, axis: 'x'}) > TOLERANCES.layoutTolerance) return false
  return crossAlignment({boxes: [a, b], axis: 'y'}) !== null
}

function sharedSpan(input: {a: Box; b: Box; axis: Axis}): number {
  const {a, b, axis} = input
  return Math.min(end({box: a, axis}), end({box: b, axis})) - Math.max(start({box: a, axis}), start({box: b, axis}))
}

function end(input: {box: Box; axis: Axis}): number {
  return start(input) + extent(input)
}

function start(input: {box: Box; axis: Axis}): number {
  return input.axis === 'x' ? input.box.x : input.box.y
}

function extent(input: {box: Box; axis: Axis}): number {
  return input.axis === 'x' ? input.box.w : input.box.h
}

function crossAlignment(input: {boxes: Box[]; axis: Axis}): Align | null {
  const {boxes, axis} = input
  const whole = union(boxes)
  const agree = (read: (box: Box) => number): boolean => boxes.every((box) => near({a: read(box), b: read(whole)}))
  if (agree((box) => extent({box, axis}))) return 'stretch'
  if (agree((box) => start({box, axis}))) return 'start'
  if (agree((box) => start({box, axis}) + extent({box, axis}) / 2)) return 'center'
  if (agree((box) => end({box, axis}))) return 'end'
  return null
}

function near(input: {a: number; b: number}): boolean {
  return Math.abs(input.a - input.b) <= TOLERANCES.layoutTolerance
}

function directionFrom(lines: Placed[][]): ContainerLayout['direction'] {
  const [first = []] = lines
  if (lines.flat().length === 1) return 'stack'
  if (lines.length === 1) return 'row'
  if (!stacked(lines)) return 'stack'
  if (lattice(lines)) return lines.every((line) => line.length === first.length) ? 'grid' : 'row'
  return crossAlignment({boxes: lines.map(lineBox), axis: 'x'}) === null ? 'stack' : 'column'
}

function stacked(lines: Placed[][]): boolean {
  const unions = lines.map(lineBox)
  return unions.every((box, index) => {
    const previous = unions[index - 1]
    return previous === undefined || box.y >= previous.y + previous.h - TOLERANCES.layoutTolerance
  })
}

function lineBox(line: Placed[]): Box {
  return union(line.map((child) => child.box))
}

function lattice(lines: Placed[][]): boolean {
  const [first = [], ...rest] = lines
  if (first.length < 2 || rest.length === 0) return false
  const full = rest.slice(0, -1).every((line) => line.length === first.length)
  const last = rest.at(-1) ?? []
  if (!full || last.length > first.length) return false
  return rest.every((line) =>
    line.every((child, position) => {
      const column = first[position]
      return column !== undefined && near({a: child.box.x, b: column.box.x})
    }),
  )
}

function paddingAround(input: {box: Box; inner: Box}): ContainerLayout['padding'] {
  const {box, inner} = input
  const inset = (value: number): number => Math.max(0, Math.round(value))
  return {
    top: inset(inner.y - box.y),
    right: inset(box.x + box.w - (inner.x + inner.w)),
    bottom: inset(box.y + box.h - (inner.y + inner.h)),
    left: inset(inner.x - box.x),
  }
}

function fills(input: {line: Placed[]; width: number}): boolean {
  const {line, width} = input
  if (line.length < 2) return false
  const widths = line.map((child) => child.box.w)
  const middle = median(widths)
  return widths.every((value) => near({a: value, b: middle})) && near({a: lineBox(line).w, b: width})
}

function gapFrom(input: {direction: ContainerLayout['direction']; lines: Placed[][]}): ContainerLayout['gap'] {
  const {direction, lines} = input
  if (direction === 'row' || direction === 'grid') {
    return summary(gapsAlong({boxes: (lines[0] ?? []).map((child) => child.box), axis: 'x'}))
  }
  if (!stacked(lines)) return summary([])
  return summary(gapsAlong({boxes: lines.map(lineBox), axis: 'y'}))
}

function summary(gaps: number[]): ContainerLayout['gap'] {
  if (gaps.length === 0) return {px: 0, uniform: true}
  const middle = median(gaps)
  return {px: Math.round(middle), uniform: gaps.every((gap) => near({a: gap, b: middle}))}
}

function gapsAlong(input: {boxes: Box[]; axis: Axis}): number[] {
  const {boxes, axis} = input
  return boxes.slice(1).map((box, index) => {
    const previous = boxes[index] ?? box
    return start({box, axis}) - end({box: previous, axis})
  })
}

function alignFrom(input: {direction: ContainerLayout['direction']; lines: Placed[][]; box: Box}): Align {
  const {direction, lines, box} = input
  const ordered = lines.flat()
  const [only] = ordered
  if (ordered.length === 1 && only !== undefined) return centred({inner: only.box, outer: box}) ? 'center' : 'start'
  if (direction === 'row' || direction === 'grid') {
    return crossAlignment({boxes: (lines[0] ?? []).map((child) => child.box), axis: 'y'}) ?? 'start'
  }
  return crossAlignment({boxes: lines.map(lineBox), axis: 'x'}) ?? 'start'
}

function centred(input: {inner: Box; outer: Box}): boolean {
  const {inner, outer} = input
  const left = inner.x - outer.x
  const right = outer.x + outer.w - (inner.x + inner.w)
  const top = inner.y - outer.y
  const bottom = outer.y + outer.h - (inner.y + inner.h)
  return near({a: left, b: right}) && near({a: top, b: bottom})
}

function sizeFrom(input: {child: Placed; filled: Set<string>}): NodeLayout['size'] {
  const {child, filled} = input
  if (child.node.kind === 'text') return 'fit'
  if (filled.has(child.node.id)) return 'fill'
  if (child.node.kind === 'box' && hugs(child)) return 'fit'
  return 'fixed'
}

function hugs(child: Placed): boolean {
  const {box, glyph} = child
  if (glyph === null) return false
  return (['x', 'y'] as const).every(
    (axis) =>
      near({a: start({box, axis}), b: start({box: glyph, axis})}) &&
      near({a: end({box, axis}), b: end({box: glyph, axis})}),
  )
}
