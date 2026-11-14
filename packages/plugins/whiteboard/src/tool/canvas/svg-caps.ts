const MAX_BYTES = 64 * 1024
const MAX_NODES = 400
const DRAWABLE = /<(path|rect|circle|ellipse|line|polyline|polygon|text)\b/g

export function validateSvg(svg: string): void {
  if (new TextEncoder().encode(svg).byteLength > MAX_BYTES) throw new Error('svg exceeds 64kb')
  if (!/<svg\b/i.test(svg)) throw new Error('markup must have an <svg> root')
  if (/<script\b/i.test(svg)) throw new Error('script elements are not allowed')
  if (/<foreignObject\b/i.test(svg)) throw new Error('foreignObject elements are not allowed')
  const nodes = svg.match(DRAWABLE)?.length ?? 0
  if (nodes > MAX_NODES) throw new Error(`svg has ${nodes} drawable nodes, limit is 400`)
}
