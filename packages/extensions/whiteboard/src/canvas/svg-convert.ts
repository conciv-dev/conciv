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

function lineFromPoints(points: number[][], node: Element, scale: number, roughness: number): ExcalidrawElementSkeleton {
  const [first] = points
  const firstX = first?.[0] ?? 0
  const firstY = first?.[1] ?? 0
  const shifted = points.map(([x = 0, y = 0]) => [x - firstX, y - firstY])
  return {type: 'line', x: firstX, y: firstY, points: shifted, ...styleFields(node, scale, roughness)} as ExcalidrawElementSkeleton
}

function splitSubpaths(data: string): string[] {
  const chunks = data.match(/M[^M]*/g)
  return chunks && chunks.length > 1 ? chunks : [data]
}

function convertPath(
  node: Element,
  matrix: DOMMatrix,
  scale: number,
  origin: Origin,
  roughness: number,
  sink: ExcalidrawElementSkeleton[],
): void {
  const parent = node.parentNode
  if (!parent) return
  for (const subpath of splitSubpaths(node.getAttribute('d') ?? '')) {
    if (sink.length >= MAX_ELEMENTS) return
    try {
      const probe = document.createElementNS(SVG_NAMESPACE, 'path')
      probe.setAttribute('d', subpath)
      parent.appendChild(probe)
      const points = samplePoints(probe, matrix, scale, origin)
      probe.remove()
      if (points) sink.push(lineFromPoints(points, node, scale, roughness))
    } catch (error) {
      console.error(`[whiteboard] svg path subpath skipped: ${String(error)}`)
    }
  }
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
  if (tag === 'g' || tag === 'svg') {
    Array.from(node.children).forEach((child) => convertNode(child, matrix, scale, origin, roughness, sink))
    return
  }
  const own = (node as SVGGraphicsElement).transform?.baseVal?.consolidate()?.matrix
  const current = own ? matrix.multiply(own) : matrix
  const attr = (name: string, fallback = '0'): number => parseFloat(node.getAttribute(name) ?? fallback) || 0
  if (tag === 'rect') {
    const at = applyMatrix(current, attr('x'), attr('y'))
    sink.push({
      type: 'rectangle',
      x: at.x * scale - origin.x,
      y: at.y * scale - origin.y,
      width: attr('width') * current.a * scale,
      height: attr('height') * current.d * scale,
      ...styleFields(node, scale, roughness),
    } as ExcalidrawElementSkeleton)
    return
  }
  if (tag === 'circle' || tag === 'ellipse') {
    const rx = attr(tag === 'circle' ? 'r' : 'rx')
    const ry = attr(tag === 'circle' ? 'r' : 'ry')
    const at = applyMatrix(current, attr('cx') - rx, attr('cy') - ry)
    sink.push({
      type: 'ellipse',
      x: at.x * scale - origin.x,
      y: at.y * scale - origin.y,
      width: rx * 2 * current.a * scale,
      height: ry * 2 * current.d * scale,
      ...styleFields(node, scale, roughness),
    } as ExcalidrawElementSkeleton)
    return
  }
  if (tag === 'text') {
    const at = applyMatrix(current, attr('x'), attr('y'))
    const fontSize = (parseFloat(getComputedStyle(node).fontSize) || 16) * scale
    sink.push({
      type: 'text',
      x: at.x * scale - origin.x,
      y: at.y * scale - origin.y - fontSize,
      text: node.textContent ?? '',
      fontSize,
      strokeColor: resolvedStyle(node).fill ?? '#1e1e1e',
    } as ExcalidrawElementSkeleton)
    return
  }
  if (tag === 'line') {
    const from = applyMatrix(current, attr('x1'), attr('y1'))
    const to = applyMatrix(current, attr('x2'), attr('y2'))
    sink.push(
      lineFromPoints(
        [
          [from.x * scale - origin.x, from.y * scale - origin.y],
          [to.x * scale - origin.x, to.y * scale - origin.y],
        ],
        node,
        scale,
        roughness,
      ),
    )
    return
  }
  if (tag === 'polyline' || tag === 'polygon') {
    const numbers = (node.getAttribute('points') ?? '').match(NUMBER)?.map(Number) ?? []
    const pairs: number[][] = []
    for (let index = 0; index + 1 < numbers.length; index += 2) {
      const at = applyMatrix(current, numbers[index] ?? 0, numbers[index + 1] ?? 0)
      pairs.push([at.x * scale - origin.x, at.y * scale - origin.y])
    }
    if (tag === 'polygon' && pairs.length) pairs.push([pairs[0]?.[0] ?? 0, pairs[0]?.[1] ?? 0])
    if (pairs.length > 1) sink.push(lineFromPoints(pairs, node, scale, roughness))
    return
  }
  if (tag === 'path') convertPath(node, current, scale, origin, roughness, sink)
}

export function svgToSkeletons(svgMarkup: string, options: ConvertOptions): ExcalidrawElementSkeleton[] {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;'
  host.innerHTML = svgMarkup
  const svg = host.querySelector('svg')
  if (!svg) throw new Error('no <svg> root found')
  document.body.appendChild(host)
  try {
    const viewBox = svg.viewBox?.baseVal
    const sourceWidth = viewBox?.width || parseFloat(svg.getAttribute('width') ?? '400') || 400
    const scale = options.width / sourceWidth
    const origin = {x: (viewBox?.x ?? 0) * scale - options.x, y: (viewBox?.y ?? 0) * scale - options.y}
    const sink: ExcalidrawElementSkeleton[] = []
    convertNode(svg, svg.createSVGMatrix() as DOMMatrix, scale, origin, options.roughness, sink)
    return sink
  } finally {
    host.remove()
  }
}
