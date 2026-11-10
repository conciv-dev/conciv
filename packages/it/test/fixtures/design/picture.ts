import {PNG} from 'pngjs'

const LINK = 'https://www.figma.com/design/ItPictureKey/x?node-id=2-1'
const PICTURE_FRAME = {w: 400, h: 300}
const PICTURE = {x: 50, y: 50, w: 200, h: 100}
const QUADRANTS = [
  [214, 69, 69],
  [46, 160, 67],
  [44, 92, 201],
  [240, 200, 40],
]
const DOCUMENT = {
  name: 'it picture',
  lastModified: '2026-11-10T00:00:00Z',
  version: '1',
  nodes: {
    '2:1': {
      document: {
        id: '2:1',
        name: 'Picture',
        type: 'FRAME',
        absoluteBoundingBox: {x: 0, y: 0, width: PICTURE_FRAME.w, height: PICTURE_FRAME.h},
        fills: [{type: 'SOLID', color: {r: 1, g: 1, b: 1, a: 1}}],
        children: [
          {
            id: '2:2',
            name: 'Photo',
            type: 'RECTANGLE',
            absoluteBoundingBox: {x: PICTURE.x, y: PICTURE.y, width: PICTURE.w, height: PICTURE.h},
            fills: [{type: 'IMAGE', scaleMode: 'FILL', imageRef: 'photo'}],
            children: [],
          },
        ],
      },
    },
  },
}

export const picture = {link: LINK, box: PICTURE, document: DOCUMENT, painted, framed}

function painted(input: {width: number; height: number; turned: boolean}): Uint8Array {
  const png = new PNG({width: input.width, height: input.height})
  Array.from({length: input.width * input.height}, (_, index) => index).forEach((index) => {
    const x = index % input.width
    const y = (index - x) / input.width
    const quadrant = (y < input.height / 2 ? 0 : 2) + (x < input.width / 2 ? 0 : 1)
    const [red = 0, green = 0, blue = 0] = QUADRANTS[input.turned ? 3 - quadrant : quadrant] ?? []
    png.data.set([red, green, blue, 255], index * 4)
  })
  return new Uint8Array(PNG.sync.write(png))
}

function framed(): Uint8Array {
  const png = new PNG({width: PICTURE_FRAME.w, height: PICTURE_FRAME.h})
  png.data.fill(255)
  const photo = PNG.sync.read(Buffer.from(painted({width: PICTURE.w, height: PICTURE.h, turned: false})))
  PNG.bitblt(photo, png, 0, 0, PICTURE.w, PICTURE.h, PICTURE.x, PICTURE.y)
  return new Uint8Array(PNG.sync.write(png))
}
