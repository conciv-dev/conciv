import {createHash} from 'node:crypto'
import {toolError} from '@conciv/extension'
import {z} from 'zod'
import {DESIGN_ERRORS} from '../shared/defs.js'
import type {
  Box,
  BoxNode,
  DesignGradient,
  ImageNode,
  Raster,
  TargetAdapter,
  TargetModel,
  TargetNode,
  TextNode,
} from '../shared/types.js'
import {decodePng, hex} from './raster.js'
import {fnv, readImage} from './target.js'

type FigmaLink = {fileKey: string; nodeId: string}

type FigmaSource = {
  name: string
  available(input: {token: string | null; document: unknown; image: string | undefined}): boolean
  load(input: {
    link: FigmaLink
    scale: number
    token: string | null
    document: unknown
    image: string | undefined
    cwd: string
  }): Promise<{document: FigmaDocument; raster: Raster; version: string}>
}

export function createFigmaAdapter(input: {token: string | null}): TargetAdapter {
  const {token} = input
  return {
    kind: 'figma',
    accepts: ({ref}) => parseFigmaLink(ref) !== null,
    load: async ({ref, scale, cwd, document, image}) => {
      const link = parseFigmaLink(ref)
      if (link === null) throw toolError('figma-link', {message: DESIGN_ERRORS['figma-link'].message})
      const source = Object.values(FIGMA_SOURCES).find((candidate) => candidate.available({token, document, image}))
      if (source === undefined) throw toolError('figma-source', {message: DESIGN_ERRORS['figma-source'].message})
      const loaded = await source.load({link, scale, token, document, image, cwd})
      return modelFrom({link, scale, ...loaded})
    },
  }
}

export function parseFigmaLink(ref: string): FigmaLink | null {
  if (!URL.canParse(ref)) return null
  const url = new URL(ref)
  if (url.hostname !== 'figma.com' && !url.hostname.endsWith('.figma.com')) return null
  const [, kind, key, branch, branchKey] = url.pathname.split('/')
  if ((kind !== 'design' && kind !== 'file') || key === undefined || key === '') return null
  const nodeId = url.searchParams.get('node-id')
  if (nodeId === null || nodeId === '') return null
  const fileKey = branch === 'branch' && branchKey !== undefined && branchKey !== '' ? branchKey : key
  return {fileKey, nodeId: nodeId.replaceAll('-', ':')}
}

export const FIGMA_SOURCES = {
  rest: {name: 'rest', available: restAvailable, load: restLoad},
  document: {name: 'document', available: documentAvailable, load: documentLoad},
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
type Paint = z.infer<typeof PaintSchema>
type Color = z.infer<typeof ColorSchema>

const FIGMA_API = 'https://api.figma.com/v1'
const VECTORS = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'LINE', 'STAR', 'POLYGON', 'REGULAR_POLYGON'])
const GROUPS = new Set(['GROUP', 'FRAME', 'INSTANCE', 'COMPONENT'])

function restAvailable(input: {token: string | null}): boolean {
  return input.token !== null
}

async function restLoad(input: {link: FigmaLink; scale: number; token: string | null}) {
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
  return {document, raster: decodePng(new Uint8Array(await png.arrayBuffer())), version: document.version ?? ''}
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

function documentAvailable(input: {document: unknown; image: string | undefined}): boolean {
  return input.document !== undefined && input.image !== undefined
}

async function documentLoad(input: {document: unknown; image: string | undefined; cwd: string}) {
  const document = parsedDocument(input.document)
  const bytes = await readImage({ref: input.image ?? '', cwd: input.cwd})
  return {document, raster: decodePng(bytes), version: document.lastModified ?? ''}
}

function modelFrom(input: {
  link: FigmaLink
  document: FigmaDocument
  raster: Raster
  scale: number
  version: string
}): TargetModel {
  const {link, document, raster, scale, version} = input
  const root = document.nodes[link.nodeId]?.document
  const frame = root?.absoluteBoundingBox
  if (root === undefined || frame === undefined || frame === null)
    throw toolError('figma-request', {message: `the Figma document has no frame ${link.nodeId}`})
  const origin = {x: frame.x, y: frame.y, scale}
  const viewport = {width: Math.round(frame.width), height: Math.round(frame.height)}
  return {
    id: createHash('sha256').update(`${link.fileKey}|${link.nodeId}|${version}`).digest('hex').slice(0, 12),
    source: {kind: 'figma', ref: `${link.fileKey}/${link.nodeId}`},
    viewport,
    raster,
    scale,
    root: {id: 'root', box: {x: 0, y: 0, w: viewport.width, h: viewport.height}},
    nodes: (root.children ?? []).flatMap((child) => walk({node: child, origin, within: undefined})),
  }
}

type Origin = {x: number; y: number; scale: number}

function walk(input: {node: FigmaNode; origin: Origin; within: string | undefined}): TargetNode[] {
  const {node, origin, within} = input
  if (node.visible === false) return []
  const bounds = node.absoluteBoundingBox
  if (bounds === undefined || bounds === null)
    return (node.children ?? []).flatMap((child) => walk({node: child, origin, within}))
  const box = {
    x: Math.round((bounds.x - origin.x) * origin.scale),
    y: Math.round((bounds.y - origin.y) * origin.scale),
    w: Math.round(bounds.width * origin.scale),
    h: Math.round(bounds.height * origin.scale),
  }
  const base = {id: fnv(`figma|${node.id}`), ref: node.id, box, ...(within === undefined ? {} : {within})}
  if (node.type === 'TEXT') return [textNode({node, base, scale: origin.scale})]
  if (vectorish(node)) return [imageNode(base)]
  const self = boxNode({node, base})
  return [self, ...(node.children ?? []).flatMap((child) => walk({node: child, origin, within: self.id}))]
}

type Base = {id: string; ref: string; box: Box; within?: string}

function textNode(input: {node: FigmaNode; base: Base; scale: number}): TextNode {
  const {node, base, scale} = input
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
            weight: node.style?.fontWeight ?? 400,
            confidence: 1,
            font: family ?? '',
            family,
          },
        }
  return {...base, kind: 'text', text, lines: [{box: base.box, text, confidence: 1}], confidence: 1, ...typography}
}

function visibleChildren(node: FigmaNode): FigmaNode[] {
  return (node.children ?? []).filter((child) => child.visible !== false)
}

function imageFilled(node: FigmaNode): boolean {
  return (node.fills ?? []).some((paint) => paint.type === 'IMAGE' && paint.visible !== false)
}

function vectorish(node: FigmaNode): boolean {
  if (VECTORS.has(node.type) || imageFilled(node)) return true
  const children = visibleChildren(node)
  return GROUPS.has(node.type) && children.length > 0 && children.every(vectorish)
}

function imageNode(base: Base): ImageNode {
  return {...base, kind: 'image', holds: 0}
}

function boxNode(input: {node: FigmaNode; base: Base}): BoxNode {
  const {node, base} = input
  const paint = paintOf(node.fills ?? [])
  const stroke = (node.strokes ?? []).findLast((candidate) => candidate.type === 'SOLID' && candidate.visible !== false)
  const color = stroke?.color
  return {
    ...base,
    kind: 'box',
    ...(paint === null ? {} : {paint}),
    border: color === undefined ? null : {width: node.strokeWeight ?? 1, color: colorHex(color)},
    radius:
      node.type === 'ELLIPSE'
        ? Math.min(base.box.w, base.box.h) / 2
        : (node.cornerRadius ?? node.rectangleCornerRadii?.[0] ?? 0),
  }
}

function paintOf(fills: Paint[]): {background: string; gradient?: DesignGradient} | null {
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

function gradientAxis(fill: Paint): DesignGradient['axis'] {
  const [start, end] = fill.gradientHandlePositions ?? []
  if (start === undefined || end === undefined) return 'vertical'
  return Math.abs(end.x - start.x) > Math.abs(end.y - start.y) ? 'horizontal' : 'vertical'
}

function colorHex(color: Color): string {
  return hex([color.r, color.g, color.b].map((channel) => Math.round(channel * 255)))
}
