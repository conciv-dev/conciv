import type {Box, Design, LiveComponent} from '../shared/defs.js'
import {nodeLooks} from './node-look.js'

export function wrapsOf(input: {
  design: Design
  first: (id: string) => LiveComponent | undefined
}): {node: string; lines: number; frame: number}[] {
  return nodeLooks(input.design).flatMap((look) => {
    const element = input.first(look.node)
    if (look.type !== TEXT || look.line_height === null || element === undefined) return []
    const frame = Math.round(look.h / look.line_height)
    const lines = linesOf(element.glyphs.flatMap((glyph) => glyph.boxes))
    return frame > 0 && lines > 0 && lines !== frame ? [{node: look.node, lines, frame}] : []
  })
}

const TEXT = 'TEXT'

function linesOf(boxes: Box[]): number {
  const centers = boxes.map((box) => ({center: box.y + box.h / 2, bottom: box.y + box.h}))
  return centers
    .toSorted((a, b) => a.center - b.center)
    .reduce<{lines: number; bottom: number}>(
      (found, box) =>
        found.lines > 0 && box.center <= found.bottom ? found : {lines: found.lines + 1, bottom: box.bottom},
      {lines: 0, bottom: 0},
    ).lines
}
