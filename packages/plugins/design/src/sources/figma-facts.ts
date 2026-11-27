import type {z} from 'zod'
import type {DesignNode} from '../model/design.js'

import type {figmaSchemas} from './figma-schema.js'
import {pick, type Pairs} from '../model/pairs.js'

export function figmaFacts(input: {
  node: FigmaNode
  origin: Origin
  marks: {image: boolean; crop: boolean; stack?: boolean}
}): Facts {
  const {node, origin, marks} = input
  const bounds = node.absoluteBoundingBox ?? {x: origin.x, y: origin.y, width: 0, height: 0}
  const mode = FLOWS.includes(node.layoutMode ?? '') ? (node.layoutMode ?? null) : null
  const {fills, stack} = splitFills({node, stack: marks.stack === true})
  const fields = {
    ...paintFields({node, fills}),
    ...(node.type === 'TEXT' ? {text: node.characters ?? '', font: readFont(node)} : {}),
    ...(mode === null ? {} : {layout: readLayout(node)}),
    ...readSizing(node),
    ...placementFields(node),
    ...readEffects(node),
    ...(marks.image ? {image: true} : {}),
    ...(marks.crop ? {crop: true} : {}),
    ...(stack.length === 0 ? {} : {stack}),
    ...readTokens(node),
  }
  return {
    type: node.type,
    name: node.name,
    absolute: node.layoutPositioning === 'ABSOLUTE',
    mode,
    box: {
      x: (bounds.x - origin.x) * origin.scale,
      y: (bounds.y - origin.y) * origin.scale,
      w: bounds.width * origin.scale,
      h: bounds.height * origin.scale,
    },
    fields,
  }
}

function splitFills(input: {node: FigmaNode; stack: boolean}): {fills: Record<string, unknown>[]; stack: Layer[]} {
  const visible = (input.node.fills ?? []).filter((paint) => paint.visible !== false)
  const bottom = input.stack ? visible.findIndex((paint) => paint.type === 'IMAGE') : -1
  if (bottom < 0) return {fills: paints(visible), stack: []}
  return {fills: paints(visible.slice(0, bottom)), stack: visible.slice(bottom).flatMap(readLayers)}
}

function paintFields(input: {node: FigmaNode; fills: Record<string, unknown>[]}) {
  const {node, fills} = input
  const strokes = paints(node.strokes ?? [])
  const radius = node.rectangleCornerRadii ?? node.cornerRadius
  return {
    ...(fills.length === 0 ? {} : {fills}),
    ...(strokes.length === 0
      ? {}
      : {
          strokes,
          strokeWeight: node.strokeWeight ?? 1,
          ...(node.strokeAlign === undefined ? {} : {strokeAlign: node.strokeAlign}),
          ...(node.individualStrokeWeights === undefined
            ? {}
            : {individualStrokeWeights: node.individualStrokeWeights}),
        }),
    ...(radius === undefined || radius === 0 ? {} : {radius}),
  }
}

function placementFields(node: FigmaNode) {
  return {
    ...(node.layoutAlign === undefined || node.layoutAlign === 'INHERIT' ? {} : {layoutAlign: node.layoutAlign}),
    ...(node.constraints === undefined ? {} : {constraints: node.constraints}),
    ...(node.clipsContent === true ? {clips: true} : {}),
    ...(node.layoutGrow === undefined || node.layoutGrow === 0 ? {} : {grow: node.layoutGrow}),
    ...(node.rotation === undefined || node.rotation === 0 ? {} : {rotation: node.rotation}),
    ...(node.opacity === undefined || node.opacity === 1 ? {} : {opacity: node.opacity}),
  }
}

function paints(list: FigmaPaint[]): Record<string, unknown>[] {
  return list.flatMap((paint) => {
    if (paint.visible === false || paint.type === 'IMAGE') return []
    if (paint.type === 'SOLID' && paint.color !== undefined)
      return [{type: 'solid', color: colorHex(paint.color), opacity: paint.opacity ?? paint.color.a ?? 1}]
    if (paint.gradientStops === undefined) return [{type: paint.type.toLowerCase()}]
    return [{type: gradientType(paint), stops: readStops(paint.gradientStops)}]
  })
}

function readLayers(paint: FigmaPaint): Layer[] {
  const base = {blend: paint.blendMode ?? NORMAL, opacity: paint.opacity ?? 1}
  if (paint.type === 'IMAGE') {
    if (paint.imageRef === undefined) return []
    const factor = paint.scalingFactor === undefined ? {} : {scalingFactor: paint.scalingFactor}
    const filters = paint.filters === undefined ? {} : {filters: paint.filters}
    return [{type: 'image', ...base, ref: paint.imageRef, scale: paint.scaleMode ?? FILL, ...factor, ...filters}]
  }
  if (paint.type === 'SOLID' && paint.color !== undefined)
    return [{type: 'solid', ...base, color: colorHex(paint.color), opacity: paint.opacity ?? paint.color.a ?? 1}]
  if (paint.gradientStops === undefined) return []
  const handles = paint.gradientHandlePositions === undefined ? {} : {handles: paint.gradientHandlePositions}
  return [{type: gradientType(paint), ...base, stops: readStops(paint.gradientStops), ...handles}]
}

function gradientType(paint: FigmaPaint): string {
  return `${paint.type.replace('GRADIENT_', '').toLowerCase()}-gradient`
}

function readStops(stops: NonNullable<FigmaPaint['gradientStops']>): NonNullable<Layer['stops']> {
  return stops.map((stop) => ({
    color: colorHex(stop.color),
    opacity: stop.color.a ?? 1,
    at: Math.round(stop.position * PERCENT),
  }))
}

function readEffects(node: FigmaNode): {effects?: Record<string, unknown>[]} {
  const effects = (node.effects ?? []).flatMap((effect) => {
    const type = pick(EFFECT_TYPES, effect.type)
    return effect.visible === false || type === undefined ? [] : [readEffect({effect, type})]
  })
  return effects.length === 0 ? {} : {effects}
}

function readEffect(input: {effect: FigmaEffect; type: string}): Record<string, unknown> {
  const {effect, type} = input
  const blur = effect.radius ?? 0
  if (!type.endsWith(SHADOW)) return {type, blur}
  const color = effect.color ?? {r: 0, g: 0, b: 0}
  return {
    type,
    color: colorHex(color),
    opacity: color.a ?? 1,
    x: effect.offset?.x ?? 0,
    y: effect.offset?.y ?? 0,
    blur,
    spread: effect.spread ?? 0,
  }
}

function readTokens(node: FigmaNode): {tokens?: Record<string, string>} {
  const bound = node.boundVariables ?? {}
  const found = Object.entries(TOKEN_FIELDS).flatMap(([field, keys]) => {
    const alias = keys.flatMap((key) => [bound[key] ?? []].flat())[0]
    return alias === undefined ? [] : [[field, alias.id] as const]
  })
  return found.length === 0 ? {} : {tokens: Object.fromEntries(found)}
}

function readFont(node: FigmaNode): Record<string, unknown> {
  const style = node.style ?? {}
  return {
    family: style.fontFamily,
    size: style.fontSize,
    weight: style.fontWeight ?? REGULAR_WEIGHT,
    ...(style.fontStyle === undefined ? {} : {style: style.fontStyle}),
    ...(style.lineHeightPx === undefined
      ? {}
      : {lineHeight: {unit: style.lineHeightUnit ?? 'PIXELS', value: style.lineHeightPx}}),
    ...leadingTrim(style.leadingTrim),
    ...(style.letterSpacing === undefined || style.letterSpacing === 0
      ? {}
      : {letterSpacing: {unit: 'PIXELS', value: style.letterSpacing}}),
    ...(style.textAlignHorizontal === undefined ? {} : {align: style.textAlignHorizontal}),
    ...(style.textCase === undefined ? {} : {case: style.textCase}),
    ...(style.textDecoration === undefined ? {} : {decoration: style.textDecoration}),
  }
}

function leadingTrim(trim: string | undefined): {trim?: string} {
  return trim === undefined || trim === NO_TRIM ? {} : {trim}
}

function readLayout(node: FigmaNode): Record<string, unknown> {
  return {
    mode: node.layoutMode,
    gap: node.itemSpacing ?? 0,
    pad: [node.paddingTop ?? 0, node.paddingRight ?? 0, node.paddingBottom ?? 0, node.paddingLeft ?? 0],
    wrap: node.layoutWrap ?? 'NO_WRAP',
    primaryAlign: node.primaryAxisAlignItems ?? 'MIN',
    counterAlign: node.counterAxisAlignItems ?? 'MIN',
    ...(node.primaryAxisSizingMode === undefined ? {} : {primarySizing: node.primaryAxisSizingMode}),
    ...(node.counterAxisSizingMode === undefined ? {} : {counterSizing: node.counterAxisSizingMode}),
  }
}

function readSizing(node: FigmaNode): Record<string, unknown> {
  const {layoutSizingHorizontal: h, layoutSizingVertical: v} = node
  const sizing = h === undefined && v === undefined ? {} : {sizing: {h, v}}
  const limits =
    node.minWidth === undefined && node.maxWidth === undefined
      ? {}
      : {limits: {minW: node.minWidth ?? null, maxW: node.maxWidth ?? null}}
  return {...sizing, ...limits}
}

type FigmaNode = z.infer<typeof figmaSchemas.node>
type FigmaPaint = z.infer<typeof figmaSchemas.paint>
type FigmaEffect = NonNullable<FigmaNode['effects']>[number]
type Layer = z.infer<typeof figmaSchemas.layer>
type Color = z.infer<typeof figmaSchemas.color>
type Origin = {x: number; y: number; scale: number}
type Facts = NonNullable<DesignNode['figma']>

const TOKEN_FIELDS = {
  fill: ['fills'],
  stroke: ['strokes'],
  radius: ['cornerRadius', 'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'],
  font: ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing'],
  gap: ['itemSpacing', 'counterAxisSpacing'],
  padding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
}
const SHADOW = 'shadow'
const EFFECT_TYPES: Pairs<string> = [
  ['DROP_SHADOW', 'drop-shadow'],
  ['INNER_SHADOW', 'inner-shadow'],
  ['LAYER_BLUR', 'layer-blur'],
  ['BACKGROUND_BLUR', 'background-blur'],
]
const FLOWS: readonly string[] = ['HORIZONTAL', 'VERTICAL', 'GRID']
const REGULAR_WEIGHT = 400
const NORMAL = 'NORMAL'
const NO_TRIM = 'NONE'
const FILL = 'FILL'
const PERCENT = 100

export function colorHex(color: Color): string {
  return `#${[color.r, color.g, color.b]
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}
