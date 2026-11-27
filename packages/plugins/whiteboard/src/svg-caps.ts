import {svgErrors} from './errors/svg-errors.js'

const MAX_BYTES = 64 * 1024
const MAX_NODES = 400
const DRAWABLE = /<(path|rect|circle|ellipse|line|polyline|polygon|text)\b/g

export function validateSvg(svg: string): void {
  if (new TextEncoder().encode(svg).byteLength > MAX_BYTES) throw svgErrors.TOO_LARGE()
  if (!/<svg\b/i.test(svg)) throw svgErrors.NO_ROOT()
  if (/<script\b/i.test(svg)) throw svgErrors.SCRIPT()
  if (/<foreignObject\b/i.test(svg)) throw svgErrors.FOREIGN_OBJECT()
  const nodes = svg.match(DRAWABLE)?.length ?? 0
  if (nodes > MAX_NODES) throw svgErrors.TOO_MANY_NODES({nodes, limit: MAX_NODES})
}
