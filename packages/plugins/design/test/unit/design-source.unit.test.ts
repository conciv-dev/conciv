import * as NodeServices from '@effect/platform-node/NodeServices'
import {it} from '@effect/vitest'
import {Effect, FileSystem, Path, Redacted} from 'effect'
import {PNG} from 'pngjs'
import {describe, expect} from 'vitest'
import {loadFigma} from '../../src/sources/figma.js'
import {flattenStack} from '../../src/sources/fill-stack.js'
import {walk} from '../../src/model/tree.js'
import type {DesignNode} from '../../src/model/design.js'
import {figmaFills, figmaFrame, figmaNetwork, type FigmaAnswer} from '../utils/figma-network.js'

describe('a Figma frame becomes the design tree', () => {
  const SECRET = 'figd_secret-token'
  const key = Redacted.make(SECRET)

  const folders = Effect.fn('test.folders')(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = yield* fs.makeTempDirectoryScoped({prefix: 'design-assets-'})
    return {folder: path.join(root, 'public', 'design'), cache: path.join(root, 'assets')}
  })

  const answered = (answers: FigmaAnswer[]) => Effect.provide(figmaNetwork({key: SECRET, answers}))

  const nodeIn = (root: DesignNode, id: string) => [...walk(root)].find(({node}) => node.id === id)?.node

  it.effect('reads the frame over REST into nodes, implied groups, reflow, roles, components, tokens and assets', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const where = yield* folders()
      const link = {fileKey: 'FILEKEY', nodeId: '1:2'}
      const pricing = figmaFrame({name: 'pricing', fileKey: 'FILEKEY', node: '1:2'})
      const variables = {url: '/files/FILEKEY/variables/local', fixture: 'figma-pricing-variables.json'}

      const {design, warnings} = yield* loadFigma({...where, link, key, attached: null}).pipe(
        answered([...pricing, variables]),
      )
      expect(design.source).toEqual({kind: 'figma', ref: 'FILEKEY/1:2'})
      expect(design.viewport).toEqual({width: 1440, height: 900})
      expect(warnings).toEqual([
        'tokens: 1 variable names from Figma',
        expect.stringMatching(/^assets: 1 png of 1 nodes, from figma rest 0, crop from the frame render 1 \(rest: /),
      ])
      const tree = [...walk(design.root)].map(({node, depth}) => `${'  '.repeat(depth)}${node.id} ${node.kind}`)
      expect(tree).toEqual([
        '1:2 box',
        '  1:3 box',
        '    1:4 text',
        '    1:5 text',
        '    1:6 text',
        '  w:1:7 box',
        '    1:7 text',
        '    1:8 text',
        '    1:40 image',
        '  1:9 box',
        '    1:10 box',
        '      1:11 text',
        '      1:12 text',
        '    1:20 box',
        '      1:21 text',
        '      1:22 text',
        '    1:30 box',
        '      1:31 text',
        '      1:32 text',
      ])
      expect(nodeIn(design.root, 'w:1:7')).toMatchObject({
        implied: true,
        reflow: {kind: 'stack'},
        gate: {kind: 'wrapper'},
      })
      expect(nodeIn(design.root, '1:3')?.layout).toMatchObject({
        direction: 'row',
        gap: {px: 32},
        align: 'center',
        padding: {top: 24, right: 24, bottom: 24, left: 24},
      })
      expect(nodeIn(design.root, '1:9')?.reflow).toEqual({kind: 'wrap', minChildWidth: 280, breakpoint: 1280})
      expect(nodeIn(design.root, '1:10')?.figma).toMatchObject({
        component: 'Plan card',
        fields: {tokens: {fill: 'surface/card'}},
      })
      expect(nodeIn(design.root, '1:12')).toMatchObject({kind: 'text', text: '$12', role: 'data'})
      expect(nodeIn(design.root, '1:11')).toMatchObject({kind: 'text', text: 'Starter', role: 'unknown'})
      expect(nodeIn(design.root, '1:40')?.figma?.fields.asset).toBe('/design/1-40.png')
      expect(yield* fs.exists(path.join(where.folder, '1-40.png'))).toBe(true)

      const keptIds = yield* loadFigma({...where, link, key, attached: null}).pipe(answered(pricing))
      expect(keptIds.warnings).toEqual([
        expect.stringContaining('tokens: variable ids kept'),
        expect.stringContaining('from cache'),
      ])
      expect(nodeIn(keptIds.design.root, '1:10')?.figma?.fields.tokens).toEqual({fill: 'VariableID:1:1'})

      const hero = yield* loadFigma({...where, link: {fileKey: 'HERO', nodeId: '100:1170'}, key, attached: null}).pipe(
        answered([
          ...figmaFrame({name: 'hero-1440', fileKey: 'HERO', node: '100:1170'}),
          ...figmaFills({fileKey: 'HERO', fixture: 'figma-image-fill.png'}),
        ]),
      )
      const background = nodeIn(hero.design.root, '100:1170')
      expect(background?.figma?.fields).toMatchObject({
        asset: '/design/100-1170.png',
        assetLayers: [
          {type: 'image', blend: 'OVERLAY', scale: 'FILL'},
          {type: 'image', scale: 'TILE'},
          {type: 'solid', color: expect.stringMatching(/^#[0-9a-f]{6}$/)},
        ],
      })
      expect(background?.children.map((child) => child.kind)).toEqual(['text', 'text'])
      const flattened = PNG.sync.read(Buffer.from(yield* fs.readFile(path.join(where.folder, '100-1170.png'))))
      expect({width: flattened.width, height: flattened.height}).toEqual({width: 2560, height: 560})
      expect(hero.warnings.at(-1)).toBe('assets: 1 png of 1 nodes, from figma rest 1, crop from the frame render 0')

      const heic = yield* loadFigma({...where, link: {fileKey: 'HEIC', nodeId: '100:1480'}, key, attached: null}).pipe(
        answered([
          ...figmaFrame({name: 'hero-390', fileKey: 'HEIC', node: '100:1480'}),
          ...figmaFills({fileKey: 'HEIC', fixture: 'figma-image-fill.heic'}),
        ]),
      )
      expect(heic.warnings.at(-1)).toContain(
        '100:1480 not flattened: the image fill of 100:1480 is heic, which the design plugin cannot decode',
      )
      expect(nodeIn(heic.design.root, '100:1480')?.figma?.fields.asset).toBeUndefined()

      const contact = yield* loadFigma({
        ...where,
        link: {fileKey: 'CONTACT', nodeId: '100:1403'},
        key,
        attached: null,
      }).pipe(answered(figmaFrame({name: 'contact-section', fileKey: 'CONTACT', node: '100:1403'})))
      expect(contact.warnings.at(-1)).toMatch(/crop from the frame render \d+ \(rest: Figma answered 404/)
      expect(nodeIn(contact.design.root, '100:1406')?.figma?.fields.asset).toMatch(/^\/design\/100-1406\.png$/)

      const refused = yield* loadFigma({...where, link, key: Redacted.make('figd_stale'), attached: null}).pipe(
        answered(pricing),
        Effect.flip,
      )
      expect(refused.code).toBe('design.FIGMA_TOKEN')
      expect(refused.message).toBe('Figma refused the token: Invalid token')
      expect(JSON.stringify({...refused, message: refused.message, fix: refused.fix})).not.toContain('figd_')
    }).pipe(Effect.provide(NodeServices.layer)),
  )
})

describe('a fill stack flattens into one picture', () => {
  const pixel = (png: PNG, x: number, y: number) => [
    ...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4),
  ]

  it.effect('draws gradients, blends, fits, tiles and filters each layer as Figma does', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const image = yield* fs.readFile(path.join(import.meta.dirname, '..', 'fixtures', 'figma-image-fill.png'))
      const flat = (input: {
        layers: Parameters<typeof flattenStack>[0]['layers']
        box: {w: number; h: number}
        backdrop?: string
      }) =>
        flattenStack({
          id: 'n',
          images: {fill: image},
          layers: input.layers,
          box: input.box,
          backdrop: input.backdrop ?? null,
        }).pipe(Effect.map(({png, notes}) => ({png: PNG.sync.read(Buffer.from(png)), notes})))

      const linear = yield* flat({
        box: {w: 20, h: 10},
        layers: [
          {
            type: 'linear-gradient',
            blend: 'NORMAL',
            opacity: 1,
            handles: [
              {x: 0, y: 0.5},
              {x: 1, y: 0.5},
            ],
            stops: [
              {color: '#ff0000', opacity: 1, at: 0},
              {color: '#0000ff', opacity: 1, at: 100},
            ],
          },
        ],
      })
      expect({width: linear.png.width, height: linear.png.height}).toEqual({width: 40, height: 20})
      expect(pixel(linear.png, 0, 10)).toEqual([252, 0, 3, 255])
      expect(pixel(linear.png, 39, 10)).toEqual([3, 0, 252, 255])

      const multiplied = yield* flat({
        box: {w: 2, h: 2},
        backdrop: '#ff8000',
        layers: [{type: 'solid', blend: 'MULTIPLY', opacity: 1, color: '#808080'}],
      })
      expect(pixel(multiplied.png, 0, 0)).toEqual([128, 64, 0, 255])

      const contained = yield* flat({
        box: {w: 40, h: 40},
        layers: [{type: 'image', blend: 'NORMAL', opacity: 1, ref: 'fill', scale: 'FIT'}],
      })
      expect(pixel(contained.png, 40, 0)[3]).toBe(0)
      expect(pixel(contained.png, 40, 40)[3]).toBe(255)

      const tiled = yield* flat({
        box: {w: 40, h: 10},
        layers: [{type: 'image', blend: 'NORMAL', opacity: 1, ref: 'fill', scale: 'TILE', scalingFactor: 0.25}],
      })
      expect(pixel(tiled.png, 33, 3)).toEqual(pixel(tiled.png, 1, 3))

      const gray = yield* flat({
        box: {w: 32, h: 20},
        layers: [
          {type: 'image', blend: 'NORMAL', opacity: 0.5, ref: 'fill', scale: 'STRETCH', filters: {saturation: -1}},
        ],
      })
      const [red = 0, green = 0, blue = 0, alpha] = pixel(gray.png, 50, 30)
      expect(Math.abs(red - green)).toBeLessThanOrEqual(1)
      expect(Math.abs(green - blue)).toBeLessThanOrEqual(1)
      expect(alpha).toBe(128)

      const unknown = yield* flat({
        box: {w: 4, h: 4},
        layers: [
          {type: 'angular-gradient', blend: 'PLUS_DARKER', opacity: 1},
          {type: 'image', blend: 'NORMAL', opacity: 1, ref: 'fill', scale: 'CROP', filters: {contrast: 0.2}},
        ],
      })
      expect(unknown.notes).toEqual([
        'n blend PLUS_DARKER drawn as normal',
        'n angular-gradient left out',
        'n scale CROP drawn as cover',
        'n filter contrast left out',
      ])
    }).pipe(Effect.provide(NodeServices.layer)),
  )
})
