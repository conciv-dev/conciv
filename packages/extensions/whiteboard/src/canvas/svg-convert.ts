import type {ExcalidrawElementSkeleton} from '@excalidraw/excalidraw/data/transform'

type ConvertOptions = {x: number; y: number; width: number; roughness: number}
type Origin = {x: number; y: number}
type Style = {fill: string | null; stroke: string | null; strokeWidth: number}

const NUMBER = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const MAX_ELEMENTS = 500

function resolvedStyle(node: Element): Style {
  const style = getComputedStyle(node)
  const fill = style.fill === 'none' ? null : style.fill
  const stroke = style.stroke === 'none' ? null : style.stroke
  return {fill, stroke, strokeWidth: parseFloat(style.strokeWidth) || 1}
}

function applyMatrix(matrix: DOMMatrix, x: number, y: number): Origin {
  return {x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f}
}

function styleFields(node: Element, scale: number, roughness: number): Record<string, unknown> {
  const {fill, stroke, strokeWidth} = resolvedStyle(node)
  return {
    strokeColor: stroke ?? (fill ? 'transparent' : '#1e1e1e'),
    backgroundColor: fill ?? 'transparent',
    fillStyle: 'solid',
    strokeWidth: Math.max(0.5, strokeWidth * scale),
    roughness,
  }
}

function samplePoints(pathNode: SVGPathElement, matrix: DOMMatrix, scale: number, origin: Origin): number[][] | null {
  const total = pathNode.getTotalLength()
  if (!total) return null
  const count = Math.min(220, Math.max(16, Math.round((total * scale) / 4)))
  const points: number[][] = []
  for (let index = 0; index <= count; index += 1) {
    const raw = pathNode.getPointAtLength((total * index) / count)
    const mapped = applyMatrix(matrix, raw.x, raw.y)
    points.push([mapped.x * scale - origin.x, mapped.y * scale - origin.y])
  }
  return points
}

function lineFromPoints(
  points: number[][],
  node: Element,
  scale: number,
  roughness: number,
): ExcalidrawElementSkeleton {
  const [first] = points
  const firstX = first?.[0] ?? 0
  const firstY = first?.[1] ?? 0
  const shifted = points.map(([x = 0, y = 0]) => [x - firstX, y - firstY])
  return {
    type: 'line',
    x: firstX,
    y: firstY,
    points: shifted,
    ...styleFields(node, scale, roughness),
  } as ExcalidrawElementSkeleton
}

function splitSubpaths(data: string): string[] {
  const chunks = data.match(/M[^M]*/g)
  return chunks && chunks.length > 1 ? chunks : [data]
}

type ShapeContext = {matrix: DOMMatrix; scale: number; origin: Origin; roughness: number}
type ShapeBuilder = (node: Element, context: ShapeContext) => ExcalidrawElementSkeleton[]

const CONTAINERS = new Set(['g', 'svg'])

const attrOf = (node: Element, name: string, fallback = '0'): number =>
  parseFloat(node.getAttribute(name) ?? fallback) || 0

function place(context: ShapeContext, x: number, y: number): Origin {
  const at = applyMatrix(context.matrix, x, y)
  return {x: at.x * context.scale - context.origin.x, y: at.y * context.scale - context.origin.y}
}

function nodeMatrix(node: Element, matrix: DOMMatrix): DOMMatrix {
  const own = (node as SVGGraphicsElement).transform?.baseVal?.consolidate()?.matrix
  return own ? matrix.multiply(own) : matrix
}

function buildRect(node: Element, context: ShapeContext): ExcalidrawElementSkeleton[] {
  const at = place(context, attrOf(node, 'x'), attrOf(node, 'y'))
  return [
    {
      type: 'rectangle',
      x: at.x,
      y: at.y,
      width: attrOf(node, 'width') * context.matrix.a * context.scale,
      height: attrOf(node, 'height') * context.matrix.d * context.scale,
      ...styleFields(node, context.scale, context.roughness),
    } as ExcalidrawElementSkeleton,
  ]
}

function buildEllipse(node: Element, context: ShapeContext): ExcalidrawElementSkeleton[] {
  const radiusAttr = node.tagName === 'circle' ? ['r', 'r'] : ['rx', 'ry']
  const rx = attrOf(node, radiusAttr[0] ?? 'r')
  const ry = attrOf(node, radiusAttr[1] ?? 'r')
  const at = place(context, attrOf(node, 'cx') - rx, attrOf(node, 'cy') - ry)
  return [
    {
      type: 'ellipse',
      x: at.x,
      y: at.y,
      width: rx * 2 * context.matrix.a * context.scale,
      height: ry * 2 * context.matrix.d * context.scale,
      ...styleFields(node, context.scale, context.roughness),
    } as ExcalidrawElementSkeleton,
  ]
}

function buildText(node: Element, context: ShapeContext): ExcalidrawElementSkeleton[] {
  const fontSize = (parseFloat(getComputedStyle(node).fontSize) || 16) * context.scale
  const at = place(context, attrOf(node, 'x'), attrOf(node, 'y'))
  return [
    {
      type: 'text',
      x: at.x,
      y: at.y - fontSize,
      text: node.textContent ?? '',
      fontSize,
      strokeColor: resolvedStyle(node).fill ?? '#1e1e1e',
    } as ExcalidrawElementSkeleton,
  ]
}

function buildLine(node: Element, context: ShapeContext): ExcalidrawElementSkeleton[] {
  const from = place(context, attrOf(node, 'x1'), attrOf(node, 'y1'))
  const to = place(context, attrOf(node, 'x2'), attrOf(node, 'y2'))
  return [
    lineFromPoints(
      [
        [from.x, from.y],
        [to.x, to.y],
      ],
      node,
      context.scale,
      context.roughness,
    ),
  ]
}

function buildPolyline(node: Element, context: ShapeContext): ExcalidrawElementSkeleton[] {
  const numbers = (node.getAttribute('points') ?? '').match(NUMBER)?.map(Number) ?? []
  const pairs: number[][] = []
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    const at = place(context, numbers[index] ?? 0, numbers[index + 1] ?? 0)
    pairs.push([at.x, at.y])
  }
  if (node.tagName === 'polygon' && pairs.length) pairs.push([pairs[0]?.[0] ?? 0, pairs[0]?.[1] ?? 0])
  return pairs.length > 1 ? [lineFromPoints(pairs, node, context.scale, context.roughness)] : []
}

function samplePathSubpath(node: Element, subpath: string, context: ShapeContext): ExcalidrawElementSkeleton | null {
  const parent = node.parentNode
  if (!parent) return null
  const probe = document.createElementNS(SVG_NAMESPACE, 'path')
  probe.setAttribute('d', subpath)
  parent.appendChild(probe)
  const points = samplePoints(probe, context.matrix, context.scale, context.origin)
  probe.remove()
  return points ? lineFromPoints(points, node, context.scale, context.roughness) : null
}

function buildPath(node: Element, context: ShapeContext): ExcalidrawElementSkeleton[] {
  const out: ExcalidrawElementSkeleton[] = []
  for (const subpath of splitSubpaths(node.getAttribute('d') ?? '')) {
    if (out.length >= MAX_ELEMENTS) break
    try {
      const line = samplePathSubpath(node, subpath, context)
      if (line) out.push(line)
    } catch (error) {
      console.error(`[whiteboard] svg path subpath skipped: ${String(error)}`)
    }
  }
  return out
}

const BUILDERS: Record<string, ShapeBuilder> = {
  rect: buildRect,
  circle: buildEllipse,
  ellipse: buildEllipse,
  text: buildText,
  line: buildLine,
  polyline: buildPolyline,
  polygon: buildPolyline,
  path: buildPath,
}

function convertNode(
  node: Element,
  matrix: DOMMatrix,
  scale: number,
  origin: Origin,
  roughness: number,
  sink: ExcalidrawElementSkeleton[],
): void {
  if (sink.length >= MAX_ELEMENTS) return
  const tag = node.tagName
  if (CONTAINERS.has(tag)) {
    Array.from(node.children).forEach((child) => convertNode(child, matrix, scale, origin, roughness, sink))
    return
  }
  const builder = BUILDERS[tag]
  if (builder)
    builder(node, {matrix: nodeMatrix(node, matrix), scale, origin, roughness}).forEach((skeleton) =>
      sink.push(skeleton),
    )
}

function rootTransform(svg: SVGSVGElement, options: ConvertOptions): {scale: number; origin: Origin} {
  const viewBox = svg.viewBox?.baseVal
  const sourceWidth = viewBox?.width || parseFloat(svg.getAttribute('width') ?? '400') || 400
  const scale = options.width / sourceWidth
  return {scale, origin: {x: (viewBox?.x ?? 0) * scale - options.x, y: (viewBox?.y ?? 0) * scale - options.y}}
}

export function svgToSkeletons(svgMarkup: string, options: ConvertOptions): ExcalidrawElementSkeleton[] {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;'
  host.innerHTML = svgMarkup
  const svg = host.querySelector('svg')
  if (!svg) throw new Error('no <svg> root found')
  document.body.appendChild(host)
  try {
    const {scale, origin} = rootTransform(svg, options)
    const sink: ExcalidrawElementSkeleton[] = []
    convertNode(svg, svg.createSVGMatrix() as DOMMatrix, scale, origin, options.roughness, sink)
    return sink.slice(0, MAX_ELEMENTS)
  } finally {
    host.remove()
  }
}
