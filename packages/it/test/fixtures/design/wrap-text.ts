const LINK = 'https://www.figma.com/design/ItWrapTextKey/x?node-id=7-1'
const FRAME = {w: 1280, h: 200}
const PARAGRAPH = '7:2'
const TEXT = 'The quarterly report lists every invoice that was paid late, with the customer and the days overdue.'
const DOCUMENT = {
  name: 'it wrap text',
  lastModified: '2026-11-10T00:00:00Z',
  version: '1',
  nodes: {
    '7:1': {
      document: {
        id: '7:1',
        name: 'Report',
        type: 'FRAME',
        absoluteBoundingBox: {x: 0, y: 0, width: FRAME.w, height: FRAME.h},
        fills: [],
        children: [
          {
            id: PARAGRAPH,
            name: 'Paragraph',
            type: 'TEXT',
            absoluteBoundingBox: {x: 40, y: 40, width: 800, height: 120},
            characters: TEXT,
            style: {fontFamily: 'Courier', fontWeight: 400, fontSize: 32, lineHeightPx: 40},
            fills: [],
            children: [],
          },
        ],
      },
    },
  },
}

export const wrapText = {link: LINK, frame: FRAME, paragraph: PARAGRAPH, text: TEXT, document: DOCUMENT}
