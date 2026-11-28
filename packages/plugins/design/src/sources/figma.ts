import {createHash} from 'node:crypto'
import {Effect} from 'effect'
import {z} from 'zod'
import type {Box, BoxNode, Design, DesignNode, NodeLayout, TextNode} from '../model/design.js'
import {designErrors} from '../errors/errors.js'
import {inferLayout} from './layout.js'
import {assignRoles} from './roles.js'
import {structured} from './structure.js'
import {reflowTagged} from './reflow-tags.js'
import {figmaSchemas} from './figma-schema.js'
import {colorHex, figmaFacts} from './figma-facts.js'
import {linkComponents} from './figma-components.js'
import {namedTokens} from './figma-tokens.js'
import {figmaRef, type FigmaLink} from './figma-link.js'
import {figmaDownload, figmaGet, type FigmaKey} from './figma-rest.js'
import {figmaAssets, type AssetFolders} from './figma-assets.js'
import {sampledPaint} from './figma-paint.js'
import {createRaster, readPng, type Raster} from '../raster/raster.js'
import {pick, type Pairs} from '../model/pairs.js'

type FigmaDocument = z.infer<typeof figmaSchemas.document>
type FigmaNode = z.infer<typeof figmaSchemas.node>
type FigmaPaint = z.infer<typeof figmaSchemas.paint>
type Bounds = z.infer<typeof figmaSchemas.bounds>
type Origin = {x: number; y: number; scale: number}
type Frame = {node: FigmaNode; entry: unknown; viewport: Design['viewport']; warnings: string[]}
type Axis = 'vertical' | 'horizontal'

const VECTORS: readonly string[] = ['VECTOR', 'BOOLEAN_OPERATION', 'LINE', 'STAR', 'POLYGON', 'REGULAR_POLYGON']
const DRAWINGS: readonly string[] = [...VECTORS, 'ELLIPSE']
const FRAMES: readonly string[] = ['FRAME', 'INSTANCE', 'COMPONENT']
const REGULAR_WEIGHT = 400
const ID_LENGTH = 12
const SCALE = 1
const FLOWS: Pairs<NonNullable<NodeLayout['direction']>> = [
  ['HORIZONTAL', 'row'],
  ['VERTICAL', 'column'],
  ['GRID', 'grid'],
]
const ALIGNS: Pairs<NonNullable<NodeLayout['align']>> = [
  ['MIN', 'start'],
  ['CENTER', 'center'],
  ['MAX', 'end'],
  ['BASELINE', 'start'],
]
const SIZINGS: Pairs<NonNullable<NodeLayout['size']>> = [
  ['FILL', 'fill'],
  ['HUG', 'fit'],
  ['FIXED', 'fixed'],
]

export type AttachedFigma = {readonly document: unknown; readonly image: Uint8Array}

export const loadFigma = Effect.fn('design.loadFigma')(function* (
  input: AssetFolders & {link: FigmaLink; key: FigmaKey | null; attached: AttachedFigma | null},
) {
  const {link, key} = input
  const [document, render] = yield* fetched(input)
  const frame = yield* pickFrame({document, nodeId: link.nodeId})
  const raster = createRaster(render)
  const built = linkComponents({root: designRoot({frame: frame.node, raster}), entry: frame.entry})
  const named = yield* namedTokens({root: built, link, key})
  const version = document.version ?? document.lastModified ?? ''
  const plain: Design = {
    id: sha256(`${link.fileKey}|${link.nodeId}|${version}`).slice(0, ID_LENGTH),
    source: {kind: 'figma', ref: figmaRef(link)},
    viewport: frame.viewport,
    scale: SCALE,
    root: named.root,
  }
  const assets = yield* figmaAssets({...input, design: plain, raster})
  const design: Design = {...assets.design, root: hashed(assets.design.root)}
  return {design, warnings: [...frame.warnings, ...unmapped(frame.node), named.line, assets.line]}
})

function fetched(input: {link: FigmaLink; key: FigmaKey | null; attached: AttachedFigma | null}) {
  const {link, key, attached} = input
  if (attached !== null)
    return Effect.all([
      parsedDocument(attached.document),
      readPng({bytes: attached.image, what: `the image of ${link.nodeId}`}),
    ])
  if (key === null) return Effect.fail(designErrors.FIGMA_KEY_MISSING())
  const ids = encodeURIComponent(link.nodeId)
  return Effect.all(
    [
      figmaGet({path: `/files/${link.fileKey}/nodes?ids=${ids}`, key, link}).pipe(Effect.flatMap(parsedDocument)),
      frameRender({link, key}),
    ],
    {concurrency: 'unbounded'},
  )
}

const frameRender = Effect.fn('design.frameRender')(function* (input: {link: FigmaLink; key: FigmaKey}) {
  const {link, key} = input
  const body = yield* figmaGet({
    path: `/images/${link.fileKey}?ids=${encodeURIComponent(link.nodeId)}&format=png&scale=${SCALE}`,
    key,
    link,
  })
  const url = figmaSchemas.images.safeParse(body).data?.images[link.nodeId]
  if (url === undefined || url === null)
    return yield* Effect.fail(designErrors.FIGMA_REQUEST({detail: `Figma rendered no image for ${link.nodeId}`}))
  const bytes = yield* figmaDownload({url, link})
  return yield* readPng({bytes, what: `the Figma render of ${link.nodeId}`})
})

function parsedDocument(body: unknown) {
  const parsed = figmaSchemas.document.safeParse(body)
  if (parsed.success) return Effect.succeed(parsed.data)
  return Effect.fail(designErrors.FIGMA_DOCUMENT({detail: z.prettifyError(parsed.error)}))
}

function pickFrame(input: {document: FigmaDocument; nodeId: string}) {
  const {document, nodeId} = input
  const frames = Object.entries(document.nodes).flatMap(([id, entry]) => (entry === null ? [] : [{id, entry}]))
  const chosen = frames.find((frame) => frame.id === nodeId) ?? (frames.length === 1 ? frames[0] : undefined)
  const node = chosen?.entry.document
  const bounds = node?.absoluteBoundingBox
  if (chosen === undefined || node === undefined || bounds === undefined || bounds === null)
    return Effect.fail(designErrors.FIGMA_REQUEST({detail: `the Figma document has no frame ${nodeId}`}))
  const warnings =
    chosen.id === nodeId ? [] : [`the Figma document holds ${chosen.id}, not ${nodeId}; it is the target`]
  const frame: Frame = {
    node,
    entry: chosen.entry,
    viewport: {width: Math.round(bounds.width), height: Math.round(bounds.height)},
    warnings,
  }
  return Effect.succeed(frame)
}

function designRoot(input: {frame: FigmaNode; raster: Raster}): DesignNode {
  const {frame, raster} = input
  const bounds = frame.absoluteBoundingBox ?? {x: 0, y: 0, width: 0, height: 0}
  const origin = {x: bounds.x, y: bounds.y, scale: SCALE}
  const root = boxNode({node: frame, box: boxIn({bounds, origin}), origin, children: childNodes({node: frame, origin})})
  return reflowTagged(structured(inferLayout(assignRoles(sampledPaint({root, raster})))))
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
  if (collapses(node) && !solidFilled(node)) {
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
  if (pick(FLOWS, parent.layoutMode) === undefined) return built.map((entry) => entry.node)
  const flowing = built.filter((entry) => entry.figma.layoutPositioning !== 'ABSOLUTE')
  return built.map((entry) => {
    const index = flowing.indexOf(entry)
    if (index === -1) return entry.node
    const size = sizing({figma: entry.figma, vertical: parent.layoutMode === 'VERTICAL'})
    return {...entry.node, layout: {...entry.node.layout, size, index: index + 1}}
  })
}

function sizing(input: {figma: FigmaNode; vertical: boolean}): NonNullable<NodeLayout['size']> {
  const {figma, vertical} = input
  const mode = vertical ? figma.layoutSizingVertical : figma.layoutSizingHorizontal
  return pick(SIZINGS, mode) ?? (figma.layoutGrow === 1 ? 'fill' : 'fixed')
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
    ...textTypography({node, scale}),
  }
}

function textTypography(input: {node: FigmaNode; scale: number}): Pick<TextNode, 'typography'> {
  const {node, scale} = input
  const style = node.style ?? {}
  const size = style.fontSize
  const family = style.fontFamily ?? null
  if (size === undefined) return {}
  return {
    typography: {
      size: size * scale,
      lineHeight: (style.lineHeightPx ?? size) * scale,
      weight: style.fontWeight ?? REGULAR_WEIGHT,
      confidence: 1,
      font: family ?? '',
      family,
    },
  }
}

function boxNode(input: {node: FigmaNode; box: Box; origin: Origin; children: DesignNode[]}): BoxNode {
  const {node, box, origin, children} = input
  const {scale} = origin
  const paint = readPaint(node.fills ?? [])
  const stack = children.length > 0 && backgroundRef(node) !== null
  return {
    id: node.id,
    box,
    hash: '',
    figma: figmaFacts({node, origin, marks: {image: imageFilled(node) || stack, crop: false, stack}}),
    kind: 'box',
    ...(paint === null ? {} : {paint}),
    ...autoLayout({node, scale}),
    border: solidBorder({node, scale}),
    radius: cornerRadius({node, box, scale}),
    children,
  }
}

function solidBorder(input: {node: FigmaNode; scale: number}): BoxNode['border'] {
  const {node, scale} = input
  const stroke = (node.strokes ?? []).findLast((candidate) => candidate.type === 'SOLID' && candidate.visible !== false)
  const color = stroke?.color
  return color === undefined ? null : {width: (node.strokeWeight ?? 1) * scale, color: colorHex(color)}
}

function cornerRadius(input: {node: FigmaNode; box: Box; scale: number}): number {
  const {node, box, scale} = input
  if (node.type === 'ELLIPSE') return Math.min(box.w, box.h) / 2
  return (node.cornerRadius ?? node.rectangleCornerRadii?.[0] ?? 0) * scale
}

function autoLayout(input: {node: FigmaNode; scale: number}): {layout?: NodeLayout} {
  const {node, scale} = input
  const direction = pick(FLOWS, node.layoutMode)
  if (direction === undefined) return {}
  const px = (value: number | undefined): number => Math.round((value ?? 0) * scale)
  return {
    layout: {
      direction,
      gap: {px: px(node.itemSpacing), uniform: true},
      align: pick(ALIGNS, node.counterAxisAlignItems) ?? 'start',
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
  if (VECTORS.includes(node.type)) return true
  return (
    visibleChildren(node).length > 0 &&
    !hasTextBelow(node) &&
    !hasLayoutBelow(node) &&
    !FRAMES.includes(node.type) &&
    holdsDrawing(node)
  )
}

function holdsDrawing(node: FigmaNode): boolean {
  return DRAWINGS.includes(node.type) || imageFilled(node) || visibleChildren(node).some(holdsDrawing)
}

function hasTextBelow(node: FigmaNode): boolean {
  return node.type === 'TEXT' || visibleChildren(node).some(hasTextBelow)
}

function hasLayoutBelow(node: FigmaNode): boolean {
  return pick(FLOWS, node.layoutMode) !== undefined || visibleChildren(node).some(hasLayoutBelow)
}

function cropped(node: FigmaNode): boolean {
  const own = node.absoluteBoundingBox
  if (own === undefined || own === null) return false
  return visibleChildren(node).some((child) => {
    const bounds = child.absoluteBoundingBox
    if (!imageFilled(child) || VECTORS.includes(child.type) || bounds === undefined || bounds === null) return false
    return bounds.width > own.width + 1 || bounds.height > own.height + 1
  })
}

function imageFilled(node: FigmaNode): boolean {
  const fills = (node.fills ?? []).filter((paint) => paint.visible !== false)
  return fills.some((paint) => paint.type === 'IMAGE') && !fills.some((paint) => paint.type === 'SOLID')
}

function backgroundRef(node: FigmaNode): string | null {
  const fill = (node.fills ?? []).find((paint) => paint.visible !== false && paint.type === 'IMAGE')
  return fill?.imageRef ?? null
}

function solidFilled(node: FigmaNode): boolean {
  return (node.fills ?? []).some((paint) => paint.visible !== false && paint.type === 'SOLID')
}

function visibleChildren(node: FigmaNode): FigmaNode[] {
  return (node.children ?? []).filter((child) => child.visible !== false)
}

function readPaint(fills: FigmaPaint[]): BoxNode['paint'] | null {
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
