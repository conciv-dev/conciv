/* oxlint-disable playwright/no-raw-locators -- the cases read the tab directly */
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {setImmediate as nextTurn} from 'node:timers/promises'
import {differenceCiede2000} from 'culori'
import {PNG} from 'pngjs'
import {createStorage} from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import {afterAll, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {extensionTable, openDb} from '@conciv/db'
import {makeExtRpcClient} from '@conciv/extension'
import type {} from '@conciv/extension-design/client'
import type {XrayRouter} from '@conciv/extension-design/server'
import {
  DESIGN_TOOLS,
  type Box,
  type Design,
  type DesignNode,
  type LiveComponent,
  type Measured,
  type Raster,
  type Round,
} from '@conciv/extension-design/defs'
import {designConfig} from '../../extensions/design/src/shared/tolerances.js'
import {walk} from '../../extensions/design/src/shared/tree.js'
import {createStore} from '../../extensions/design/src/server/store.js'
import {designTables} from '../../extensions/design/src/server/tables.js'
import {migrations} from '../../extensions/design/src/server/migrations.gen.js'
import {createRaster} from '../../extensions/design/src/server/raster.js'
import {createImageAdapter} from '../../extensions/design/src/server/sources/image.js'
import {createVotePairer} from '../../extensions/design/src/server/pairers/vote.js'
import {bootDesignHost} from './fixtures/design/boot.js'
import {cardsDesign} from './fixtures/design/cards.js'

const COLOR_DELTA_E = 3
const PAIR_BUDGET_MS = 20_000

const NO_IDS = {
  id: '',
  dom: [],
  cssom: [],
  src: {at: null, element: 'body', classes: [], parent: null},
  fom: [],
  children: [],
}
const FIGMA_LINK = 'https://www.figma.com/design/ItFixtureKey/x?node-id=1-2'

const [getDef, checkDef] = DESIGN_TOOLS

type ToolOutput<Tool extends {outputSchema?: z.ZodType}> = z.output<NonNullable<Tool['outputSchema']>>
type Got = ToolOutput<typeof getDef>
type Checked = ToolOutput<typeof checkDef>

function target(name: string): string {
  return join(kit.targetsDir, `${name}.png`)
}

const kit = await bootDesignHost()
const {call, goto} = kit
const xrayRpc = makeExtRpcClient<XrayRouter>(kit.apiBase, 'design')

afterAll(() => kit.dispose())

const colorDistance = differenceCiede2000()

const NO_STYLES: LiveComponent['styles'] = {
  background: '',
  color: '',
  fontSize: 0,
  lineHeight: 0,
  fontWeight: 0,
  fontFamily: '',
  textAlign: 'start',
  radius: 0,
  position: 'static',
  display: 'block',
  flexDirection: 'row',
  overflowX: 'visible',
  sizing: {width: 'auto', height: 'auto'},
  border: {width: 0, style: 'none', color: '#000000', side: 'top'},
  gradient: null,
}

function liveBox(input: {path: string; box: Box; key: string; children?: LiveComponent[]}): LiveComponent {
  return {
    source: null,
    key: input.key,
    instance: null,
    repeat: null,
    owner: null,
    tag: 'div',
    text: '',
    box: input.box,
    bounds: input.box,
    scrolls: false,
    textBox: null,
    glyphs: [],
    axis: null,
    columns: null,
    styles: NO_STYLES,
    role: null,
    hints: [],
    index: 1,
    path: input.path,
    drawn: false,
    placeholder: null,
    children: input.children ?? [],
  }
}

function boxNode(input: {id: string; box: Box; children?: DesignNode[]}): DesignNode {
  return {
    id: input.id,
    hash: input.id,
    box: input.box,
    kind: 'box',
    border: null,
    radius: 0,
    children: input.children ?? [],
  }
}

function blankPng(input: {width: number; height: number}): Uint8Array {
  const png = new PNG({width: input.width, height: input.height})
  png.data.fill(255)
  return new Uint8Array(PNG.sync.write(png))
}

async function cardsTarget(): Promise<Got> {
  return call('design_get', await cardsDesign(kit.targetsDir))
}

function roundOf(checked: Checked): Exclude<Checked, {unsettled: true}> {
  if ('unsettled' in checked) throw new Error(`the page did not settle: ${JSON.stringify(checked)}`)
  return checked
}

function withInk(input: {ink: Box | null}): Raster {
  const width = 40
  const height = 20
  const data = new Uint8Array(width * height * 4)
  Array.from({length: width * height}, (_, index) => index).forEach((index) => {
    const x = index % width
    const y = (index - x) / width
    const {ink} = input
    const covered = ink !== null && x >= ink.x && x < ink.x + ink.w && y >= ink.y && y < ink.y + ink.h
    data.set(covered ? [0, 0, 0, 255] : [255, 255, 255, 255], index * 4)
  })
  return createRaster({pixels: data, width, height})
}

describe('trimToInk', () => {
  it('shrinks a box to the ink inside it', () => {
    const raster = withInk({ink: {x: 12, y: 5, w: 8, h: 4}})
    expect(raster.trim({x: 10, y: 3, w: 20, h: 10})).toEqual({x: 12, y: 5, w: 8, h: 4})
  })

  it('keeps a box with no ink', () => {
    const box = {x: 10, y: 3, w: 20, h: 10}
    expect(withInk({ink: null}).trim(box)).toEqual(box)
  })

  it('keeps a box under two pixels on a side', () => {
    const box = {x: 12, y: 5, w: 1, h: 10}
    expect(withInk({ink: {x: 12, y: 5, w: 8, h: 4}}).trim(box)).toEqual(box)
  })
})

describe('glyphCoreColor', () => {
  it('finds no ink on a flat tile', () => {
    const box = {x: 0, y: 0, w: 16, h: 16}
    const raster = createRaster({pixels: new Uint8Array(16 * 16 * 4).fill(200), width: 16, height: 16})
    expect(raster.fills({box, glyphs: [box], color: '#c8c8c8'})[1]).toBeUndefined()
  })

  it('reads a thin stroke from its fully covered pixels, not its blended edge', () => {
    const box = {x: 0, y: 0, w: 16, h: 16}
    const data = new Uint8Array(16 * 16 * 4)
    Array.from({length: 16 * 16}, (_, index) => index).forEach((index) => {
      const x = index % 16
      const y = (index - x) / 16
      const stroke = y >= 2 && y < 14
      const pixel = stroke && x === 7 ? [255, 209, 102] : stroke && x === 8 ? [161, 158, 172] : [66, 107, 242]
      data.set([...pixel, 255], index * 4)
    })
    const raster = createRaster({pixels: data, width: 16, height: 16})
    const ink = raster.fills({box, glyphs: [box], color: '#426bf2'})[1]
    expect(ink).toBeDefined()
    expect(colorDistance(String(ink), '#ffd166')).toBeLessThanOrEqual(COLOR_DELTA_E)
  })
})

const OCR_SHUTDOWN = 'text failed: the OCR reader is shutting down'

describe('paddle disposal', () => {
  it('a read queued before disposal finishes first and a read during disposal is refused', async () => {
    const adapter = createImageAdapter({config: designConfig.parse({})})
    const blank = new PNG({width: 200, height: 100})
    blank.data.fill(255)
    const image = new Uint8Array(PNG.sync.write(blank))
    const memory = createStorage({driver: memoryDriver()})
    const load = () => adapter.load({ref: 'blank.png', scale: 1, project: memory, files: memory, attachments: {image}})
    const settled: string[] = []
    const queued = load().then(() => settled.push('read'))
    await nextTurn()
    const disposed = (adapter.dispose?.() ?? Promise.resolve()).then(() => settled.push('disposed'))
    expect((await load()).warnings).toContain(OCR_SHUTDOWN)
    await Promise.all([queued, disposed])
    expect(settled).toEqual(['read', 'disposed'])
    const after = await load()
    expect([after.warnings, after.design.root.children]).toEqual([[], []])
    await adapter.dispose?.()
  })
})

describe('store', () => {
  it('puts a design, keeps its mapping and rounds, and clears them', async () => {
    const orm = openDb({
      stateRoot: await mkdtemp(join(tmpdir(), 'conciv-design-store-')),
      extensions: [{name: 'design', migrations}],
    })
    const db = {
      orm,
      tables: designTables(extensionTable('design')),
      sources: () => [],
      read: async () => [],
      write: async () => [],
    }
    const store = createStore({db, state: createStorage({driver: memoryDriver()}), run: async () => null})
    const design: Design = {
      id: 'store-1',
      source: {kind: 'figma', ref: 'key/1:2'},
      viewport: {width: 100, height: 50},
      scale: 1,
      root: boxNode({id: '1:2', box: {x: 0, y: 0, w: 100, h: 50}}),
    }
    const record = await store.put({design, image: blankPng({width: 100, height: 50}), session: 'session-a'})
    expect([record.id, record.ref, record.width, record.height]).toEqual(['store-1', 'key/1:2', 100, 50])
    expect((await store.design('store-1')).root.id).toBe('1:2')
    expect(await store.mapping('store-1')).toEqual({})
    const mapping = {abc: {nodes: [{nodeId: '1:2', instance: null, confidence: 1, margin: 1, round: 1}]}}
    const site = {
      id: 'abc',
      dom: [],
      cssom: [],
      src: {at: null, element: 'div', classes: [], parent: null},
      children: [],
    }
    const ids = {root: {...site, fom: mapping.abc.nodes}, revoted: [], gone: []}
    const round: Round = {
      round: 1,
      rows: [],
      reflow: {widths: [], results: []},
      coverage: {
        nodes: 1,
        mapped: 1,
        rendered: 1,
        missing: [],
        notRendered: [],
        dupes: [],
        candidates: [],
        revoted: 0,
      },
      counts: {much: 0, noticeably: 0, slightly: 0, pins: 0, other: 0, reflow: 0, paint: 0, rows: 0},
      pixels: {share: 0},
      progress: null,
      at: 1,
      tree: '',
      verdict: null,
      unsettled: null,
    }
    await store.writeRound({
      id: 'store-1',
      round,
      live: blankPng({width: 100, height: 50}),
      diff: new Uint8Array(),
      ids: {tree: ids, revoted: {}},
    })
    expect(await store.mapping('store-1')).toEqual(mapping)
    expect((await store.ids({id: 'store-1', round: 1}))?.root.id).toBe('abc')
    expect((await store.rounds('store-1')).map((entry) => entry.round)).toEqual([1])
    expect(await store.round({id: 'store-1', round: 1})).toEqual(round)
    expect(await store.image({id: 'store-1', round: 1, kind: 'live'})).not.toBeNull()
    expect(await store.image({id: 'store-1', round: 1, kind: 'diff'})).toBeNull()
    expect((await store.current('session-b'))?.id).toBe('store-1')
    await store.clear('store-1')
    expect(await store.rounds('store-1')).toEqual([])
  })
})

describe('voter', () => {
  it('votes the element whose box is the node box', async () => {
    const card = {x: 20, y: 20, w: 200, h: 100}
    const design: Design = {
      id: 'voter-1',
      source: {kind: 'image', ref: 'voter.png'},
      viewport: {width: 400, height: 200},
      scale: 1,
      root: boxNode({id: 'root', box: {x: 0, y: 0, w: 400, h: 200}, children: [boxNode({id: 'card', box: card})]}),
    }
    const raster = createRaster(blankPng({width: 400, height: 200}))
    const measured: Measured = {
      live: liveBox({
        path: '',
        key: 'page',
        box: {x: 0, y: 0, w: 400, h: 200},
        children: [liveBox({path: '/1', key: 'card-key', box: card})],
      }),
      raster,
      route: '/',
      width: 400,
      path: 'region',
      sources: ['dom'],
      overflowX: false,
      queries: [],
      sheets: '',
      framework: 'react',
      masks: [],
    }
    const paired = await createVotePairer()({
      design,
      measured,
      target: raster,
      ids: NO_IDS,
      pins: [],
      budget: PAIR_BUDGET_MS,
    })
    const voted = [...walk(paired.root)].find(({node}) => node.node.id === 'card')?.node.live?.key
    expect(voted).toBe('card-key')
  })
})

describe('design_get', () => {
  it('a Figma frame of three same-width cards in a row returns them tagged to wrap, with the rules', async () => {
    const got = await cardsTarget()
    expect([got.root, got.count, got.viewport]).toEqual(['1:2', 4, {width: 1200, height: 400}])
    const root = got.nodes.find((node) => node.id === '1:2')
    expect(root?.reflow).toEqual({kind: 'wrap', minChildWidth: 269})
    expect(got.nodes.filter((node) => node.within === '1:2').map((node) => node.id)).toEqual(['1:10', '1:11', '1:12'])
    expect(got.rules.some((rule) => rule.includes('data-figma'))).toBe(false)
    expect(got.rules.some((rule) => rule.startsWith('reflow on a node'))).toBe(true)
    const again = await call('design_get', {figma: FIGMA_LINK})
    expect(again.target).toBe(got.target)
  })

  it('an image design returns the OCR tree with no reflow tag and no reflow rule', async () => {
    await goto('target')
    const got = await call('design_get', {image: target('u1-1280')})
    expect(got.count).toBeGreaterThan(1)
    expect(got.nodes.filter((node) => node.reflow !== undefined)).toEqual([])
    expect(got.rules.some((rule) => rule.startsWith('reflow on a node'))).toBe(false)
  })
})

describe('design_check', () => {
  it('measures the page into a round with rows, coverage and reflow at the widths the design names, and an unchanged page is the same round', async () => {
    await goto('target')
    await cardsTarget()
    const first = roundOf(await call('design_check', {}))
    expect(first.coverage.nodes).toBeGreaterThan(0)
    expect(first.reflow.widths.map((entry) => entry.width)).toContain(1200)
    expect(first.reflow.widths.every((entry) => entry.from.length > 0)).toBe(true)
    expect(first.reflow.results[0]?.tags.map((tag) => tag.node)).toEqual(['1:2'])
    const second = roundOf(await call('design_check', {nodes: ['1:10']}))
    expect(second.round).toBe(first.round)
    expect(second.rows.every((row) => row.node === '1:10')).toBe(true)
    const listed = await xrayRpc.xray.rounds({id: (await cardsTarget()).target})
    expect(listed.rounds.map((round: Round) => round.round)).toContain(second.round)
  })
})

describe('design_check verdict', () => {
  it('says not yet on a page that renders none of the design, naming the missing nodes', async () => {
    await goto('target')
    await cardsTarget()
    const checked = roundOf(await call('design_check', {}))
    expect(checked.verdict).not.toBe('done')
    expect(checked.reasons.some((reason) => reason.includes('not rendered'))).toBe(true)
  })
})

describe('design_status', () => {
  it('returns the verdict, counts and rows of the last check without measuring again', async () => {
    await goto('target')
    await cardsTarget()
    const checked = roundOf(await call('design_check', {}))
    const status = await call('design_status', {})
    expect(status.round).toBe(checked.round)
    expect(status.verdict).toBe(checked.verdict)
    expect(status.counts).toEqual(checked.counts)
    expect(status.rows).toEqual(checked.rows)
  })
})
