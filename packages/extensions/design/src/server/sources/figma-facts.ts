import type {z} from 'zod'
import type {DesignNode} from '../../shared/defs.js'
import {designConfig} from '../../shared/tolerances.js'
import {figmaSchemas} from './figma-schema.js'

export function figmaFacts(input: {node: FigmaNode; origin: Origin; marks: {image: boolean; crop: boolean}}): Facts {
  const {node, origin, marks} = input
  const bounds = node.absoluteBoundingBox ?? {x: origin.x, y: origin.y, width: 0, height: 0}
  const mode = FLOWS.has(node.layoutMode ?? '') ? (node.layoutMode ?? null) : null
  const fills = paints(node.fills ?? [])
  const strokes = paints(node.strokes ?? [])
  const radius = node.rectangleCornerRadii ?? node.cornerRadius
  const fields = {
    ...(fills.length === 0 ? {} : {fills}),
    ...(strokes.length === 0 ? {} : {strokes, strokeWeight: node.strokeWeight ?? 1}),
    ...(radius === undefined || radius === 0 ? {} : {radius}),
    ...(node.type === 'TEXT' ? {text: node.characters ?? '', font: fontOf(node)} : {}),
    ...(mode === null ? {} : {layout: layoutOf(node)}),
    ...sizingOf(node),
    ...(node.layoutAlign === undefined || node.layoutAlign === 'INHERIT' ? {} : {layoutAlign: node.layoutAlign}),
    ...(node.constraints === undefined ? {} : {constraints: node.constraints}),
    ...(node.clipsContent === true ? {clips: true} : {}),
    ...(node.layoutGrow === undefined || node.layoutGrow === 0 ? {} : {grow: node.layoutGrow}),
    ...(node.rotation === undefined || node.rotation === 0 ? {} : {rotation: node.rotation}),
    ...(node.opacity === undefined || node.opacity === 1 ? {} : {opacity: node.opacity}),
    ...(marks.image ? {image: true} : {}),
    ...(marks.crop ? {crop: true} : {}),
    ...tokensOf(node),
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

function paints(list: FigmaPaint[]): Record<string, unknown>[] {
  return list.flatMap((paint) => {
    if (paint.visible === false || paint.type === 'IMAGE') return []
    if (paint.type === 'SOLID' && paint.color !== undefined)
      return [{type: 'solid', color: colorHex(paint.color), opacity: paint.opacity ?? paint.color.a ?? 1}]
    if (paint.gradientStops === undefined) return [{type: paint.type.toLowerCase()}]
    return [
      {
        type: `${paint.type.replace('GRADIENT_', '').toLowerCase()}-gradient`,
        stops: paint.gradientStops.map((stop) => ({
          color: colorHex(stop.color),
          opacity: stop.color.a ?? 1,
          at: Math.round(stop.position * PERCENT),
        })),
      },
    ]
  })
}

function tokensOf(node: FigmaNode): {tokens?: Record<string, string>} {
  const bound = node.boundVariables ?? {}
  const found = Object.entries(TOKEN_FIELDS).flatMap(([field, keys]) => {
    const alias = keys.flatMap((key) => [bound[key] ?? []].flat())[0]
    return alias === undefined ? [] : [[field, alias.id] as const]
  })
  return found.length === 0 ? {} : {tokens: Object.fromEntries(found)}
}

function fontOf(node: FigmaNode): Record<string, unknown> {
  const style = node.style ?? {}
  return {
    family: style.fontFamily,
    size: style.fontSize,
    weight: style.fontWeight ?? REGULAR_WEIGHT,
    ...(style.fontStyle === undefined ? {} : {style: style.fontStyle}),
    ...(style.lineHeightPx === undefined
      ? {}
      : {lineHeight: {unit: style.lineHeightUnit ?? 'PIXELS', value: style.lineHeightPx}}),
    ...(style.letterSpacing === undefined || style.letterSpacing === 0
      ? {}
      : {letterSpacing: {unit: 'PIXELS', value: style.letterSpacing}}),
    ...(style.textAlignHorizontal === undefined ? {} : {align: style.textAlignHorizontal}),
    ...(style.textCase === undefined ? {} : {case: style.textCase}),
    ...(style.textDecoration === undefined ? {} : {decoration: style.textDecoration}),
  }
}

function layoutOf(node: FigmaNode): Record<string, unknown> {
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

function sizingOf(node: FigmaNode): Record<string, unknown> {
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
const FLOWS = new Set(['HORIZONTAL', 'VERTICAL', 'GRID'])
const REGULAR_WEIGHT = 400
const PERCENT = 100

function colorHex(color: Color): string {
  return designConfig.hex([color.r, color.g, color.b].map((channel) => Math.round(channel * 255)))
}
