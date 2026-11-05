import {createHash} from 'node:crypto'
import {toolError} from '@conciv/extension'
import {z} from 'zod'
import {DESIGN_ERRORS, type Attachments, type Design, type DesignNode, type TargetAdapter} from '../../shared/defs.js'
import type {Box, RoleRules} from '../../shared/types.js'
import {hex} from '../raster.js'

export function createFigmaAdapter(input: {token: string | null; roles: RoleRules}): TargetAdapter {
  const {token, roles} = input
  return {
    kind: 'figma',
    accepts: ({ref}) => isFigmaUrl(ref),
    load: async ({ref, scale, attachments}) => {
      const link = parseFigmaLink(ref)
      if (link === null) throw toolError('figma-link', {message: DESIGN_ERRORS['figma-link'].message})
      const source = Object.values(FIGMA_SOURCES).find((candidate) => candidate.available({token, attachments}))
      if (source === undefined) throw toolError('figma-source', {message: DESIGN_ERRORS['figma-source'].message})
      const loaded = await source.load({link, scale, token, attachments})
      return {design: designFrom({link, scale, roles, ...loaded}), image: loaded.image}
    },
  }
}

export function isFigmaUrl(ref: string): boolean {
  if (!URL.canParse(ref)) return false
  const {hostname} = new URL(ref)
  return hostname === 'figma.com' || hostname.endsWith('.figma.com')
}

export function parseFigmaLink(ref: string): FigmaLink | null {
  if (!isFigmaUrl(ref)) return null
  const url = new URL(ref)
  const [, kind, key, branch, branchKey] = url.pathname.split('/')
  if ((kind !== 'design' && kind !== 'file') || key === undefined || key === '') return null
  const node = url.searchParams.get('node-id')
  if (node === null || node === '') return null
  const fileKey = branch === 'branch' && branchKey !== undefined && branchKey !== '' ? branchKey : key
  return {fileKey, nodeId: node.replaceAll('-', ':')}
}

type FigmaLink = {fileKey: string; nodeId: string}

type Loaded = {document: FigmaDocument; image: Uint8Array; version: string}

type FigmaSource = {
  available(input: {token: string | null; attachments: Attachments}): boolean
  load(input: {link: FigmaLink; scale: number; token: string | null; attachments: Attachments}): Promise<Loaded>
}

const FIGMA_SOURCES = {
  document: {available: documentAvailable, load: documentLoad},
  rest: {available: restAvailable, load: restLoad},
} as const satisfies Record<string, FigmaSource>

const ColorSchema = z.looseObject({r: z.number(), g: z.number(), b: z.number(), a: z.number().optional()})
const PointSchema = z.looseObject({x: z.number(), y: z.number()})
const PaintSchema = z.looseObject({
  type: z.string(),
  visible: z.boolean().optional(),
  color: ColorSchema.optional(),
  opacity: z.number().optional(),
  gradientStops: z.array(z.looseObject({color: ColorSchema, position: z.number()})).optional(),
  gradientHandlePositions: z.array(PointSchema).optional(),
})
const FigmaNodeSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  visible: z.boolean().optional(),
  absoluteBoundingBox: z
    .looseObject({x: z.number(), y: z.number(), width: z.number(), height: z.number()})
    .nullable()
    .optional(),
  characters: z.string().optional(),
  style: z
    .looseObject({
      fontSize: z.number().optional(),
      fontFamily: z.string().optional(),
      fontWeight: z.number().optional(),
      lineHeightPx: z.number().optional(),
    })
    .optional(),
  fills: z.array(PaintSchema).optional(),
  strokes: z.array(PaintSchema).optional(),
  strokeWeight: z.number().optional(),
  cornerRadius: z.number().optional(),
  rectangleCornerRadii: z.array(z.number()).optional(),
  get children() {
    return z.array(FigmaNodeSchema).optional()
  },
})
const FigmaDocumentSchema = z.looseObject({
  nodes: z.record(z.string(), z.looseObject({document: FigmaNodeSchema}).nullable()),
  version: z.string().optional(),
  lastModified: z.string().optional(),
})
const FigmaImagesSchema = z.looseObject({images: z.record(z.string(), z.string().nullable())})

type FigmaDocument = z.infer<typeof FigmaDocumentSchema>
type FigmaNode = z.infer<typeof FigmaNodeSchema>
type FigmaPaint = z.infer<typeof PaintSchema>
type Color = z.infer<typeof ColorSchema>
type BoxNode = Extract<DesignNode, {kind: 'box'}>
type TextNode = Extract<DesignNode, {kind: 'text'}>
type Origin = {x: number; y: number; scale: number}

const FIGMA_API = 'https://api.figma.com/v1'
const VECTORS = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'LINE', 'STAR', 'POLYGON', 'REGULAR_POLYGON'])
const GROUPS = new Set(['GROUP', 'FRAME', 'INSTANCE', 'COMPONENT'])
const REGULAR_WEIGHT = 400

function documentAvailable(input: {attachments: Attachments}): boolean {
  return input.attachments.document !== undefined && input.attachments.image !== undefined
}

async function documentLoad(input: {attachments: Attachments}): Promise<Loaded> {
  const {document, image} = input.attachments
  if (image === undefined) throw toolError('figma-source', {message: DESIGN_ERRORS['figma-source'].message})
  const parsed = parsedDocument(document)
  return {document: parsed, image, version: parsed.lastModified ?? ''}
}

function restAvailable(input: {token: string | null}): boolean {
  return input.token !== null
}

async function restLoad(input: {link: FigmaLink; scale: number; token: string | null}): Promise<Loaded> {
  const {link, scale, token} = input
  const ids = encodeURIComponent(link.nodeId)
  const headers = {'X-Figma-Token': token ?? ''}
  const body = await figmaJson({url: `${FIGMA_API}/files/${link.fileKey}/nodes?ids=${ids}`, headers, link})
  const images = FigmaImagesSchema.safeParse(
    await figmaJson({url: `${FIGMA_API}/images/${link.fileKey}?ids=${ids}&format=png&scale=${scale}`, headers, link}),
  )
  const render = images.success ? images.data.images[link.nodeId] : undefined
  if (render === undefined || render === null)
    throw toolError('figma-request', {message: `Figma rendered no image for ${link.nodeId}`})
  const png = await figmaFetch({url: render, headers: {}, link})
  const document = parsedDocument(body)
  return {document, image: new Uint8Array(await png.arrayBuffer()), version: document.version ?? ''}
}

async function figmaJson(input: {url: string; headers: Record<string, string>; link: FigmaLink}): Promise<unknown> {
  const response = await figmaFetch(input)
  return response.json()
}

async function figmaFetch(input: {url: string; headers: Record<string, string>; link: FigmaLink}): Promise<Response> {
  const {url, headers, link} = input
  const response = await fetch(url, {headers}).catch((cause: unknown) => {
    throw toolError('figma-request', {message: `Figma did not answer for ${link.nodeId}`, data: String(cause)})
  })
  if (!response.ok) throw toolError('figma-request', {message: `Figma answered ${response.status} for ${link.nodeId}`})
  return response
}

function parsedDocument(body: unknown): FigmaDocument {
  const parsed = FigmaDocumentSchema.safeParse(body)
  if (!parsed.success) throw toolError('figma-request', {message: 'the Figma document has an unexpected shape'})
  return parsed.data
}

function designFrom(input: {
  link: FigmaLink
  document: FigmaDocument
  scale: number
  version: string
  roles: RoleRules
}): Design {
  const {link, document, scale, version, roles} = input
  const frame = document.nodes[link.nodeId]?.document
  const bounds = frame?.absoluteBoundingBox
  if (frame === undefined || bounds === undefined || bounds === null)
    throw toolError('figma-request', {message: `the Figma document has no frame ${link.nodeId}`})
  const origin = {x: bounds.x, y: bounds.y, scale}
  return {
    id: createHash('sha256').update(`${link.fileKey}|${link.nodeId}|${version}`).digest('hex').slice(0, 12),
    source: {kind: 'figma', ref: `${link.fileKey}/${link.nodeId}`},
    viewport: {width: Math.round(bounds.width), height: Math.round(bounds.height)},
    scale,
    root: boxNode({
      node: frame,
      box: boxIn({bounds, origin}),
      scale,
      children: childNodes({node: frame, origin, roles}),
    }),
  }
}

function designNodes(input: {node: FigmaNode; origin: Origin; roles: RoleRules}): DesignNode[] {
  const {node, origin} = input
  if (node.visible === false) return []
  const bounds = node.absoluteBoundingBox
  if (bounds === undefined || bounds === null) return childNodes(input)
  const box = boxIn({bounds, origin})
  if (node.type === 'TEXT') return [textNode({node, box, scale: origin.scale})]
  if (vectorish(node)) return [{id: node.id, box, kind: 'image', holds: 0, children: []}]
  return [boxNode({node, box, scale: origin.scale, children: childNodes(input)})]
}

function childNodes(input: {node: FigmaNode; origin: Origin; roles: RoleRules}): DesignNode[] {
  const {origin, roles} = input
  const children = (input.node.children ?? []).flatMap((child) => designNodes({node: child, origin, roles}))
  const texts = children.flatMap((child) => (child.kind === 'text' ? [child] : []))
  return children.map((child) => {
    if (child.kind !== 'text') return child
    const neighbours = texts.filter((other) => other !== child).map((other) => other.text)
    return {...child, role: roles({text: child.text, neighbours}).role}
  })
}

function boxIn(input: {bounds: {x: number; y: number; width: number; height: number}; origin: Origin}): Box {
  const {bounds, origin} = input
  return {
    x: Math.round((bounds.x - origin.x) * origin.scale),
    y: Math.round((bounds.y - origin.y) * origin.scale),
    w: Math.round(bounds.width * origin.scale),
    h: Math.round(bounds.height * origin.scale),
  }
}

function textNode(input: {node: FigmaNode; box: Box; scale: number}): TextNode {
  const {node, box, scale} = input
  const text = node.characters ?? ''
  const size = node.style?.fontSize
  const family = node.style?.fontFamily ?? null
  const typography =
    size === undefined
      ? {}
      : {
          typography: {
            size: size * scale,
            lineHeight: (node.style?.lineHeightPx ?? size) * scale,
            weight: node.style?.fontWeight ?? REGULAR_WEIGHT,
            confidence: 1,
            font: family ?? '',
            family,
          },
        }
  return {
    id: node.id,
    box,
    kind: 'text',
    text,
    lines: [{box, text, confidence: 1}],
    confidence: 1,
    children: [],
    ...typography,
  }
}

function boxNode(input: {node: FigmaNode; box: Box; scale: number; children: DesignNode[]}): BoxNode {
  const {node, box, scale, children} = input
  const paint = paintOf(node.fills ?? [])
  const stroke = (node.strokes ?? []).findLast((candidate) => candidate.type === 'SOLID' && candidate.visible !== false)
  const color = stroke?.color
  return {
    id: node.id,
    box,
    kind: 'box',
    ...(paint === null ? {} : {paint}),
    border: color === undefined ? null : {width: (node.strokeWeight ?? 1) * scale, color: colorHex(color)},
    radius:
      node.type === 'ELLIPSE'
        ? Math.min(box.w, box.h) / 2
        : (node.cornerRadius ?? node.rectangleCornerRadii?.[0] ?? 0) * scale,
    children,
  }
}

function visibleChildren(node: FigmaNode): FigmaNode[] {
  return (node.children ?? []).filter((child) => child.visible !== false)
}

function imageFilled(node: FigmaNode): boolean {
  return (node.fills ?? []).some((paint) => paint.type === 'IMAGE' && paint.visible !== false)
}

function vectorish(node: FigmaNode): boolean {
  if (VECTORS.has(node.type) || imageFilled(node)) return true
  const shown = visibleChildren(node)
  return GROUPS.has(node.type) && shown.length > 0 && shown.every(vectorish)
}

function paintOf(fills: FigmaPaint[]): BoxNode['paint'] | null {
  const fill = fills.findLast(
    (paint) => paint.visible !== false && (paint.type === 'SOLID' || paint.type === 'GRADIENT_LINEAR'),
  )
  if (fill === undefined) return null
  if (fill.type === 'SOLID') return fill.color === undefined ? null : {background: colorHex(fill.color)}
  const first = fill.gradientStops?.[0]
  const last = fill.gradientStops?.at(-1)
  if (first === undefined || last === undefined) return null
  const from = colorHex(first.color)
  return {background: from, gradient: {from, to: colorHex(last.color), axis: gradientAxis(fill)}}
}

function gradientAxis(fill: FigmaPaint): 'vertical' | 'horizontal' {
  const [start, end] = fill.gradientHandlePositions ?? []
  if (start === undefined || end === undefined) return 'vertical'
  return Math.abs(end.x - start.x) > Math.abs(end.y - start.y) ? 'horizontal' : 'vertical'
}

function colorHex(color: Color): string {
  return hex([color.r, color.g, color.b].map((channel) => Math.round(channel * 255)))
}
