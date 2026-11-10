import type {Box} from '@conciv/extension-design/defs'

export function figmaFrame(input: {
  id: string
  name: string
  type?: string
  box: Box
  children?: unknown[]
  layoutMode?: string
}): unknown {
  return {
    id: input.id,
    name: input.name,
    type: input.type ?? 'FRAME',
    absoluteBoundingBox: {x: input.box.x, y: input.box.y, width: input.box.w, height: input.box.h},
    fills: [{type: 'SOLID', color: {r: 1, g: 1, b: 1, a: 1}}],
    ...(input.layoutMode === undefined ? {} : {layoutMode: input.layoutMode, itemSpacing: 24}),
    children: input.children ?? [],
  }
}
