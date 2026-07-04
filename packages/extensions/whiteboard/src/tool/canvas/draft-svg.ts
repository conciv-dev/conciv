export type DraftElement = {
  type: string
  x: number
  y: number
  width?: number
  height?: number
  points?: number[][]
  text?: string
  fontSize?: number
  strokeColor?: string
  backgroundColor?: string
  strokeWidth?: number
}

const escape = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", '&apos;')

const styleOf = (element: DraftElement): string =>
  `fill='${element.backgroundColor ?? 'transparent'}' stroke='${element.strokeColor ?? '#1e1e1e'}' stroke-width='${element.strokeWidth ?? 1}'`

function nodeOf(element: DraftElement): string {
  if (element.type === 'rectangle' || element.type === 'diamond') {
    return `<rect x='${element.x}' y='${element.y}' width='${element.width ?? 0}' height='${element.height ?? 0}' ${styleOf(element)}/>`
  }
  if (element.type === 'ellipse') {
    const rx = (element.width ?? 0) / 2
    const ry = (element.height ?? 0) / 2
    return `<ellipse cx='${element.x + rx}' cy='${element.y + ry}' rx='${rx}' ry='${ry}' ${styleOf(element)}/>`
  }
  if (element.type === 'text') {
    return `<text x='${element.x}' y='${element.y + (element.fontSize ?? 16)}' font-size='${element.fontSize ?? 16}' fill='${element.strokeColor ?? '#1e1e1e'}'>${escape(element.text ?? '')}</text>`
  }
  const points = (element.points ?? []).map(([px = 0, py = 0]) => `${element.x + px},${element.y + py}`).join(' ')
  if (!points) return ''
  return `<polyline points='${points}' fill='${element.backgroundColor ?? 'none'}' stroke='${element.strokeColor ?? '#1e1e1e'}' stroke-width='${element.strokeWidth ?? 1}'/>`
}

const maxOf = (values: number[], floor: number): number =>
  values.reduce((max, value) => (Number.isFinite(value) && value > max ? value : max), floor)

export function draftToSvg(elements: DraftElement[]): {svg: string; width: number; height: number} {
  const xs = elements.flatMap((element) => [
    element.x,
    element.x + (element.width ?? 0),
    ...(element.points ?? []).map(([px = 0]) => element.x + px),
  ])
  const ys = elements.flatMap((element) => [
    element.y,
    element.y + (element.height ?? 0),
    ...(element.points ?? []).map(([, py = 0]) => element.y + py),
  ])
  const width = Math.round(maxOf(xs, 400) + 40)
  const height = Math.round(maxOf(ys, 300) + 40)
  const body = elements.map(nodeOf).join('')
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}' width='${width}' height='${height}'><rect x='0' y='0' width='${width}' height='${height}' fill='#ffffff'/>${body}</svg>`
  return {svg, width, height}
}
