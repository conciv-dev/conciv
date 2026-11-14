import type {Box, Design, LiveComponent, Raster} from '../shared/defs.js'
import {nodeLooks} from './node-look.js'

export type Wrap = {
  node: string
  lines: number
  frame: number
  line: {index: number; page: number; drawn: number} | null
}

export function wrapsOf(input: {
  design: Design
  first: (id: string) => LiveComponent | undefined
  target: Raster | null
}): Wrap[] {
  return nodeLooks(input.design).flatMap((look): Wrap[] => {
    const element = input.first(look.node)
    if (look.type !== TEXT || look.line_height === null || element === undefined) return []
    const frame = Math.round(look.h / look.line_height)
    const rows = linesOf(element.glyphs.flatMap((glyph) => glyph.boxes))
    const lines = rows.length
    if (frame <= 0 || lines <= 0) return []
    if (lines !== frame) return [{node: look.node, lines, frame, line: null}]
    if (input.target === null) return []
    const line = brokenLine({look, lineHeight: look.line_height, rows, target: input.target})
    return line === null ? [] : [{node: look.node, lines, frame, line}]
  })
}

const TEXT = 'TEXT'

function brokenLine(input: {
  look: Box & {font_size: number | null}
  lineHeight: number
  rows: Box[]
  target: Raster
}): {index: number; page: number; drawn: number} | null {
  const {look, lineHeight, rows} = input
  const bands = rows.map((row, index) => ({x: look.x, y: look.y + index * lineHeight, w: look.w, h: lineHeight}))
  const inked = bands.map((band) => ({band, ink: input.target.trim(band)}))
  if (inked.some(({band, ink}) => ink.h >= band.h)) return null
  const tolerance = look.font_size ?? lineHeight
  const gaps = rows.map((row, at) => row.w - (inked[at]?.ink.w ?? row.w))
  const index = gaps.findIndex((gap, at) => {
    const next = gaps[at + 1] ?? 0
    return Math.abs(gap) > tolerance && Math.abs(next) > tolerance && Math.sign(gap) !== Math.sign(next)
  })
  const row = rows[index]
  const drawn = inked[index]?.ink.w
  return row === undefined || drawn === undefined ? null : {index, page: Math.round(row.w), drawn}
}

function linesOf(boxes: Box[]): Box[] {
  return boxes
    .toSorted((a, b) => a.y + a.h / 2 - (b.y + b.h / 2))
    .reduce<Box[]>((found, box) => {
      const last = found.at(-1)
      if (last === undefined || box.y + box.h / 2 > last.y + last.h) return [...found, box]
      const x = Math.min(last.x, box.x)
      const right = Math.max(last.x + last.w, box.x + box.w)
      return [...found.slice(0, -1), {...last, x, w: right - x}]
    }, [])
}
