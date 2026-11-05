import {zip} from 'es-toolkit'
import type {Box, Delta, LiveComponent, Raster} from '../shared/defs.js'
import {box as boxes} from '../shared/box.js'
import {designConfig} from '../shared/tolerances.js'
import {readSides} from './sides.js'

export const deltaKinds = {
  measure: (input: {
    element: Element
    elements: Element[]
    live: Raster
    target: Raster
    page: Box
    color: Metric
    shift: Shift
  }): Delta[] => measureDeltas(input),
  size: (input: {delta: Delta; color: Metric}): number => deltaSize(input),
}

type Metric = keyof typeof designConfig.colorMetrics

type LiveStyles = LiveComponent['styles']

type Gradient = NonNullable<LiveStyles['gradient']>

type Shift = {dx: number; dy: number}

type Element = Parameters<typeof readSides>[0]['element']

const TOLERANCES = designConfig.tolerances

function leadingFamily(stack: string): string {
  return (stack.split(',')[0] ?? '').replaceAll('"', '').replaceAll("'", '').trim()
}

function sameFamily(input: {a: string; b: string}): boolean {
  return leadingFamily(input.a).toLowerCase() === leadingFamily(input.b).toLowerCase()
}

function deltaSize(input: {delta: Delta; color: Metric}): number {
  const {delta, color} = input
  const {live, target} = delta
  const gradient = [live, target].some((paint) => typeof paint === 'string' && paint.startsWith(GRADIENT_WORD))
  if (delta.kind === 'background' && gradient && typeof live === 'string' && typeof target === 'string') {
    return capped(gradientDistance({live, target, color}) / TOLERANCES.colorDeltaE)
  }
  if (COLOR_KINDS.includes(delta.kind) && typeof live === 'string' && typeof target === 'string') {
    return capped(designConfig.colorMetrics[color]({a: live, b: target}) / TOLERANCES.colorDeltaE)
  }
  if (typeof live !== 'number' || typeof target !== 'number') return SIZE_CAP
  const span = delta.kind === 'lines' ? (delta.lineHeight ?? 1) : 1
  return capped((Math.abs(live - target) * span) / designConfig.kindTolerance(delta.kind))
}

const SIZE_CAP = 10

const COLOR_KINDS: Delta['kind'][] = ['background', 'foreground', 'border']

const GRADIENT_WORD = 'gradient '

function gradientDistance(input: {live: string; target: string; color: Metric}): number {
  const {live, target, color} = input
  const shown = paintEnds(live)
  const design = paintEnds(target)
  const elements =
    shown.length === design.length
      ? zip(shown, design).map(([a, b]) => ({a, b}))
      : shown.flatMap((a) => design.map((b) => ({a, b})))
  return Math.max(...elements.map((element) => designConfig.colorMetrics[color](element)))
}

function paintEnds(paint: string): string[] {
  if (!paint.startsWith(GRADIENT_WORD)) return [paint]
  const [, from = paint, , to = paint] = paint.split(' ')
  return [from, to]
}

function capped(value: number): number {
  return Math.min(SIZE_CAP, value)
}

function measureDeltas(input: {
  element: Element
  elements: Element[]
  live: Raster
  target: Raster
  page: Box
  color: Metric
  shift: Shift
}): Delta[] {
  const {element, color} = input
  const sides = readSides(input)
  const deltas = DELTA_KINDS.flatMap((kind) => kind.measure({live: sides.live, target: sides.target, color}))
  const confidence = element.live.opinion?.confidence
  if (sides.opinion === null || confidence === undefined) return deltas
  const {opinion} = sides
  return deltas.map((delta) => withOpinion({delta, side: opinion, confidence}))
}

function withOpinion(input: {delta: Delta; side: Side; confidence: number}): Delta {
  const {delta, side, confidence} = input
  const live = DELTA_KINDS.find((kind) => kind.kind === delta.kind)?.read?.(side) ?? null
  if (live === null) return delta
  return {...delta, opinion: {source: 'takumi', live, confidence}}
}

function colorKind(input: {kind: 'background' | 'foreground'; tolerance: number}): DeltaKind {
  const {kind, tolerance} = input
  const key = kind === 'background' ? 'background' : 'color'
  return {
    kind,
    measure: ({live, target, color}) => {
      const a = live.styles[key]
      const b = target.styles[key]
      if (a === undefined || b === undefined || designConfig.colorMetrics[color]({a, b}) <= tolerance) return []
      return [{kind, live: a, target: b}]
    },
  }
}

const solidBackground = colorKind({kind: 'background', tolerance: TOLERANCES.declaredColorDeltaE})

const background: DeltaKind = {
  kind: 'background',
  measure: (input) => {
    const {live, target, color} = input
    const design = target.styles.gradient
    const shown = live.styles.gradient
    if (design !== null && design !== undefined) return gradientDeltas({design, live, color})
    if (shown === null || shown === undefined || live.styles.background !== undefined) {
      return solidBackground.measure(input)
    }
    return solidBackground.measure({...input, live: {...live, styles: {...live.styles, background: shown.from}}})
  },
}

function gradientDeltas(input: {design: Gradient; live: Side; color: Metric}): Delta[] {
  const {design, live, color} = input
  const target = `gradient ${design.from} to ${design.to}`
  const shown = live.styles.gradient
  if (shown === null || shown === undefined) {
    const solid = live.styles.background
    return solid === undefined ? [] : [{kind: 'background', live: solid, target}]
  }
  const ends = [
    {a: shown.from, b: design.from},
    {a: shown.to, b: design.to},
  ]
  if (ends.every((end) => designConfig.colorMetrics[color](end) <= TOLERANCES.colorDeltaE)) return []
  return [{kind: 'background', live: `gradient ${shown.from} to ${shown.to}`, target}]
}

const foreground = colorKind({kind: 'foreground', tolerance: TOLERANCES.colorDeltaE})

type Insets = {left: number; right: number; top: number; bottom: number}

function measureInsets(side: Side): Insets | null {
  const {box, textBox, padding} = side
  if (padding !== null) return padding
  if (textBox === null) return null
  return {
    left: Math.round(textBox.x - box.x),
    right: Math.round(box.x + box.w - (textBox.x + textBox.w)),
    top: Math.round(textBox.y - box.y),
    bottom: Math.round(box.y + box.h - (textBox.y + textBox.h)),
  }
}

function insetDiffers(input: {live: number; target: number}): boolean {
  return Math.abs(input.live - input.target) > TOLERANCES.geometryPx
}

function insetKind(edge: keyof Insets): DeltaKind {
  const kind = `inset-${edge}` as const
  const read = (side: Side): number | null => measureInsets(side)?.[edge] ?? null
  return {
    kind,
    read,
    measure: ({live, target}) => {
      const a = read(live)
      const b = read(target)
      if (a === null || b === null || !insetDiffers({live: a, target: b})) return []
      return [{kind, live: a, target: b}]
    },
  }
}

const insetLeft = insetKind('left')

const insetRight = insetKind('right')

const insetTop = insetKind('top')

const insetBottom = insetKind('bottom')

function gapBetween(input: {first: Box; second: Box; axis: 'row' | 'column'}): number {
  const {first, second, axis} = input
  return Math.round(axis === 'row' ? second.x - boxes.right(first) : second.y - boxes.bottom(first))
}

function measureGap(input: {side: Side; before: boolean}): number | null {
  const {side, before} = input
  if (side.axis === null) return null
  const other = before ? side.prev : side.next
  if (other === null) return null
  if (before) return gapBetween({first: other, second: side.box, axis: side.axis})
  return gapBetween({first: side.box, second: other, axis: side.axis})
}

function gapKind(before: boolean): DeltaKind {
  const kind = before ? 'gap-before' : 'gap-after'
  const read = (side: Side): number | null => measureGap({side, before})
  return {
    kind,
    read,
    measure: ({live, target}) => {
      const a = read(live)
      const b = read(target)
      if (a === null || b === null || !insetDiffers({live: a, target: b})) return []
      return [{kind, live: a, target: b}]
    },
  }
}

const gapBefore = gapKind(true)

const gapAfter: DeltaKind = {...gapKind(false), measure: () => []}

function classifyAlign(side: Side): string | null {
  const insets = measureInsets(side)
  if (insets === null) return null
  const near = (value: number): boolean => Math.abs(value) <= TOLERANCES.geometryPx
  if (near(insets.left) && near(insets.right)) return 'stretch'
  if (near(insets.left - insets.right)) return 'center'
  if (near(insets.left)) return 'left'
  if (near(insets.right)) return 'right'
  return null
}

const align: DeltaKind = {
  kind: 'align',
  read: classifyAlign,
  measure: ({live, target}) => {
    const a = classifyAlign(live)
    const b = classifyAlign(target)
    if (a === null || b === null || a === b) return []
    return [{kind: 'align', live: a, target: b}]
  },
}

function measurePadding(side: Side): {x: number; y: number} | null {
  if (side.styles.fontSize === undefined) return null
  const insets = measureInsets(side)
  if (insets === null) return null
  return {x: Math.round((insets.left + insets.right) / 2), y: Math.round((insets.top + insets.bottom) / 2)}
}

const padding: DeltaKind = {
  kind: 'padding',
  measure: ({live, target}) => {
    const a = measurePadding(live)
    const b = measurePadding(target)
    if (a === null || b === null) return []
    return (['x', 'y'] as const).flatMap((side) =>
      insetDiffers({live: a[side], target: b[side]})
        ? [{kind: 'padding' as const, side, live: a[side], target: b[side]}]
        : [],
    )
  },
}

function sizeKind(input: {kind: 'width' | 'height'; key: 'w' | 'h'}): DeltaKind {
  const {kind, key} = input
  const read = (side: Side): number => Math.round(side.box[key])
  return {
    kind,
    read,
    measure: ({live, target}) => {
      if (target.kind === 'text' && (key === 'h' || !overflowsParent(live))) return []
      const a = target.kind === 'text' ? Math.round(extent(live)[key]) : read(live)
      const b = read(target)
      if (!insetDiffers({live: a, target: b})) return []
      return [{kind, live: a, target: b}]
    },
  }
}

function overflowsParent(side: Side): boolean {
  const {parent} = side
  if (parent === null) return false
  const box = extent(side)
  return parent.x - box.x > TOLERANCES.geometryPx || boxes.right(box) - boxes.right(parent) > TOLERANCES.geometryPx
}

const boxWidth = sizeKind({kind: 'width', key: 'w'})

const boxHeight = sizeKind({kind: 'height', key: 'h'})

const lines: DeltaKind = {
  kind: 'lines',
  measure: ({live, target}) => {
    if (target.kind !== 'text' || live.lines === null || target.lines === null || live.lines === target.lines) return []
    const spacing = target.styles.lineHeight ?? live.styles.lineHeight
    return [
      {kind: 'lines', live: live.lines, target: target.lines, ...(spacing === undefined ? {} : {lineHeight: spacing})},
    ]
  },
}

const radius: DeltaKind = {
  kind: 'radius',
  measure: ({live, target}) => {
    const a = live.radius
    const b = target.radius
    if (a === null || b === null || !insetDiffers({live: a, target: b})) return []
    return [{kind: 'radius', live: a, target: b}]
  },
}

const border: DeltaKind = {
  kind: 'border',
  measure: ({live, target, color}) => {
    const declared = live.styles.border
    if (declared === undefined || live.edge === null || target.edge === null) return []
    if (designConfig.colorMetrics[color]({a: live.edge, b: target.edge}) <= TOLERANCES.colorDeltaE) return []
    return [{kind: 'border', side: declared.side, live: declared.color, target: target.edge}]
  },
}

const axis: DeltaKind = {
  kind: 'axis',
  measure: ({live, target}) => {
    if (live.flow === null || target.flow === null || live.flow === target.flow) return []
    return [{kind: 'axis', live: live.flow, target: target.flow}]
  },
}

const sizing: DeltaKind = {
  kind: 'sizing',
  measure: ({live, target}) => {
    if (live.size !== 'fixed' || (target.size !== 'fill' && target.size !== 'fit')) return []
    return [{kind: 'sizing', live: 'fixed', target: target.size}]
  },
}

const columns: DeltaKind = {
  kind: 'columns',
  measure: ({live, target}) => {
    if (live.columns === null || target.columns === null || live.columns === target.columns) return []
    return [{kind: 'columns', live: live.columns, target: target.columns}]
  },
}

const SIZE_TOLERANCE = 0.5

function typographyKind(input: {kind: 'fontSize' | 'lineHeight' | 'fontWeight'; tolerance: number}): DeltaKind {
  const {kind, tolerance} = input
  const key: keyof LiveStyles = kind
  return {
    kind,
    measure: ({live, target}) => {
      const a = live.styles[key]
      const b = target.styles[key]
      if (typeof a !== 'number' || typeof b !== 'number' || Math.abs(a - b) <= tolerance) return []
      return [{kind, live: a, target: b}]
    },
  }
}

const fontSize = typographyKind({kind: 'fontSize', tolerance: SIZE_TOLERANCE})

const lineHeight = typographyKind({kind: 'lineHeight', tolerance: SIZE_TOLERANCE})

const fontWeight = typographyKind({kind: 'fontWeight', tolerance: 0})

const font: DeltaKind = {
  kind: 'font',
  measure: ({live, target}) => {
    const a = live.styles.fontFamily
    const b = target.styles.fontFamily
    if (a === undefined || b === undefined || sameFamily({a, b})) return []
    return [{kind: 'font', live: leadingFamily(a), target: leadingFamily(b)}]
  },
}

const DELTA_KINDS: DeltaKind[] = [
  insetLeft,
  insetRight,
  insetTop,
  insetBottom,
  boxWidth,
  boxHeight,
  lines,
  gapBefore,
  gapAfter,
  align,
  padding,
  fontSize,
  lineHeight,
  fontWeight,
  font,
  background,
  foreground,
  radius,
  border,
  axis,
  columns,
  sizing,
]

function extent(side: Side): Box {
  return side.ink === null ? side.box : (boxes.bounds([side.box, side.ink]) ?? side.box)
}

type Side = ReturnType<typeof readSides>['live']

type DeltaKind = {
  kind: Delta['kind']
  measure(input: {live: Side; target: Side; color: Metric}): Delta[]
  read?(side: Side): number | string | null
}
