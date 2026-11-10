const LINK = 'https://www.figma.com/design/ItSideMarginKey/x?node-id=6-1'
const FRAME = {w: 1440, h: 200}
const PANEL = '6:2'
const DOCUMENT = {
  name: 'it side margin',
  lastModified: '2026-11-10T00:00:00Z',
  version: '1',
  nodes: {
    '6:1': {
      document: {
        id: '6:1',
        name: 'Page',
        type: 'FRAME',
        absoluteBoundingBox: {x: 0, y: 0, width: FRAME.w, height: FRAME.h},
        fills: [],
        children: [
          {
            id: PANEL,
            name: 'Panel',
            type: 'FRAME',
            absoluteBoundingBox: {x: 40, y: 40, width: 1312, height: 100},
            fills: [],
            children: [],
          },
        ],
      },
    },
  },
}

export const sideMargin = {link: LINK, frame: FRAME, panel: PANEL, document: DOCUMENT}
