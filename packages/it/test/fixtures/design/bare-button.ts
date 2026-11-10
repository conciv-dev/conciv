const LINK = 'https://www.figma.com/design/ItBareButtonKey/x?node-id=4-1'
const FRAME = {w: 1280, h: 128}
const LABEL = '4:3'
const WHITE = {type: 'SOLID', color: {r: 1, g: 1, b: 1, a: 1}}
const BLUE = {type: 'SOLID', color: {r: 0.26, g: 0.42, b: 0.95, a: 1}}
const DOCUMENT = {
  name: 'it bare button',
  lastModified: '2026-11-10T00:00:00Z',
  version: '1',
  nodes: {
    '4:1': {
      document: {
        id: '4:1',
        name: 'Contact',
        type: 'FRAME',
        absoluteBoundingBox: {x: 0, y: 0, width: FRAME.w, height: FRAME.h},
        fills: [WHITE],
        children: [
          {
            id: '4:2',
            name: 'Button',
            type: 'FRAME',
            absoluteBoundingBox: {x: 40, y: 40, width: 160, height: 48},
            fills: [BLUE],
            cornerRadius: 8,
            children: [
              {
                id: LABEL,
                name: 'Contact Us',
                type: 'TEXT',
                absoluteBoundingBox: {x: 77, y: 54, width: 86, height: 20},
                characters: 'Contact Us',
                style: {fontFamily: 'Inter', fontWeight: 400, fontSize: 16, lineHeightPx: 20},
                fills: [WHITE],
                children: [],
              },
            ],
          },
        ],
      },
    },
  },
}

export const bareButton = {link: LINK, frame: FRAME, label: LABEL, document: DOCUMENT}
