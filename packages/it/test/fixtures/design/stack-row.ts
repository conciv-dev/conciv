const LINK = 'https://www.figma.com/design/ItStackRowKey/x?node-id=9-1'
const FRAME = {w: 1200, h: 400}
const ROW = '9:2'
const BREAKPOINT = 800

function card(input: {id: string; x: number}): unknown {
  return {
    id: input.id,
    name: 'Card',
    type: 'FRAME',
    absoluteBoundingBox: {x: input.x, y: 0, width: BREAKPOINT / 2, height: 200},
    fills: [{type: 'SOLID', color: {r: 0, g: 0, b: 0, a: 1}}],
    children: [],
  }
}

const DOCUMENT = {
  name: 'it stack row',
  lastModified: '2026-11-10T00:00:00Z',
  version: '1',
  nodes: {
    '9:1': {
      document: {
        id: '9:1',
        name: 'Page',
        type: 'FRAME',
        absoluteBoundingBox: {x: 0, y: 0, width: FRAME.w, height: FRAME.h},
        fills: [],
        children: [
          {
            id: ROW,
            name: 'Row',
            type: 'FRAME',
            absoluteBoundingBox: {x: 0, y: 0, width: BREAKPOINT, height: 200},
            fills: [],
            children: [card({id: '9:3', x: 0}), card({id: '9:4', x: BREAKPOINT / 2})],
          },
        ],
      },
    },
  },
}

export const stackRow = {link: LINK, frame: FRAME, row: ROW, breakpoint: BREAKPOINT, document: DOCUMENT}
