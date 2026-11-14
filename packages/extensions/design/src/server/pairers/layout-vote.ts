import {z} from 'zod'
import type {Box, DesignNode, IdNode} from '../../shared/defs.js'
import {designConfig} from '../../shared/tolerances.js'

export function layoutVote(input: {node: DesignNode; element: Laid}): number {
  const {node, element} = input
  const {cssom} = element
  if (cssom === undefined) return 0
  const mode = node.figma?.mode ?? null
  if (mode !== null && FLOWS.has(mode))
    return paddedInside({node, element}) ? 0 : flowVote({node, element, cssom, row: mode === HORIZONTAL})
  if (node.kind !== 'text') return 0
  return laidOut(cssom) && element.kids > 0 ? -WEIGHT : WEIGHT
}

type Styles = IdNode['cssom'][number]

type Laid = {
  box: Box
  kids: number
  cssom: Styles | undefined
  sole: Sole | undefined
  wrapper: {box: Box; sole: Sole} | undefined
}

type Sole = {box: Box; cssom: Styles | undefined}

const WEIGHT = designConfig.tolerances.figmaPair.layoutRoleWeight

const SAME_PX = designConfig.tolerances.geometryPx

const FLEX = 'flex'

const GRID = 'grid'

const ROW = 'row'

const HORIZONTAL = 'HORIZONTAL'

const FLOWS = new Set([HORIZONTAL, 'VERTICAL'])

const PaddedSchema = z.object({pad: z.array(z.number())})

function flowVote(input: {node: DesignNode; element: Laid; cssom: Styles; row: boolean}): number {
  const {children} = input.node
  if (children.length < 2 || children.some((child) => child.implied === true)) return 0
  const row = flowRow(input.cssom) ?? (laidOut(input.cssom) ? null : paddedFlow(input))
  if (row === null) return 0
  return row === input.row ? WEIGHT : -WEIGHT
}

function laidOut(cssom: Styles): boolean {
  return cssom.display.includes(FLEX) || cssom.display.includes(GRID)
}

function flowRow(cssom: Styles): boolean | null {
  const flex = cssom.display.includes(FLEX)
  if (!flex && (cssom.columns ?? 0) < 2) return null
  return flex ? cssom.flexDirection.startsWith(ROW) : true
}

function paddedInside(input: {node: DesignNode; element: Laid}): boolean {
  const {wrapper} = input.element
  return wrapper !== undefined && paddedFlow({node: input.node, element: wrapper}) !== null
}

function paddedFlow(input: {node: DesignNode; element: {box: Box; sole: Sole | undefined}}): boolean | null {
  const {sole, box} = input.element
  const padded = PaddedSchema.safeParse(input.node.figma?.fields.layout)
  if (sole === undefined || sole.cssom === undefined || !padded.success) return null
  const {pad} = padded.data
  const inner = sole.box
  const inset = [inner.y - box.y, box.x + box.w - inner.x - inner.w, box.y + box.h - inner.y - inner.h, inner.x - box.x]
  const atPad = inset.map((side, index) => Math.abs(side - (pad[index] ?? 0)) <= SAME_PX)
  const fits =
    inset.some((side, index) => side > SAME_PX && atPad[index] === true) &&
    inset.every((side, index) => atPad[index] === true || Math.abs(side) <= SAME_PX)
  return fits ? flowRow(sole.cssom) : null
}
