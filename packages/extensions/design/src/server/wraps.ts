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
    const ends =
      input.target === null
        ? null
        : lineEnds({look, lineHeight: look.line_height, rows: rows.slice(0, frame), target: input.target})
    const tolerance = look.font_size ?? look.line_height
    if (ends !== null && metricBreak({ends, width: look.w, tolerance})) return []
    if (lines !== frame) return [{node: look.node, lines, frame, line: null}]
    const line = ends === null ? null : brokenLine({ends, tolerance})
    return line === null ? [] : [{node: look.node, lines, frame, line}]
  })
}

const TEXT = 'TEXT'

const EDGE_EM = 0.25

type LineEnd = {page: number; drawn: number}

function lineEnds(input: {look: Box; lineHeight: number; rows: Box[]; target: Raster}): LineEnd[] | null {
  const {look, lineHeight, rows} = input
  const bands = rows.map((_row, index) => ({x: look.x, y: look.y + index * lineHeight, w: look.w, h: lineHeight}))
  const inked = bands.map((band) => ({band, ink: input.target.trim(band)}))
  if (inked.some(({band, ink}) => ink.h >= band.h)) return null
  return rows.map((row, index) => ({page: row.w, drawn: inked[index]?.ink.w ?? row.w}))
}

function metricBreak(input: {ends: LineEnd[]; width: number; tolerance: number}): boolean {
  const {width, tolerance} = input
  const first = input.ends.find((end) => Math.abs(end.page - end.drawn) > tolerance)
  return first !== undefined && Math.max(first.page, first.drawn) > width - tolerance * EDGE_EM
}

function brokenLine(input: {ends: LineEnd[]; tolerance: number}): {index: number; page: number; drawn: number} | null {
  const {ends, tolerance} = input
  const gaps = ends.map((end) => end.page - end.drawn)
  const index = gaps.findIndex((gap, at) => {
    const next = gaps[at + 1] ?? 0
    return Math.abs(gap) > tolerance && Math.abs(next) > tolerance && Math.sign(gap) !== Math.sign(next)
  })
  const end = ends[index]
  return end === undefined ? null : {index, page: Math.round(end.page), drawn: end.drawn}
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
