import {z} from 'zod'
import type {Box, DesignNode, IdNode} from '../../shared/defs.js'
import {designConfig} from '../../shared/tolerances.js'

export function layoutVote(input: {node: DesignNode; element: Laid}): number {
  const {node, element} = input
  const {cssom} = element
  if (cssom === undefined) return 0
  const laidOut = cssom.display.includes(FLEX) || cssom.display.includes(GRID)
  const mode = node.figma?.mode ?? null
  if (mode !== null && FLOWS.has(mode)) {
    if (node.children.some((child) => child.implied === true)) return 0
    const row = flowRow(cssom) ?? (laidOut ? null : paddedFlow({node, element}))
    if (row === null) return 0
    return row === (mode === HORIZONTAL) ? WEIGHT : -WEIGHT
  }
  if (node.kind !== 'text') return 0
  return laidOut && element.kids > 0 ? -WEIGHT : WEIGHT
}

type Styles = IdNode['cssom'][number]

type Laid = {box: Box; kids: number; cssom: Styles | undefined; sole: {box: Box; cssom: Styles | undefined} | undefined}

const WEIGHT = designConfig.tolerances.figmaPair.layoutRoleWeight

const SAME_PX = designConfig.tolerances.geometryPx

const FLEX = 'flex'

const GRID = 'grid'

const ROW = 'row'

const HORIZONTAL = 'HORIZONTAL'

const FLOWS = new Set([HORIZONTAL, 'VERTICAL'])

const PaddedSchema = z.object({pad: z.array(z.number())})

function flowRow(cssom: Styles): boolean | null {
  const flex = cssom.display.includes(FLEX)
  if (!flex && (cssom.columns ?? 0) < 2) return null
  return flex ? cssom.flexDirection.startsWith(ROW) : true
}

function paddedFlow(input: {node: DesignNode; element: Laid}): boolean | null {
  const {sole, box} = input.element
  const padded = PaddedSchema.safeParse(input.node.figma?.fields.layout)
  if (sole === undefined || sole.cssom === undefined || !padded.success) return null
  const {pad} = padded.data
  const inner = sole.box
  const inset = [inner.y - box.y, box.x + box.w - inner.x - inner.w, box.y + box.h - inner.y - inner.h, inner.x - box.x]
  const fits =
    pad.some((side) => side > 0) && inset.every((side, index) => Math.abs(side - (pad[index] ?? 0)) <= SAME_PX)
  return fits ? flowRow(sole.cssom) : null
}
