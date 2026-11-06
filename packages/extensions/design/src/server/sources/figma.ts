import {createHash} from 'node:crypto'
import type {Storage} from 'unstorage'
import {toolError} from '@conciv/extension'
import {z} from 'zod'
import {range} from 'es-toolkit'
import {
  DESIGN_TOOLS,
  type Box,
  type Design,
  type DesignNode,
  type Raster,
  type TargetAdapter,
} from '../../shared/defs.js'
import {box as boxes} from '../../shared/box.js'
import {designConfig} from '../../shared/tolerances.js'
import {createRaster} from '../raster.js'
import {inferLayout} from './layout.js'
import {assignRoles} from './roles.js'
import {structured} from './structure.js'
import {reflowTagged} from './reflow-tags.js'
import {figmaSchemas} from './figma-schema.js'
import {figmaFacts} from './figma-facts.js'

export function createFigmaAdapter(input: {token: string | null; config: DesignConfig}): TargetAdapter {
  const {token, config} = input
  return {
    kind: 'figma',
    accepts: (ref) => isFigmaUrl(ref) || isJsonRef(ref),
    load: async ({ref, scale, project, files, attachments}) => {
      const link = parseFigmaLink(ref)
      if (link === null && !isJsonRef(ref)) throw toolError('figma-link', {message: FIGMA_LINK_MESSAGE})
      const fetched = await fetchedFigma({ref, link, scale, token, project, files, attachments})
      const frame = frameOf({document: fetched.document, nodeId: link?.nodeId ?? null})
      const root = designRoot({frame: frame.node, scale, raster: createRaster(fetched.image), config})
      const design: Design = {
        id: designId({link, ref, version: fetched.version, root}),
        source: {kind: 'figma', ref: link === null ? ref : `${link.fileKey}/${link.nodeId}`},
        viewport: frame.viewport,
        scale,
        root,
      }
      return {design, image: fetched.image, warnings: [...frame.warnings, ...unmapped(frame.node)]}
    },
  }
}

const [getDef] = DESIGN_TOOLS
const FIGMA_LINK_MESSAGE = getDef.errors?.['figma-link'].message
const FIGMA_SOURCE_MESSAGE = getDef.errors?.['figma-source'].message

type FigmaLink = {fileKey: string; nodeId: string}
type Attachments = {document?: unknown; image?: Uint8Array}
type Fetched = {document: FigmaDocument; image: Uint8Array; version: string}

const {document: FigmaDocumentSchema, images: FigmaImagesSchema} = figmaSchemas

type FigmaDocument = z.infer<typeof figmaSchemas.document>
type FigmaNode = z.infer<typeof figmaSchemas.node>
type FigmaPaint = z.infer<typeof figmaSchemas.paint>
type Bounds = z.infer<typeof figmaSchemas.bounds>
type Color = z.infer<typeof figmaSchemas.color>
type BoxNode = Extract<DesignNode, {kind: 'box'}>
type TextNode = Extract<DesignNode, {kind: 'text'}>
type Layout = NonNullable<DesignNode['layout']>
type Origin = {x: number; y: number; scale: number}
type Frame = {node: FigmaNode; viewport: Design['viewport']; warnings: string[]}
type DesignConfig = z.output<typeof designConfig>
type Distance = (input: {a: string; b: string}) => number
type Axis = 'vertical' | 'horizontal'
type FillShape =
  | {kind: 'solid'}
  | {kind: 'picture'}
  | {kind: 'gradient'; gradient: {from: string; to: string; axis: Axis}}

const FIGMA_HOST = 'figma.com'
const FIGMA_API = 'https://api.figma.com/v1'
const JSON_EXTENSION = '.json'
const VECTORS = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'LINE', 'STAR', 'POLYGON', 'REGULAR_POLYGON'])
const DRAWINGS = new Set([...VECTORS, 'ELLIPSE'])
const FRAMES = new Set(['FRAME', 'INSTANCE', 'COMPONENT'])
const REGULAR_WEIGHT = 400
const ID_LENGTH = 12
const MIN_LINES = 2
const SOLID: FillShape = {kind: 'solid'}
const PICTURE: FillShape = {kind: 'picture'}
const TOLERANCES = designConfig.tolerances
const FLOWS = new Map<string, NonNullable<Layout['direction']>>([
  ['HORIZONTAL', 'row'],
  ['VERTICAL', 'column'],
  ['GRID', 'grid'],
])
const ALIGNS = new Map<string, NonNullable<Layout['align']>>([
  ['MIN', 'start'],
  ['CENTER', 'center'],
  ['MAX', 'end'],
  ['BASELINE', 'start'],
])
const SIZINGS = new Map<string, NonNullable<Layout['size']>>([
  ['FILL', 'fill'],
  ['HUG', 'fit'],
  ['FIXED', 'fixed'],
])

function isFigmaUrl(ref: string): boolean {
  if (!URL.canParse(ref)) return false
  const {hostname} = new URL(ref)
  return hostname === FIGMA_HOST || hostname.endsWith(`.${FIGMA_HOST}`)
}

function isJsonRef(ref: string): boolean {
  return !URL.canParse(ref) && ref.toLowerCase().endsWith(JSON_EXTENSION)
}

function parseFigmaLink(ref: string): FigmaLink | null {
  if (!isFigmaUrl(ref)) return null
  const url = new URL(ref)
  const [, kind, key, branch, branchKey] = url.pathname.split('/')
  if ((kind !== 'design' && kind !== 'file') || key === undefined || key === '') return null
  const node = url.searchParams.get('node-id')
  if (node === null || node === '') return null
  const fileKey = branch === 'branch' && branchKey !== undefined && branchKey !== '' ? branchKey : key
  return {fileKey, nodeId: node.replaceAll('-', ':')}
}

async function fetchedFigma(input: {
  ref: string
  link: FigmaLink | null
  scale: number
  token: string | null
  project: Storage
  files: Storage
  attachments: Attachments
}): Promise<Fetched> {
  const {ref, link, token, project, files, attachments} = input
  const {image} = attachments
  if (link === null) {
    if (image === undefined) throw toolError('figma-source', {message: FIGMA_SOURCE_MESSAGE})
    return attached({document: ref, image, project, files})
  }
  if (attachments.document !== undefined && image !== undefined)
    return attached({document: attachments.document, image, project, files})
  if (token !== null) return restLoad({link, scale: input.scale, token})
  throw toolError('figma-source', {message: FIGMA_SOURCE_MESSAGE})
}

async function attached(input: {
  document: unknown
  image: Uint8Array
  project: Storage
  files: Storage
}): Promise<Fetched> {
  const document = parsedDocument(await documentBody(input))
  return {document, image: input.image, version: document.version ?? document.lastModified ?? ''}
}

async function documentBody(input: {document: unknown; project: Storage; files: Storage}): Promise<unknown> {
  const {document, project, files} = input
  if (typeof document !== 'string') return document
  if (!isJsonRef(document)) return parsedJson(document)
  const stored: unknown =
    (await project.getItem(document).catch(() => null)) ?? (await files.getItem(document).catch(() => null))
  if (stored === null) throw toolError('figma-source', {message: `no Figma document at ${document}`})
  return typeof stored === 'string' ? parsedJson(stored) : stored
}

function parsedJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed
  } catch (cause) {
    throw toolError('figma-request', {message: 'the Figma document is not JSON', data: String(cause)})
  }
}

async function restLoad(input: {link: FigmaLink; scale: number; token: string}): Promise<Fetched> {
  const {link, scale, token} = input
  const ids = encodeURIComponent(link.nodeId)
  const headers = {'X-Figma-Token': token}
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

function frameOf(input: {document: FigmaDocument; nodeId: string | null}): Frame {
  const {document, nodeId} = input
  const frames = Object.entries(document.nodes).flatMap(([id, entry]) => (entry === null ? [] : [{id, entry}]))
  const chosen = nodeId === null ? frames[0] : frames.find((frame) => frame.id === nodeId)
  const node = chosen?.entry.document
  const bounds = node?.absoluteBoundingBox
  if (node === undefined || bounds === undefined || bounds === null)
    throw toolError('figma-request', {message: `the Figma document has no frame ${nodeId ?? ''}`.trim()})
  const warnings =
    nodeId === null && frames.length > 1
      ? [`the Figma document holds ${frames.length} frames; the first, ${node.id}, is the target`]
      : []
  return {node, viewport: {width: Math.round(bounds.width), height: Math.round(bounds.height)}, warnings}
}

function designRoot(input: {frame: FigmaNode; scale: number; raster: Raster; config: DesignConfig}): DesignNode {
  const {frame, scale, raster, config} = input
  const bounds = frame.absoluteBoundingBox ?? {x: 0, y: 0, width: 0, height: 0}
  const origin = {x: bounds.x, y: bounds.y, scale}
  const root = boxNode({node: frame, box: boxIn({bounds, origin}), origin, children: childNodes({node: frame, origin})})
  const sampled = {...root, children: root.children.map((child) => painted({node: child, raster, config}))}
  return hashed(reflowTagged(structured(inferLayout(assignRoles(sampled)))))
}

function painted(input: {node: DesignNode; raster: Raster; config: DesignConfig}): DesignNode {
  const {node, raster, config} = input
  const children = node.children.map((child) => painted({...input, node: child}))
  if (node.kind !== 'box' || node.paint !== undefined) return {...node, children}
  const [background = ''] = raster.fills({box: node.box, glyphs: [node.box], color: config.color})
  const holes = node.children.map((child) => boxes.expand({box: child.box, by: TOLERANCES.glyphHalo}))
  const shape = fillShape({
    raster,
    box: boxes.inset({box: node.box, by: TOLERANCES.geometryPx + node.radius}),
    holes,
    distance: designConfig.colorMetrics[config.color],
  })
  if (shape.kind === 'picture' && holes.length === 0)
    return {
      id: node.id,
      box: node.box,
      hash: '',
      ...(node.layout === undefined ? {} : {layout: node.layout}),
      ...(node.figma === undefined ? {} : {figma: node.figma}),
      kind: 'image',
      holds: 0,
      children: [],
    }
  if (shape.kind === 'gradient') return {...node, children, paint: {background, gradient: shape.gradient}}
  return {...node, children, paint: {background}}
}

function fillShape(input: {raster: Raster; box: Box; holes: Box[]; distance: Distance}): FillShape {
  const {raster, box, holes, distance} = input
  if (box.w < MIN_LINES || box.h < MIN_LINES) return SOLID
  const mask = boxes.mask({boxes: holes, within: box})
  const rowMeans = lineMeans({raster, area: box, mask, axis: 'vertical'})
  const columnMeans = lineMeans({raster, area: box, mask, axis: 'horizontal'})
  const vertical = varies({means: rowMeans, distance})
  const horizontal = varies({means: columnMeans, distance})
  if (!vertical && !horizontal) return SOLID
  if (vertical && horizontal) return PICTURE
  const axis: Axis = vertical ? 'vertical' : 'horizontal'
  const means = vertical ? rowMeans : columnMeans
  const from = means[0]
  const to = means.at(-1)
  if (from === undefined || to === undefined || !smooth({means, distance})) return PICTURE
  return {kind: 'gradient', gradient: {from, to, axis}}
}

function lineMeans(input: {raster: Raster; area: Box; mask: Uint8Array; axis: Axis}): string[] {
  const {raster, area, mask, axis} = input
  const data = raster.pixels()
  const lines = axis === 'vertical' ? area.h : area.w
  const across = axis === 'vertical' ? area.w : area.h
  return range(lines).flatMap((line) => {
    const total = range(across).reduce(
      (sums, step) => {
        const x = axis === 'vertical' ? step : line
        const y = axis === 'vertical' ? line : step
        if (mask[y * area.w + x] === 1) return sums
        const index = ((area.y + y) * raster.width + area.x + x) * 4
        return {
          red: sums.red + (data[index] ?? 0),
          green: sums.green + (data[index + 1] ?? 0),
          blue: sums.blue + (data[index + 2] ?? 0),
          count: sums.count + 1,
        }
      },
      {red: 0, green: 0, blue: 0, count: 0},
    )
    if (total.count === 0) return []
    return [designConfig.hex([total.red, total.green, total.blue].map((channel) => Math.round(channel / total.count)))]
  })
}

function varies(input: {means: string[]; distance: Distance}): boolean {
  const {means, distance} = input
  const first = means[0]
  const last = means.at(-1)
  if (first === undefined || last === undefined) return false
  return distance({a: first, b: last}) > TOLERANCES.colorDeltaE
}

function smooth(input: {means: string[]; distance: Distance}): boolean {
  const {means, distance} = input
  return means.every((mean, index) => {
    const next = means[index + 1]
    return next === undefined || distance({a: mean, b: next}) <= TOLERANCES.colorDeltaE
  })
}

function designId(input: {link: FigmaLink | null; ref: string; version: string; root: DesignNode}): string {
  const {link, ref, version, root} = input
  const key = link === null ? `${ref}|${root.hash}` : `${link.fileKey}|${link.nodeId}|${version}`
  return sha256(key).slice(0, ID_LENGTH)
}

function hashed(node: DesignNode): DesignNode {
  const children = node.children.map(hashed)
  const hash = sha256(JSON.stringify({...node, hash: '', children: children.map((child) => child.hash)}))
  return {...node, hash, children}
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function unmapped(frame: FigmaNode): string[] {
  const unbounded = unboundedIds(frame)
  const untyped = untypedIds(frame)
  return [
    ...(unbounded.length === 0
      ? []
      : [
          `${unbounded.length} Figma nodes have no bounds, their children are placed under the parent: ${unbounded.join(', ')}`,
        ]),
    ...(untyped.length === 0
      ? []
      : [`${untyped.length} Figma text nodes have no font size, so no typography: ${untyped.join(', ')}`]),
  ]
}

function unboundedIds(node: FigmaNode): string[] {
  if (node.visible === false) return []
  const own = node.absoluteBoundingBox === undefined || node.absoluteBoundingBox === null ? [node.id] : []
  return [...own, ...(node.children ?? []).flatMap(unboundedIds)]
}

function untypedIds(node: FigmaNode): string[] {
  if (node.visible === false) return []
  const own = node.type === 'TEXT' && node.style?.fontSize === undefined ? [node.id] : []
  return [...own, ...(node.children ?? []).flatMap(untypedIds)]
}

function designNodes(input: {node: FigmaNode; origin: Origin}): DesignNode[] {
  const {node, origin} = input
  if (node.visible === false) return []
  const bounds = node.absoluteBoundingBox
  if (bounds === undefined || bounds === null) return childNodes(input)
  const box = boxIn({bounds, origin})
  if (node.type === 'TEXT') return [textNode({node, box, origin})]
  if (collapses(node)) {
    const figma = figmaFacts({node, origin, marks: {image: true, crop: cropped(node)}})
    return [{id: node.id, box, hash: '', figma, kind: 'image', holds: 0, children: []}]
  }
  const children = childNodes(input)
  if (imageFilled(node) && children.length === 0) {
    const figma = figmaFacts({node, origin, marks: {image: true, crop: false}})
    return [{id: node.id, box, hash: '', figma, kind: 'image', holds: 0, children}]
  }
  return [boxNode({node, box, origin, children})]
}

function childNodes(input: {node: FigmaNode; origin: Origin}): DesignNode[] {
  const {node, origin} = input
  return seated({
    parent: node,
    built: (node.children ?? []).flatMap((child) =>
      designNodes({node: child, origin}).map((built) => ({node: built, figma: child})),
    ),
  })
}

function seated(input: {parent: FigmaNode; built: {node: DesignNode; figma: FigmaNode}[]}): DesignNode[] {
  const {parent, built} = input
  if (!FLOWS.has(parent.layoutMode ?? '')) return built.map((entry) => entry.node)
  const flowing = built.filter((entry) => entry.figma.layoutPositioning !== 'ABSOLUTE')
  return built.map((entry) => {
    const index = flowing.indexOf(entry)
    if (index === -1) return entry.node
    const size = sizing({figma: entry.figma, vertical: parent.layoutMode === 'VERTICAL'})
    return {...entry.node, layout: {...entry.node.layout, size, index: index + 1}}
  })
}

function sizing(input: {figma: FigmaNode; vertical: boolean}): NonNullable<Layout['size']> {
  const {figma, vertical} = input
  const mode = vertical ? figma.layoutSizingVertical : figma.layoutSizingHorizontal
  return SIZINGS.get(mode ?? '') ?? (figma.layoutGrow === 1 ? 'fill' : 'fixed')
}

function boxIn(input: {bounds: Bounds; origin: Origin}): Box {
  const {bounds, origin} = input
  return {
    x: Math.round((bounds.x - origin.x) * origin.scale),
    y: Math.round((bounds.y - origin.y) * origin.scale),
    w: Math.round(bounds.width * origin.scale),
    h: Math.round(bounds.height * origin.scale),
  }
}

function textNode(input: {node: FigmaNode; box: Box; origin: Origin}): TextNode {
  const {node, box, origin} = input
  const {scale} = origin
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
    hash: '',
    figma: figmaFacts({node, origin, marks: {image: false, crop: false}}),
    kind: 'text',
    text,
    lines: [{box, text, confidence: 1}],
    confidence: 1,
    children: [],
    ...typography,
  }
}

function boxNode(input: {node: FigmaNode; box: Box; origin: Origin; children: DesignNode[]}): BoxNode {
  const {node, box, origin, children} = input
  const {scale} = origin
  const paint = paintOf(node.fills ?? [])
  const stroke = (node.strokes ?? []).findLast((candidate) => candidate.type === 'SOLID' && candidate.visible !== false)
  const color = stroke?.color
  return {
    id: node.id,
    box,
    hash: '',
    figma: figmaFacts({node, origin, marks: {image: imageFilled(node), crop: false}}),
    kind: 'box',
    ...(paint === null ? {} : {paint}),
    ...autoLayout({node, scale}),
    border: color === undefined ? null : {width: (node.strokeWeight ?? 1) * scale, color: colorHex(color)},
    radius:
      node.type === 'ELLIPSE'
        ? Math.min(box.w, box.h) / 2
        : (node.cornerRadius ?? node.rectangleCornerRadii?.[0] ?? 0) * scale,
    children,
  }
}

function autoLayout(input: {node: FigmaNode; scale: number}): {layout?: Layout} {
  const {node, scale} = input
  const direction = FLOWS.get(node.layoutMode ?? '')
  if (direction === undefined) return {}
  const px = (value: number | undefined): number => Math.round((value ?? 0) * scale)
  return {
    layout: {
      direction,
      gap: {px: px(node.itemSpacing), uniform: true},
      align: ALIGNS.get(node.counterAxisAlignItems ?? '') ?? 'start',
      wrap: node.layoutWrap === 'WRAP',
      padding: {
        top: px(node.paddingTop),
        right: px(node.paddingRight),
        bottom: px(node.paddingBottom),
        left: px(node.paddingLeft),
      },
      runs: [],
    },
  }
}

function collapses(node: FigmaNode): boolean {
  if (VECTORS.has(node.type)) return true
  return (
    visibleChildren(node).length > 0 &&
    !hasTextBelow(node) &&
    !hasLayoutBelow(node) &&
    !FRAMES.has(node.type) &&
    holdsDrawing(node)
  )
}

function holdsDrawing(node: FigmaNode): boolean {
  return DRAWINGS.has(node.type) || imageFilled(node) || visibleChildren(node).some(holdsDrawing)
}

function hasTextBelow(node: FigmaNode): boolean {
  return node.type === 'TEXT' || visibleChildren(node).some(hasTextBelow)
}

function hasLayoutBelow(node: FigmaNode): boolean {
  return FLOWS.has(node.layoutMode ?? '') || visibleChildren(node).some(hasLayoutBelow)
}

function cropped(node: FigmaNode): boolean {
  const own = node.absoluteBoundingBox
  if (own === undefined || own === null) return false
  return visibleChildren(node).some((child) => {
    const bounds = child.absoluteBoundingBox
    if (!imageFilled(child) || VECTORS.has(child.type) || bounds === undefined || bounds === null) return false
    return bounds.width > own.width + 1 || bounds.height > own.height + 1
  })
}

function imageFilled(node: FigmaNode): boolean {
  const fills = (node.fills ?? []).filter((paint) => paint.visible !== false)
  return fills.some((paint) => paint.type === 'IMAGE') && !fills.some((paint) => paint.type === 'SOLID')
}

function visibleChildren(node: FigmaNode): FigmaNode[] {
  return (node.children ?? []).filter((child) => child.visible !== false)
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

function gradientAxis(fill: FigmaPaint): Axis {
  const [start, end] = fill.gradientHandlePositions ?? []
  if (start === undefined || end === undefined) return 'vertical'
  return Math.abs(end.x - start.x) > Math.abs(end.y - start.y) ? 'horizontal' : 'vertical'
}

function colorHex(color: Color): string {
  return designConfig.hex([color.r, color.g, color.b].map((channel) => Math.round(channel * 255)))
}
