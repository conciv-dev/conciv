import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {PNG} from 'pngjs'
import {figmaFrame} from './figma-frame.js'

export async function cardsDesign(targetsDir: string): Promise<{figma: string; image: string; document: unknown}> {
  const image = join(targetsDir, 'cards-figma.png')
  await writeFile(image, blankPng({width: 1200, height: 400}))
  return {figma: FIGMA_LINK, image, document: CARDS_DOCUMENT}
}

const FIGMA_LINK = 'https://www.figma.com/design/ItFixtureKey/x?node-id=1-2'

const CARDS_DOCUMENT = {
  name: 'it fixture',
  lastModified: '2026-11-06T00:00:00Z',
  version: '1',
  nodes: {
    '1:2': {
      document: figmaFrame({
        id: '1:2',
        name: 'Cards',
        box: {x: 0, y: 0, w: 1200, h: 400},
        layoutMode: 'HORIZONTAL',
        children: [0, 1, 2].map((index) =>
          figmaFrame({id: `1:${10 + index}`, name: 'Card', box: {x: index * 408, y: 50, w: 384, h: 300}}),
        ),
      }),
    },
  },
}

function blankPng(input: {width: number; height: number}): Uint8Array {
  const png = new PNG({width: input.width, height: input.height})
  png.data.fill(255)
  return new Uint8Array(PNG.sync.write(png))
}
