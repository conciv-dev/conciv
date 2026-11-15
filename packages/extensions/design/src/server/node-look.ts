import {mapValues} from 'es-toolkit'
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
  fill_kind: 'solid' | 'gradient' | 'image' | 'image-stack' | 'none'
  fill: string | null
  fill_opacity: number | null
  stroke: string | null
  stroke_weight: number | null
  strokeAlign: string | null
  strokeSides: StrokeSides | null
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
  gradient: {from: Stop; to: Stop} | null
  line: LineKind
}

type LineKind = 'fixed' | 'auto' | 'trimmed'

type Stop = {color: string; opacity: number}

export type StrokeSides = z.output<typeof StrokeSidesSchema>

const PIXELS = 'PIXELS'
const INTRINSIC = 'INTRINSIC'
const StopSchema = z.object({color: z.string(), opacity: z.number().default(1)})
const PaintSchema = z.object({
  type: z.string(),
  color: z.string().optional(),
  opacity: z.number().optional(),
  stops: z.array(StopSchema).optional(),
})
const StrokeSidesSchema = z.object({top: z.number(), right: z.number(), bottom: z.number(), left: z.number()})
const TokensSchema = z.partialRecord(z.enum(['fill', 'stroke', 'radius', 'font', 'gap', 'padding']), z.string())
const FieldsSchema = z.object({
  fills: z.array(PaintSchema).catch([]),
  strokes: z.array(PaintSchema).catch([]),
  strokeWeight: z.number().optional().catch(undefined),
  strokeAlign: z.string().optional().catch(undefined),
  individualStrokeWeights: StrokeSidesSchema.optional().catch(undefined),
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
      lineHeight: z.object({value: z.number(), unit: z.string().default(PIXELS)}).optional(),
      trim: z.string().optional(),
      align: z.string().optional(),
    })
    .optional()
    .catch(undefined),
  opacity: z.number().optional().catch(undefined),
  image: z.boolean().optional().catch(undefined),
  asset: z.string().optional().catch(undefined),
  assetLayers: z.array(z.unknown()).optional().catch(undefined),
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
  const image = node.kind === 'image' || fields.image === true
  return {
    node: node.id,
    type: facts.type,
    name: facts.name,
    within: input.within,
    depth: input.depth,
    ...facts.box,
    ...paintLook({fields, image: image && node.children.length === 0, scale}),
    ...fontLook({font: fields.font, scale}),
    text: facts.type === 'TEXT' ? (fields.text ?? '') : null,
    opacity: fields.opacity ?? null,
    image,
    asset: fields.asset ?? null,
    ...tokenLook(fields.tokens),
  }
}

type Fields = z.output<typeof FieldsSchema>

function paintLook(input: {fields: Fields; image: boolean; scale: number}) {
  const {fields, scale} = input
  const fill = fields.fills.at(-1)
  const stroke = fields.strokes.findLast((paint) => paint.type === 'solid')
  const radius = Array.isArray(fields.radius) ? fields.radius[0] : fields.radius
  const first = fill?.stops?.[0]
  const last = fill?.stops?.at(-1)
  return {
    fill_kind: fillKind({image: input.image, stack: fields.assetLayers !== undefined, type: fill?.type}),
    fill: fill?.color ?? first?.color ?? null,
    fill_opacity: fill?.opacity ?? null,
    stroke: stroke?.color ?? null,
    stroke_weight: stroke === undefined ? null : scaled(fields.strokeWeight ?? 1, scale),
    strokeAlign: stroke === undefined ? null : (fields.strokeAlign?.toLowerCase() ?? null),
    strokeSides:
      stroke === undefined || fields.individualStrokeWeights === undefined
        ? null
        : mapValues(fields.individualStrokeWeights, (weight) => weight * scale),
    radius: scaled(radius, scale),
    gradient: first === undefined || last === undefined ? null : {from: first, to: last},
  }
}

function fontLook(input: {font: Fields['font']; scale: number}) {
  const {font, scale} = input
  const line = lineKind(font)
  return {
    font_family: font?.family ?? null,
    font_weight: font?.weight ?? null,
    font_size: scaled(font?.size, scale),
    line_height: laidLine({line, height: scaled(font?.lineHeight?.value, scale)}),
    text_align: font?.align ?? null,
    line,
  }
}

function laidLine(input: {line: LineKind; height: number | null}): number | null {
  const {line, height} = input
  return line === 'auto' && height !== null ? Math.round(height) : height
}

function lineKind(font: Fields['font']): LineKind {
  if (font?.lineHeight === undefined || !font.lineHeight.unit.startsWith(INTRINSIC)) return 'fixed'
  return font.trim === undefined ? 'auto' : 'trimmed'
}

function tokenLook(tokens: Fields['tokens']) {
  return {
    token_fill: tokens.fill ?? null,
    token_stroke: tokens.stroke ?? null,
    token_radius: tokens.radius ?? null,
    token_font: tokens.font ?? null,
    token_gap: tokens.gap ?? null,
    token_padding: tokens.padding ?? null,
  }
}

function scaled(value: number | undefined, scale: number): number | null {
  return value === undefined ? null : value * scale
}

function fillKind(input: {image: boolean; stack: boolean; type: string | undefined}): NodeLook['fill_kind'] {
  if (input.image) return 'image'
  if (input.stack) return 'image-stack'
  if (input.type === undefined) return 'none'
  if (input.type === 'solid') return 'solid'
  return input.type.endsWith('gradient') ? 'gradient' : 'none'
}
