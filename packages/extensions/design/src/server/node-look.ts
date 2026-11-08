import {z} from 'zod'
import type {Design, DesignNode} from '../shared/defs.js'
import {walk} from '../shared/tree.js'

export function nodeLooks(design: Design): NodeLook[] {
  return [...walk(design.root)].flatMap(({node, parent, depth}) => {
    const facts = node.figma
    if (facts === undefined) return []
    return [lookOf({node, facts, within: parent?.id ?? null, depth, scale: design.scale})]
  })
}

type Facts = NonNullable<DesignNode['figma']>

type NodeLook = {
  node: string
  type: string
  name: string
  within: string | null
  depth: number
  x: number
  y: number
  w: number
  h: number
  fill_kind: 'solid' | 'gradient' | 'image' | 'none'
  fill: string | null
  fill_opacity: number | null
  stroke: string | null
  stroke_weight: number | null
  radius: number | null
  font_family: string | null
  font_weight: number | null
  font_size: number | null
  line_height: number | null
  text_align: string | null
  text: string | null
  opacity: number | null
  image: boolean
  asset: string | null
  token_fill: string | null
  token_stroke: string | null
  token_radius: string | null
  token_font: string | null
  token_gap: string | null
  token_padding: string | null
  gradient: {from: string; to: string} | null
}

const StopSchema = z.object({color: z.string()})
const PaintSchema = z.object({
  type: z.string(),
  color: z.string().optional(),
  opacity: z.number().optional(),
  stops: z.array(StopSchema).optional(),
})
const TokensSchema = z.partialRecord(z.enum(['fill', 'stroke', 'radius', 'font', 'gap', 'padding']), z.string())
const FieldsSchema = z.object({
  fills: z.array(PaintSchema).catch([]),
  strokes: z.array(PaintSchema).catch([]),
  strokeWeight: z.number().optional().catch(undefined),
  radius: z
    .union([z.number(), z.array(z.number())])
    .optional()
    .catch(undefined),
  text: z.string().optional().catch(undefined),
  font: z
    .object({
      family: z.string().optional(),
      size: z.number().optional(),
      weight: z.number().optional(),
      lineHeight: z.object({value: z.number()}).optional(),
      align: z.string().optional(),
    })
    .optional()
    .catch(undefined),
  opacity: z.number().optional().catch(undefined),
  image: z.boolean().optional().catch(undefined),
  asset: z.string().optional().catch(undefined),
  tokens: TokensSchema.catch({}),
})

function lookOf(input: {
  node: DesignNode
  facts: Facts
  within: string | null
  depth: number
  scale: number
}): NodeLook {
  const {node, facts, scale} = input
  const fields = FieldsSchema.parse({fills: [], strokes: [], tokens: {}, ...facts.fields})
  const fill = fields.fills.at(-1)
  const stroke = fields.strokes.findLast((paint) => paint.type === 'solid')
  const font = fields.font
  const px = (value: number | undefined): number | null => (value === undefined ? null : value * scale)
  const radius = Array.isArray(fields.radius) ? fields.radius[0] : fields.radius
  const image = node.kind === 'image' || fields.image === true
  const first = fill?.stops?.[0]?.color
  const last = fill?.stops?.at(-1)?.color
  const {tokens} = fields
  return {
    node: node.id,
    type: facts.type,
    name: facts.name,
    within: input.within,
    depth: input.depth,
    ...facts.box,
    fill_kind: fillKind({image, type: fill?.type}),
    fill: fill?.color ?? first ?? null,
    fill_opacity: fill?.opacity ?? null,
    stroke: stroke?.color ?? null,
    stroke_weight: stroke === undefined ? null : px(fields.strokeWeight ?? 1),
    radius: px(radius),
    font_family: font?.family ?? null,
    font_weight: font?.weight ?? null,
    font_size: px(font?.size),
    line_height: px(font?.lineHeight?.value),
    text_align: font?.align ?? null,
    text: facts.type === 'TEXT' ? (fields.text ?? '') : null,
    opacity: fields.opacity ?? null,
    image,
    asset: fields.asset ?? null,
    token_fill: tokens.fill ?? null,
    token_stroke: tokens.stroke ?? null,
    token_radius: tokens.radius ?? null,
    token_font: tokens.font ?? null,
    token_gap: tokens.gap ?? null,
    token_padding: tokens.padding ?? null,
    gradient: first === undefined || last === undefined ? null : {from: first, to: last},
  }
}

function fillKind(input: {image: boolean; type: string | undefined}): NodeLook['fill_kind'] {
  if (input.image) return 'image'
  if (input.type === undefined) return 'none'
  if (input.type === 'solid') return 'solid'
  return input.type.endsWith('gradient') ? 'gradient' : 'none'
}
