const LINK = 'https://www.figma.com/design/ItTallPageKey/x?node-id=8-1'
const FRAME = {w: 390, h: 400}
const TITLE = '8:2'
const LINE = '8:3'
const DOCUMENT = {
  name: 'it tall page',
  lastModified: '2026-11-10T00:00:00Z',
  version: '1',
  nodes: {
    '8:1': {
      document: {
        id: '8:1',
        name: 'Page',
        type: 'FRAME',
        absoluteBoundingBox: {x: 0, y: 0, width: FRAME.w, height: FRAME.h},
        fills: [],
        children: [
          {
            id: TITLE,
            name: 'Title',
            type: 'TEXT',
            absoluteBoundingBox: {x: 0, y: 0, width: FRAME.w, height: 40},
            characters: 'Tall page',
            style: {fontFamily: 'Courier', fontWeight: 400, fontSize: 32, lineHeightPx: 40},
            fills: [],
            children: [],
          },
          {
            id: LINE,
            name: 'Line',
            type: 'RECTANGLE',
            absoluteBoundingBox: {x: 0, y: 40, width: 1, height: 360},
            fills: [{type: 'SOLID', color: {r: 0, g: 0, b: 0, a: 1}}],
            children: [],
          },
        ],
      },
    },
  },
}

export const tallPage = {link: LINK, frame: FRAME, line: LINE, document: DOCUMENT}
