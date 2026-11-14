import type {Box, LiveComponent} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
import type {nodeLooks, StrokeSides} from './node-look.js'

export function borderRow(input: {
  look: ReturnType<typeof nodeLooks>[number]
  element: LiveComponent
  boxed: LiveComponent[]
  ancestors: LiveComponent[]
}): {expected: string; found: string} | null {
  const {look, element, ancestors} = input
  const {stroke} = look
  if (stroke === null) return null
  const {border} = element.styles
  const wanted = look.strokeSides === null ? null : sidesDrawn(look.strokeSides)
  const weight = look.strokeSides === null ? (look.stroke_weight ?? 1) : Math.max(...Object.values(look.strokeSides))
  const where = (sides: string[]) => (wanted === null ? '' : ` on ${sides.join(', ')}`)
  const shown =
    border.style === 'none' || border.width === 0
      ? 'none'
      : `${border.width}px ${border.color}${where(border.sides.map((side) => side.side))}`
  const lines = (one: LiveComponent): string[] => {
    const drawn = one.styles.border
    return drawn.width === weight && near({a: drawn.color, b: stroke}) ? drawn.sides.map((side) => side.side) : []
  }
  const own = [element, ...input.boxed]
  const aligned = look.strokeAlign === null ? '' : ` ${look.strokeAlign}`
  const told = {expected: `${weight}px ${stroke}${aligned}${where(wanted ?? [])}`, found: shown}
  if (wanted === null) return own.some((one) => lines(one).length > 0) ? null : told
  if (own.some((one) => lines(one).join() === wanted.join())) return null
  const edge = rounded(element.bounds)
  const drawsOn = (side: string) => (one: LiveComponent) =>
    lines(one).includes(side) && flush({box: rounded(one.bounds), edge, side})
  const kin = [...own, ...ancestors, ...descendants(element)]
  const extra = own.flatMap(lines).filter((side) => !wanted.includes(side) && !ancestors.some(drawsOn(side)))
  return wanted.every((side) => kin.some(drawsOn(side))) && extra.length === 0 ? null : told
}

function sidesDrawn(sides: StrokeSides): string[] {
  return BORDER_ORDER.filter((side) => sides[side] > 0)
}

const BORDER_ORDER = ['top', 'right', 'bottom', 'left'] as const
const PX = designConfig.tolerances.geometryPx
const COLOR_DELTA = designConfig.tolerances.colorDeltaE
const distance = designConfig.colorMetrics.ciede2000

function* descendants(element: LiveComponent): Generator<LiveComponent> {
  for (const child of element.children) {
    yield child
    yield* descendants(child)
  }
}

function flush(input: {box: Box; edge: Box; side: string}): boolean {
  const {box, edge, side} = input
  const across = side === 'top' || side === 'bottom'
  const start = across ? box.x - edge.x : box.y - edge.y
  const end = across ? box.x + box.w - (edge.x + edge.w) : box.y + box.h - (edge.y + edge.h)
  const spans = start <= PX && end >= -PX
  const lineOf = (one: Box): number => {
    if (side === 'top') return one.y
    if (side === 'bottom') return one.y + one.h
    if (side === 'left') return one.x
    return one.x + one.w
  }
  return spans && Math.abs(lineOf(box) - lineOf(edge)) <= PX
}

function rounded(box: Box): Box {
  return {x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h)}
}

function near(input: {a: string; b: string}): boolean {
  return distance(input) <= COLOR_DELTA
}
