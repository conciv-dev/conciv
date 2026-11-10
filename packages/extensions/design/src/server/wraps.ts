import type {Design, LiveComponent} from '../shared/defs.js'
import {nodeLooks} from './node-look.js'

export function wrapsOf(input: {
  design: Design
  first: (id: string) => LiveComponent | undefined
}): {node: string; lines: number; frame: number}[] {
  return nodeLooks(input.design).flatMap((look) => {
    const element = input.first(look.node)
    if (look.type !== TEXT || look.line_height === null || element === undefined) return []
    const {lineHeight} = element.styles
    const frame = Math.round(look.h / look.line_height)
    const lines = lineHeight > 0 ? Math.round((element.textBox ?? element.bounds).h / lineHeight) : frame
    return frame > 0 && lines !== frame ? [{node: look.node, lines, frame}] : []
  })
}

const TEXT = 'TEXT'
