/* oxlint-disable playwright/no-raw-locators -- the cases read the tab directly */
import {execFile} from 'node:child_process'
import {createHash} from 'node:crypto'
import {existsSync} from 'node:fs'
import {mkdir, mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {basename, join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {setImmediate as nextTurn} from 'node:timers/promises'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'
import {differenceCiede2000} from 'culori'
import {expect as expectLocator} from 'playwright/test'
import {PNG} from 'pngjs'
import {createStorage} from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {
  catalogSources,
  closeHomeDb,
  componentScans,
  extensionTable,
  homeCatalog,
  openDb,
  openHomeDb,
  sourceCatalog,
} from '@conciv/db'
import {makeExtRpcClient} from '@conciv/extension'
import {extensionDb} from '@conciv/extension/db'
import type {} from '@conciv/extension-design/client'
import {design, type XrayRouter} from '@conciv/extension-design/server'
import {
  type Box,
  type Design,
  type DesignNode,
  type LiveComponent,
  type Measured,
  type Raster,
  type Round,
} from '@conciv/extension-design/defs'
import {DESIGN_TOOLS} from '@conciv/extension-design/design-tools'
import {designConfig} from '../../extensions/design/src/shared/tolerances.js'
import {walk} from '../../extensions/design/src/shared/tree.js'
import {createStore} from '../../extensions/design/src/server/store.js'
import {designTables} from '../../extensions/design/src/server/tables.js'
import {migrations} from '../../extensions/design/src/server/migrations.gen.js'
import {runsMigrations} from '../../extensions/design/src/server/runs-migrations.gen.js'
import {openStore} from '../../extensions/design/src/server/runs/open-store.js'
import {storeSources} from '../../extensions/design/src/server/runs/sources.js'
import {storeTables} from '../../extensions/design/src/server/runs/store-tables.js'
import {storeArtifacts} from '../../extensions/design/src/server/runs/import/store-artifacts.js'
import {createRaster} from '../../extensions/design/src/server/raster.js'
import {createImageAdapter} from '../../extensions/design/src/server/sources/image.js'
import {createVotePairer} from '../../extensions/design/src/server/pairers/vote.js'
import {createViteOxcSource} from '../../extensions/design/src/server/catalog/vite-oxc-source.js'
import {createCatalog} from '../../extensions/design/src/server/catalog/catalog.js'
import {backfillRelation} from '../../extensions/design/src/server/catalog/backfill-relation.js'
import {createCssTokenSource} from '../../extensions/design/src/server/catalog/token-source.js'
import {createTokenMap} from '../../extensions/design/src/server/catalog/token-map.js'
import type {Component, Scan} from '../../extensions/design/src/shared/catalog-defs.js'
import {lane} from '../src/trial/lane.js'
import {bootDesignHost} from './fixtures/design/boot.js'
import {cardsDesign} from './fixtures/design/cards.js'
import {figmaFrame} from './fixtures/design/figma-frame.js'
import {bareButton} from './fixtures/design/bare-button.js'
import {sideMargin} from './fixtures/design/side-margin.js'
import {wrapText} from './fixtures/design/wrap-text.js'
import {tallPage} from './fixtures/design/tall-page.js'
import {stackRow} from './fixtures/design/stack-row.js'
import {picture} from './fixtures/design/picture.js'

const HOST_ROOT = fileURLToPath(new URL('fixtures/design/host/', import.meta.url))
const DESIGN_PACKAGE = fileURLToPath(new URL('../../extensions/design/package.json', import.meta.url))
const CARDS_FILE = fileURLToPath(new URL('fixtures/design/host/src/Cards.tsx', import.meta.url))
const STYLES_FILE = fileURLToPath(new URL('fixtures/design/host/src/styles.css', import.meta.url))
const APP_FILE = fileURLToPath(new URL('fixtures/design/host/src/App.tsx', import.meta.url))
const PAGE_DRIVER_TIMEOUT_MS = 30_000
const THROW_BEFORE = 'const gap ='
const THROWING_LINE = "  if (titles.length > 0) throw new TypeError('the cards fixture throws while rendering')"
const HOT_UPDATED = '[vite] hot updated'
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

const CliEnvelopeSchema = z.object({ok: z.literal(true), data: z.object({text: z.string()})})

const [getDef, checkDef] = DESIGN_TOOLS

type ToolOutput<Tool extends {outputSchema?: z.ZodType}> = z.output<NonNullable<Tool['outputSchema']>>
type OneFrame<Reply> = Exclude<Reply, {variants: unknown}>
type Got = OneFrame<ToolOutput<typeof getDef>>
type Checked = OneFrame<ToolOutput<typeof checkDef>>
type Kit = Awaited<ReturnType<typeof bootDesignHost>>

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

function roundOf(checked: Checked): Exclude<Checked, {unsettled: true} | {compile: unknown} | {thrown: unknown}> {
  if ('unsettled' in checked || 'compile' in checked || 'thrown' in checked)
    throw new Error(`no round: ${JSON.stringify(checked)}`)
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
    const homeDir = await mkdtemp(join(tmpdir(), 'conciv-design-store-home-'))
    const home = openHomeDb(homeDir)
    const catalog = createCatalog({home, db, cwd: HOST_ROOT, sources: []})
    const store = createStore({db, state: createStorage({driver: memoryDriver()}), run: async () => null, catalog})
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
      counts: {much: 0, noticeably: 0, slightly: 0, pins: 0, other: 0, reflow: 0, paint: 0, rows: 0, drift: 0},
      pixels: {share: 0},
      progress: null,
      at: 1,
      tree: '',
      verdict: null,
      unsettled: null,
      broken: null,
      brokenBy: null,
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
    closeHomeDb(home)
    await rm(homeDir, {recursive: true, force: true})
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
      scheme: 'light',
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

  it('names each missing node with its Figma name and the node it belongs under', async () => {
    await goto('target')
    await cardsTarget()
    const checked = roundOf(await call('design_check', {}))
    expect(checked.reasons.some((reason) => reason.includes('1:10 Card under 1:2 Cards'))).toBe(true)
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

describe('design_check capture', () => {
  it('leaves the conciv effects surface out of the live capture of a round', async () => {
    await goto('effects-cover')
    const got = await cardsTarget()
    const checked = roundOf(await call('design_check', {}))
    const reply = await fetch(`${kit.apiBase}/api/ext/design/files/live/${got.target}/${checked.round}`)
    expect(reply.status).toBe(200)
    const png = PNG.sync.read(Buffer.from(await reply.arrayBuffer()))
    const offset = (Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4
    const [red = 0, green = 0, blue = 0] = png.data.subarray(offset, offset + 3)
    expect(red > 200 && green < 60 && blue < 60).toBe(false)
  })
})

describe('catalog walk', () => {
  const source = createViteOxcSource()
  const scans = new Map<string, Promise<Scan>>()

  function scanOf(cwd: string): Promise<Scan> {
    const known = scans.get(cwd)
    if (known !== undefined) return known
    const started = source.scan({cwd})
    scans.set(cwd, started)
    return started
  }

  async function named(name: string, cwd = HOST_ROOT): Promise<Component> {
    const found = (await scanOf(cwd)).components.find((component) => component.names.includes(name))
    if (found === undefined) throw new Error(`the walk found no component named ${name}`)
    return found
  }

  it('walks from the fixture vite config', async () => {
    const page = await named('XrayPage')
    expect([page.renders, page.file.endsWith('src/XrayPage.tsx'), page.specifier, page.pkg]).toEqual([
      true,
      true,
      './src/XrayPage.tsx',
      null,
    ])
  })

  it('resolves the workspace kit to source', async () => {
    const segments = await named('SegmentGroup')
    expect([segments.pkg, segments.file.endsWith('segment-group.tsx'), segments.renders, segments.specifier]).toEqual([
      '@conciv/ui-kit-system',
      true,
      true,
      '@conciv/ui-kit-system',
    ])
    expect(segments.sentence).not.toBeNull()
    expect(segments.story?.endsWith('segment-group.stories.tsx')).toBe(true)
  })

  it('counts each edge once in a cycle', async () => {
    const cycle = new Set(['cycle-a.ts', 'cycle-b.ts'])
    const between = (await scanOf(HOST_ROOT)).edges.filter(
      (edge) => cycle.has(basename(edge.from)) && cycle.has(basename(edge.to)),
    )
    expect(between.map((edge) => `${basename(edge.from)} > ${basename(edge.to)}`).toSorted()).toEqual([
      'cycle-a.ts > cycle-b.ts',
      'cycle-b.ts > cycle-a.ts',
    ])
  })

  it('reports an unreadable config and continues', async () => {
    const root = await mkdtemp(join(tmpdir(), 'conciv-catalog-'))
    await mkdir(join(root, 'broken'))
    await mkdir(join(root, 'good', 'src'), {recursive: true})
    await writeFile(join(root, 'broken', 'vite.config.ts'), "import 'not-installed-pkg'\nexport default {}\n")
    await writeFile(join(root, 'good', 'vite.config.ts'), 'export default {}\n')
    await writeFile(join(root, 'good', 'index.html'), '<script type="module" src="/src/main.tsx"></script>\n')
    await writeFile(join(root, 'good', 'src', 'main.tsx'), 'export function Hello() {\n  return <p>hello</p>\n}\n')
    try {
      const scan = await scanOf(root)
      expect(scan.unreadable).toEqual(['broken/vite.config.ts'])
      expect(scan.components.map((component) => component.names)).toEqual([['Hello']])
    } finally {
      await rm(root, {recursive: true, force: true})
    }
  })

  it('lists aliases once', async () => {
    const stats = (await scanOf(HOST_ROOT)).components.filter((component) =>
      component.names.some((name) => name === 'Stat' || name === 'StatCard'),
    )
    expect(stats.map((component) => component.names)).toEqual([['Stat', 'StatCard']])
    expect(stats[0]?.props).toEqual([
      {name: 'label', type: 'string', required: true, values: []},
      {name: 'tone', type: "'up' | 'down'", required: false, values: ['up', 'down']},
    ])
    expect(stats[0]?.usage).toBe('<Stat label="Nodes" />')
  })

  it('props say see file when the type is out of reach', async () => {
    expect((await named('Far')).props).toBe('see file')
  })

  it('lists no component reached through two bare imports', async () => {
    const {components} = await scanOf(HOST_ROOT)
    expect(components.filter((component) => component.specifier.startsWith('@ark-ui'))).toEqual([])
    expect((await named('Slider')).pkg).toBe('@conciv/ui-kit-system')
  })

  it('takes a README line only when it starts with the component name', async () => {
    const sentences = [(await named('Tooltip')).sentence ?? '', (await named('SegmentGroup')).sentence ?? '']
    expect(
      sentences.map((sentence) => [sentence.startsWith('Source of'), sentence.startsWith('Ark wrappers')]),
    ).toEqual([
      [false, false],
      [false, false],
    ])
  })

  it('gives a README sentence as one sentence without backticks or parentheses', async () => {
    const sentences = await Promise.all(
      ['Tooltip', 'TruncatedText', 'Button'].map(async (name) => (await named(name)).sentence ?? ''),
    )
    expect(
      sentences.map((sentence) => [
        sentence !== '',
        sentence.includes('`') || sentence.includes('(') || sentence.includes(')'),
        sentence.includes('. '),
      ]),
    ).toEqual([
      [true, false, false],
      [true, false, false],
      [true, false, false],
    ])
  })

  it('cuts a usage at the first closing tag inside its root element', async () => {
    expect([(await named('Swap')).usage, (await named('Stat')).usage]).toEqual([
      '<Swap.Root swap={on()}> <Swap.Indicator type="on">on</Swap.Indicator>',
      '<Stat label="Nodes" />',
    ])
  })

  it('writes a file outside the project absolute and a project file relative, as the compiler does', async () => {
    expect([(await named('SegmentGroup')).file.startsWith('/'), (await named('Stat')).file]).toEqual([
      true,
      'src/Stat.tsx',
    ])
  })

  it('lists a component imported through an alias inside the project as the project own', async () => {
    const thing = await named('Thing')
    expect([thing.file, thing.pkg, thing.specifier]).toEqual(['src/gui/Thing.tsx', null, './src/gui/Thing.tsx'])
  })

  it('gives every usage on one line without conciv stamps', async () => {
    const usages = (await scanOf(HOST_ROOT)).components.flatMap((component) =>
      component.usage === null ? [] : [component.usage],
    )
    expect(usages.length).toBeGreaterThan(0)
    expect(usages.filter((usage) => usage.includes('data-conciv-') || usage.includes('\n'))).toEqual([])
  })

  it('keeps the line range of the defining export, relative to the project root', async () => {
    const page = await named('XrayPage')
    expect([page.file, page.lines]).toEqual(['src/XrayPage.tsx', {start: 5, end: 16}])
  })
})

describe('catalog store', () => {
  const opened: Array<() => Promise<void>> = []

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((close) => close()))
  })

  async function openCatalog() {
    const homeDir = await mkdtemp(join(tmpdir(), 'conciv-catalog-home-'))
    const home = openHomeDb(homeDir)
    const orm = openDb({
      stateRoot: await mkdtemp(join(tmpdir(), 'conciv-catalog-state-')),
      extensions: [{name: 'design', migrations}],
    })
    const db = {
      orm,
      tables: designTables(extensionTable('design')),
      sources: () => [],
      read: async () => [],
      write: async () => [],
    }
    opened.push(async () => {
      closeHomeDb(home)
      orm.$client.close()
      await rm(homeDir, {recursive: true, force: true})
    })
    const catalog = createCatalog({home, db, cwd: HOST_ROOT, sources: [createViteOxcSource()]})
    return {catalog, scans: () => home.select().from(componentScans).all()}
  }

  it('rescans when the fingerprint changes', async () => {
    const {catalog, scans} = await openCatalog()
    await catalog.list({})
    const touched = join(HOST_ROOT, 'src', `catalog-touch-${process.pid}.txt`)
    await writeFile(touched, 'touched\n')
    try {
      await catalog.list({})
    } finally {
      await rm(touched, {force: true})
    }
    const rows = scans()
    expect(rows.length).toBe(2)
    expect(new Set(rows.map((row) => row.fingerprint)).size).toBe(2)
  })

  it('does not rescan when nothing changed', async () => {
    const {catalog, scans} = await openCatalog()
    await catalog.list({})
    await catalog.list({})
    expect(scans().length).toBe(1)
  })

  it('ranks prefer first, then on page, then imports', async () => {
    const {catalog} = await openCatalog()
    await catalog.flag('Kbd', 'prefer')
    const ranked = await catalog.list({live: ['src/XrayPage.tsx:8:7']})
    expect(ranked.slice(0, 2).map((component) => [component.names[0], component.flag, component.onPage])).toEqual([
      ['Kbd', 'prefer', 0],
      ['SegmentGroup', null, 1],
    ])
    const rest = ranked.slice(2).map((component) => component.imports)
    expect(rest).toEqual(rest.toSorted((left, right) => right - left))
    expect(ranked.map((component) => component.rank)).toEqual(ranked.map((_, index) => index + 1))
  })

  it('do-not-use hides', async () => {
    const {catalog} = await openCatalog()
    await catalog.flag('Slider', 'do-not-use')
    const listed = await catalog.list({})
    expect(listed.some((component) => component.names.includes('Slider'))).toBe(false)
    expect((await catalog.show('Slider')).names).toContain('Slider')
    await catalog.flag('Slider', 'clear')
    expect((await catalog.list({})).some((component) => component.names.includes('Slider'))).toBe(true)
  })

  it('tiers', async () => {
    const {catalog} = await openCatalog()
    const listed = await catalog.list({})
    const tierOf = (name: string) => listed.find((component) => component.names.includes(name))?.tier
    expect([tierOf('SegmentGroup'), tierOf('XrayPage')]).toEqual(['kit', 'app'])
  })

  it('tiers a folder whose name only contains ui as app', async () => {
    const {catalog} = await openCatalog()
    expect((await catalog.list({})).find((component) => component.names.includes('Thing'))?.tier).toBe('app')
  })

  it('names the component rendered at a source line and counts it on the page', async () => {
    const {catalog} = await openCatalog()
    const stat = 'src/XrayPage.tsx:11:7'
    expect((await catalog.componentOf(stat))?.names).toEqual(['Stat', 'StatCard'])
    const ranked = await catalog.list({live: [stat]})
    expect(ranked.find((component) => component.names.includes('Stat'))?.onPage).toBe(1)
    expect(ranked.find((component) => component.names.includes('XrayPage'))?.onPage).toBe(0)
  })

  it('names the component of a source line on a fresh home without a list first', async () => {
    const {catalog} = await openCatalog()
    expect((await catalog.componentOf('src/Stat.tsx:4:3'))?.names).toEqual(['Stat', 'StatCard'])
  })

  it('names the component whose export holds a source line', async () => {
    const {catalog} = await openCatalog()
    await catalog.scanIfStale()
    expect((await catalog.componentOf('src/XrayPage.tsx:7:5'))?.names).toEqual(['XrayPage'])
    expect(await catalog.componentOf('src/XrayPage.tsx:2:1')).toBeNull()
    expect(await catalog.componentOf('index.html:3:1')).toBeNull()
  })
})

describe('design_components', () => {
  function firstBlock(text: string): string {
    return text.split('\n\n')[0] ?? ''
  }

  it('lists the kit tier first, each row with its import line and rank facts', async () => {
    const listed = await call('design_components', {})
    const first = firstBlock(listed.text)
    expect(first).toContain('import {')
    expect(first).toContain('\nkit · ')
    expect(first).toContain(' imports')
    expect(listed.components?.length).toBeGreaterThan(0)
  })

  it('shows one component with every prop and its file', async () => {
    const shown = await call('design_components', {show: 'PinInput'})
    const props = shown.component?.props
    expect(Array.isArray(props) && props.length > 0).toBe(true)
    expect(shown.text).toContain(shown.component?.file)
  })

  it('leaves a do-not-use component out of the list', async () => {
    const slider = "import {Slider} from '@conciv/ui-kit-system'"
    expect((await call('design_components', {})).text).toContain(slider)
    await call('design_components', {doNotUse: 'Slider'})
    try {
      expect((await call('design_components', {})).text).not.toContain(slider)
    } finally {
      await call('design_components', {clear: 'Slider'})
    }
  })

  it('the CLI prints the same first row', async () => {
    const listed = await call('design_components', {})
    const printed = await promisify(execFile)(
      process.execPath,
      [fileURLToPath(import.meta.resolve('@conciv/cli/bin')), 'tools', 'design', 'components'],
      {
        cwd: kit.stateRoot,
        env: {
          ...process.env,
          CONCIV_PORT: new URL(kit.apiBase).port,
          CONCIV_TOKEN: kit.token,
          CONCIV_SESSION_ID: kit.session,
        },
      },
    )
    const envelope = CliEnvelopeSchema.parse(JSON.parse(printed.stdout))
    expect(firstBlock(envelope.data.text)).toBe(firstBlock(listed.text))
  })
})

describe('design_get components section', () => {
  const SEGMENT_LINK = 'https://www.figma.com/design/ItFixtureKey/x?node-id=5-1'

  const SEGMENT_DOCUMENT = {
    name: 'it fixture',
    lastModified: '2026-11-09T00:00:00Z',
    version: '1',
    nodes: {
      '5:1': {
        document: figmaFrame({
          id: '5:1',
          name: 'Toolbar',
          box: {x: 0, y: 0, w: 600, h: 120},
          layoutMode: 'HORIZONTAL',
          children: [
            figmaFrame({id: '5:2', name: 'Segment control', type: 'INSTANCE', box: {x: 24, y: 40, w: 240, h: 40}}),
          ],
        }),
      },
    },
  }

  async function segmentTarget(on: Kit) {
    const image = join(on.targetsDir, 'segment-figma.png')
    await writeFile(image, blankPng({width: 600, height: 120}))
    return on.call('design_get', {figma: SEGMENT_LINK, image, document: SEGMENT_DOCUMENT})
  }

  it('lists the project components and hints the kit component a node names', async () => {
    const got = await segmentTarget(kit)
    expect(got.components?.length).toBeGreaterThan(0)
    expect(got.nodes.find((node) => node.name === 'Segment control')?.hint?.component).toBe('SegmentGroup')
  })

  it('carries no section and no hint when the catalog reads no sources', async () => {
    const bare = await bootDesignHost({config: {catalog: {sources: []}}})
    try {
      const got = await segmentTarget(bare)
      expect('components' in got).toBe(false)
      expect(got.nodes.filter((node) => node.hint !== undefined)).toEqual([])
      expect((await bare.call('design_components', {})).components).toEqual([])
    } finally {
      await bare.dispose()
    }
  })
})

describe('catalog hints on design_get', () => {
  const HINTED_LINK = 'https://www.figma.com/design/ItFixtureKey/x?node-id=9-1'
  const NAMES = ['Chip Kit 14', 'Rail button/mouse-pointer-click', 'Button', 'Chip App 9', 'Row TooltipIconButton']

  const HINTED_DOCUMENT = {
    name: 'it fixture',
    lastModified: '2026-11-10T00:00:00Z',
    version: '1',
    nodes: {
      '9:1': {
        document: figmaFrame({
          id: '9:1',
          name: 'Hinted',
          box: {x: 0, y: 0, w: 600, h: 400},
          children: NAMES.map((name, index) =>
            figmaFrame({id: `9:${index + 2}`, name, box: {x: 24, y: 24 + index * 60, w: 240, h: 40}}),
          ),
        }),
      },
    },
  }

  async function hintedTarget() {
    const image = join(kit.targetsDir, 'hinted-figma.png')
    await writeFile(image, blankPng({width: 600, height: 400}))
    return call('design_get', {figma: HINTED_LINK, image, document: HINTED_DOCUMENT})
  }

  function firstOfTier(input: {text: string; tier: string}): string {
    const block = input.text.split('\n\n').find((each) => each.split('\n').at(-1)?.startsWith(`${input.tier} · `))
    return block?.split('\n')[0] ?? ''
  }

  it('hints the component a node names as a whole word, and none where two catalog names are named', async () => {
    const got = await hintedTarget()
    expect(NAMES.map((name) => got.nodes.find((node) => node.name === name)?.hint?.component ?? null)).toEqual([
      null,
      'Button',
      'Button',
      null,
      'TooltipIconButton',
    ])
  })

  it('orders each tier by the components the design hints at, and keeps the order without a design', async () => {
    const got = await hintedTarget()
    const text = got.components ?? ''
    expect([firstOfTier({text, tier: 'kit'}), firstOfTier({text, tier: 'app'})]).toEqual([
      "import {Button} from '@conciv/ui-kit-system'",
      "import {Toolbar} from './src/Toolbar.tsx'",
    ])
    const listed = await call('design_components', {})
    expect(firstOfTier({text: listed.text, tier: 'kit'})).not.toBe("import {Button} from '@conciv/ui-kit-system'")
  })

  it('lists the hinted nodes in hint_vs_drawn once the run is imported, a round or none', async () => {
    await kit.rpc.extensions.run({name: 'design:run', args: ['start', 'it-hint-model', 'it-head'], options: {}})
    const got = await hintedTarget()
    const {runId} = z
      .object({runId: z.number()})
      .parse(await kit.rpc.extensions.run({name: 'design:run-import', args: [kit.stateRoot], options: {}}))
    const rows = z.array(z.object({node: z.string(), hint: z.string()})).parse(
      await kit.rpc.db.read({
        from: 'design_hint_vs_drawn',
        where: `run == ${runId} && target == "${got.target}"`,
        select: ['node', 'hint'],
      }),
    )
    expect(new Set(rows.map((row) => row.hint))).toEqual(new Set(['Button', 'TooltipIconButton']))
    await expect(
      kit.rpc.db.write({into: 'design_stored_notes', values: {target: 't', run: 1, text: 'x'}}),
    ).rejects.toThrow('design_stored_notes is read-only')
  })

  it('stores the reply design_get returned whole, beside its input', async () => {
    const got = await hintedTarget()
    const StoredSchema = z.object({
      reply: z.object({
        components: z.string().optional(),
        nodes: z.array(z.object({id: z.string(), hint: z.unknown().optional()})),
      }),
      input: z.unknown(),
    })
    const [stored] = z.array(StoredSchema).parse(
      await kit.rpc.registry.call({
        name: 'design_query',
        input: {
          from: 'tool_calls',
          where: 'tool == "design_get"',
          select: ['reply', 'input'],
          order: [{field: 'seq', dir: 'desc'}],
          limit: 1,
        },
      }),
    )
    const hinted = got.nodes.find((node) => node.hint !== undefined)
    expect(stored?.reply.components).toBe(got.components)
    expect(stored?.reply.nodes.find((node) => node.id === hinted?.id)?.hint).toEqual(hinted?.hint)
    expect(stored?.input).toMatchObject({figma: HINTED_LINK})
  })
})

describe('node components', () => {
  const RowsSchema = z.array(z.record(z.string(), z.unknown()))

  async function query(input: {from: string; where: string}) {
    return RowsSchema.parse(await kit.rpc.registry.call({name: 'design_query', input}))
  }

  it('records which component rendered each node of a round, and the component names its nodes', async () => {
    await goto('target')
    const got = await cardsTarget()
    const checked = roundOf(await call('design_check', {}))
    const related = await query({
      from: 'node_components',
      where: `target == "${got.target}" && round == ${checked.round}`,
    })
    const listed = (await call('design_components', {})).components ?? []
    const names = new Map(listed.map((component) => [component.id, component.names[0]]))
    expect([...new Set(related.map((row) => names.get(String(row.component_id))))]).toContain('Cards')
    expect(related.every((row) => names.has(String(row.component_id)))).toBe(true)
    expect((await call('design_components', {show: 'Cards'})).text).toContain('renders ')
  })

  it('backfills stored rounds once, skipping a source no component holds', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'conciv-relation-home-'))
    const home = openHomeDb(homeDir)
    const orm = openDb({
      stateRoot: await mkdtemp(join(tmpdir(), 'conciv-relation-state-')),
      extensions: [{name: 'design', migrations}],
    })
    const db = {
      orm,
      tables: designTables(extensionTable('design')),
      sources: () => [],
      read: async () => [],
      write: async () => [],
    }
    try {
      const catalog = createCatalog({home, db, cwd: HOST_ROOT, sources: [createViteOxcSource()]})
      const stored = {target_id: 'stored-1', confidence: 1, margin: 1, round: 2, at: 1}
      await orm.insert(db.tables.fom).values([
        {...stored, id: 'stat', node: '7:1', source: 'src/XrayPage.tsx:11:7'},
        {...stored, id: 'markup', node: '7:2', source: 'index.html:3:1'},
      ])
      expect(await backfillRelation({db, catalog})).toBe(1)
      const rows = await orm.select().from(db.tables.node_components)
      const stat = await catalog.componentOf('src/XrayPage.tsx:11:7')
      expect(rows.map((row) => [row.target_id, row.round, row.node, row.component_id])).toEqual([
        ['stored-1', 2, '7:1', stat?.id],
      ])
      expect(await backfillRelation({db, catalog})).toBe(0)
    } finally {
      closeHomeDb(home)
      orm.$client.close()
      await rm(homeDir, {recursive: true, force: true})
    }
  })
})

describe('token drift', () => {
  const DRIFT_LINK = 'https://www.figma.com/design/ItFixtureKey/x?node-id=8-1'
  const BLUE = {r: 0x42 / 255, g: 0x6b / 255, b: 0xf2 / 255, a: 1}
  const RowsSchema = z.array(z.record(z.string(), z.unknown()))

  function boundBox(input: {id: string; name: string; y: number}): unknown {
    return {
      id: input.id,
      name: input.name,
      type: 'FRAME',
      absoluteBoundingBox: {x: 40, y: input.y, width: 200, height: 48},
      fills: [{type: 'SOLID', color: BLUE}],
      cornerRadius: 16,
      boundVariables: {topLeftRadius: {type: 'VARIABLE_ALIAS', id: 'radius/xl'}},
      children: [],
    }
  }

  const DRIFT_DOCUMENT = {
    name: 'it fixture',
    lastModified: '2026-11-10T00:00:00Z',
    version: '1',
    nodes: {
      '8:1': {
        document: figmaFrame({
          id: '8:1',
          name: 'Drift',
          box: {x: 0, y: 0, w: 1280, h: 720},
          children: [boundBox({id: '8:2', name: 'Chip', y: 40}), boundBox({id: '8:3', name: 'Loose', y: 160})],
        }),
      },
    },
  }

  async function driftRound(on: Kit) {
    await on.goto('drift')
    const image = join(on.targetsDir, 'drift-figma.png')
    await writeFile(image, blankPng({width: 1280, height: 720}))
    const got = await on.call('design_get', {figma: DRIFT_LINK, image, document: DRIFT_DOCUMENT})
    return {got, checked: roundOf(await on.call('design_check', {}))}
  }

  async function paired(input: {on: Kit; target: string}) {
    const read = async (query: {from: string; select: string[]}) =>
      RowsSchema.parse(
        await input.on.rpc.registry.call({
          name: 'design_query',
          input: {...query, where: `target == "${input.target}"`, order: [{field: 'seq', dir: 'asc'}]},
        }),
      )
    return {
      fom: await read({from: 'fom', select: ['round', 'id', 'node', 'source', 'instance', 'confidence', 'margin']}),
      votes: await read({
        from: 'votes',
        select: ['round', 'node', 'candidate', 'path', 'dom', 'src', 'cssom', 'total', 'won'],
      }),
    }
  }

  function painted(rows: ReturnType<typeof roundOf>['rows']): string[][] {
    return rows.filter((row) => row.magnitude === 'paint').map((row) => [row.node, row.kind])
  }

  it('a kit token mismatch inside a known component is one drift row and replaces its paint row', async () => {
    const {checked} = await driftRound(kit)
    const drift = checked.rows.filter((row) => row.magnitude === 'token-drift')
    expect(drift.map((row) => [row.node, row.component, row.kitToken, row.designToken, row.text])).toEqual([
      [
        '8:2',
        'Chip',
        '--chat-radius-sm or --chat-radius-md or --chat-radius-surface-sm',
        'radius/xl',
        'Chip uses --chat-radius-sm or --chat-radius-md or --chat-radius-surface-sm (4px); the design wants radius/xl (16px)',
      ],
    ])
    expect(checked.counts.drift).toBe(1)
    expect((await call('design_status', {})).counts?.drift).toBe(1)
    expect(painted(checked.rows)).toEqual([['8:3', 'radius']])
    expect((await call('design_status', {})).rows).toEqual(checked.rows)
  })

  it('the x-ray layers name the component that renders a node', async () => {
    const {got, checked} = await driftRound(kit)
    const layers = await xrayRpc.xray.layers({id: got.target, round: checked.round})
    const placed = layers === null ? [] : [...walk(layers.root)].flatMap(({node}) => node.fom)
    expect(placed.find((entry) => entry.nodeId === '8:2')?.component).toMatchObject({
      name: 'Chip',
      specifier: './src/Chip.tsx',
      tier: 'app',
      imports: 1,
    })
  })

  it('reads a light-dark token as one token per scheme and matches page values by kind', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'conciv-tokens-home-'))
    const home = openHomeDb(homeDir)
    const orm = openDb({
      stateRoot: await mkdtemp(join(tmpdir(), 'conciv-tokens-state-')),
      extensions: [{name: 'design', migrations}],
    })
    const db = {
      orm,
      tables: designTables(extensionTable('design')),
      sources: () => [],
      read: async () => [],
      write: async () => [],
    }
    try {
      const catalog = createCatalog({home, db, cwd: HOST_ROOT, sources: []})
      const files = [fileURLToPath(new URL('../../ui-kit-system/src/tokens.css', import.meta.url))]
      const map = createTokenMap({tokens: await createCssTokenSource({files, catalog}).read({cwd: HOST_ROOT})})
      expect([
        map.kitTokensFor({kind: 'fill', value: 'rgb(23, 22, 26)', scheme: 'dark'}).map((token) => token.name),
        map.kitTokensFor({kind: 'fill', value: 'rgb(23, 22, 26)', scheme: 'light'}).map((token) => token.name),
        map.kitTokensFor({kind: 'radius', value: '11px', scheme: 'light'}).map((token) => token.name),
        map.kitTokensFor({kind: 'font family', value: 'source sans 3', scheme: 'dark'}).map((token) => token.name),
      ]).toEqual([['--chat-panel', '--chat-panel-sunk'], [], ['--chat-radius-lg'], ['--chat-font']])
    } finally {
      closeHomeDb(home)
      orm.$client.close()
      await rm(homeDir, {recursive: true, force: true})
    }
  })

  it('catalog tokens off gives the paint rows back and pairs exactly as with tokens on', async () => {
    const bare = await bootDesignHost({config: {catalog: {tokens: []}}})
    try {
      const off = await driftRound(bare)
      expect(off.checked.rows.filter((row) => row.magnitude === 'token-drift')).toEqual([])
      expect(off.checked.rows.filter((row) => row.magnitude === 'paint').map((row) => row.text)).toEqual([
        'token radius/xl wrong on 2 nodes: [8:2, 8:3] (radius)',
      ])
      const on = await driftRound(kit)
      expect(on.checked.rows.filter((row) => row.magnitude === 'token-drift').map((row) => row.node)).toEqual(['8:2'])
      expect(await paired({on: bare, target: off.got.target})).toEqual(await paired({on: kit, target: on.got.target}))
    } finally {
      await bare.dispose()
    }
  })
})

describe('the x-ray parts', () => {
  const DRIFT_LINK = 'https://www.figma.com/design/ItFixtureKey/x?node-id=8-1'
  const BLUE = {r: 0x42 / 255, g: 0x6b / 255, b: 0xf2 / 255, a: 1}
  const CHIP_IMPORT = "import {Chip} from './src/Chip.tsx'"
  const PartSchema = z.object({
    id: z.string(),
    name: z.string(),
    tier: z.string(),
    onPage: z.number(),
    flag: z.string().nullable(),
    importLine: z.string(),
    renders: z.array(z.object({node: z.string()})),
  })
  const PartsSchema = z.object({components: z.array(PartSchema), hidden: z.array(PartSchema)})

  function boundBox(input: {id: string; name: string; y: number}): unknown {
    return {
      id: input.id,
      name: input.name,
      type: 'FRAME',
      absoluteBoundingBox: {x: 40, y: input.y, width: 200, height: 48},
      fills: [{type: 'SOLID', color: BLUE}],
      cornerRadius: 16,
      boundVariables: {topLeftRadius: {type: 'VARIABLE_ALIAS', id: 'radius/xl'}},
      children: [],
    }
  }

  const DRIFT_DOCUMENT = {
    name: 'it fixture',
    lastModified: '2026-11-10T00:00:00Z',
    version: '1',
    nodes: {
      '8:1': {
        document: figmaFrame({
          id: '8:1',
          name: 'Drift',
          box: {x: 0, y: 0, w: 1280, h: 720},
          children: [boundBox({id: '8:2', name: 'Chip', y: 40}), boundBox({id: '8:3', name: 'Loose', y: 160})],
        }),
      },
    },
  }

  async function driftParts() {
    await goto('drift')
    const image = join(kit.targetsDir, 'drift-figma.png')
    await writeFile(image, blankPng({width: 1280, height: 720}))
    const got = await call('design_get', {figma: DRIFT_LINK, image, document: DRIFT_DOCUMENT})
    const checked = roundOf(await call('design_check', {}))
    const list = async () => PartsSchema.parse(await xrayRpc.xray.components({id: got.target, round: checked.round}))
    const section = async () => {
      const again = await call('design_get', {figma: DRIFT_LINK, image, document: DRIFT_DOCUMENT})
      return 'components' in again ? (again.components ?? '') : ''
    }
    return {list, section}
  }

  it('lists the drift page Chip with its import line, the page count and the design node it renders', async () => {
    const {list} = await driftParts()
    const chip = (await list()).components.find((entry) => entry.name === 'Chip')
    expect([chip?.importLine, chip?.tier, chip?.onPage, chip?.renders.map((render) => render.node)]).toEqual([
      CHIP_IMPORT,
      'app',
      1,
      ['8:2'],
    ])
  })

  it('prefer moves a part first, do-not-use takes it out of the list and the design_get section', async () => {
    const {list, section} = await driftParts()
    const id = (await list()).components.find((entry) => entry.name === 'Chip')?.id ?? ''
    try {
      await xrayRpc.xray.flag({id, flag: 'prefer'})
      const preferred = await list()
      expect([preferred.components[0]?.name, preferred.components[0]?.flag]).toEqual(['Chip', 'prefer'])
      expect(await section()).toContain(CHIP_IMPORT)
      await xrayRpc.xray.flag({id, flag: 'do-not-use'})
      const hidden = await list()
      expect([hidden.components.some((entry) => entry.id === id), hidden.hidden.map((entry) => entry.name)]).toEqual([
        false,
        ['Chip'],
      ])
      expect(await section()).not.toContain(CHIP_IMPORT)
    } finally {
      await xrayRpc.xray.flag({id, flag: 'clear'})
    }
  })
})

describe('component previews', () => {
  async function previewed(name: string) {
    const shown = await call('design_components', {show: name})
    const id = shown.component?.id ?? ''
    const tab = await kit.browser.newPage()
    const reply = await tab.goto(new URL(`/__conciv/preview/${id}`, kit.origin).href)
    return {id, shown, tab, status: reply?.status()}
  }

  it('renders a component alone at its preview route, the path design_components show returns', async () => {
    const {id, shown, tab, status} = await previewed('Chip')
    try {
      expect([status, shown.preview]).toEqual([200, `/__conciv/preview/${id}`])
      await expectLocator(tab.locator('#conciv-preview .chip')).toBeVisible()
    } finally {
      await tab.close()
    }
  })

  it('serves the preview page without the conciv widget', async () => {
    const {tab} = await previewed('Chip')
    try {
      await expectLocator(tab.locator('#conciv-preview .chip')).toBeVisible()
      expect([
        await tab.locator('meta[name="conciv-api-base"]').count(),
        await tab.locator('[data-conciv-root]').count(),
      ]).toEqual([0, 0])
    } finally {
      await tab.close()
    }
  })

  it('a component that throws shows the first line of its error and the catalog lists it', async () => {
    const {tab} = await previewed('Broken')
    try {
      await expectLocator(tab.locator('#conciv-preview')).toHaveText('error: broken on purpose')
      await expect
        .poll(async () => (await call('design_components', {show: 'Broken'})).preview)
        .toBe('error: broken on purpose')
    } finally {
      await tab.close()
    }
  })
})

describe('design_check on a page that breaks the widget or the build', () => {
  it('answers on a page whose section is named process', async () => {
    await goto('process')
    await cardsTarget()
    expect(roundOf(await call('design_check', {})).rows.length).toBeGreaterThan(0)
  })

  it('answers broken with the file and line, then measures again once the file compiles', async () => {
    await goto('target')
    await cardsTarget()
    const source = await readFile(CARDS_FILE, 'utf8')
    await writeFile(CARDS_FILE, source.replace('</h2>', ''))
    const broken = await kit.page
      .waitForSelector('vite-error-overlay', {state: 'attached', timeout: PAGE_DRIVER_TIMEOUT_MS})
      .then(() => call('design_check', {}))
      .finally(() => writeFile(CARDS_FILE, source))
    const compile = 'compile' in broken ? broken.compile : null
    expect([broken.verdict, compile?.file, typeof compile?.line]).toEqual(['broken', 'src/Cards.tsx', 'number'])
    await goto('target')
    expect(roundOf(await call('design_check', {})).verdict).not.toBe('broken')
  })

  it('answers broken with the file and line of an error the page throws while rendering, then measures again once it is fixed', async () => {
    await goto('target')
    await cardsTarget()
    const source = await readFile(CARDS_FILE, 'utf8')
    const lines = source.split('\n')
    const at = lines.findIndex((line) => line.includes(THROW_BEFORE))
    const thrown = kit.page.waitForEvent('pageerror', {timeout: PAGE_DRIVER_TIMEOUT_MS})
    await writeFile(CARDS_FILE, [...lines.slice(0, at), THROWING_LINE, ...lines.slice(at)].join('\n'))
    const broken = await thrown.then(() => call('design_check', {}))
    const error = 'thrown' in broken ? broken.thrown : null
    const updated = kit.page.waitForEvent('console', {
      predicate: (message) => message.text().includes(HOT_UPDATED),
      timeout: PAGE_DRIVER_TIMEOUT_MS,
    })
    await writeFile(CARDS_FILE, source)
    await updated
    expect([broken.verdict, error?.file, error?.line]).toEqual(['broken', 'src/Cards.tsx', at + 1])
    expect(roundOf(await call('design_check', {})).verdict).not.toBe('broken')
  })
})

const SLOW_LINK = 'https://www.figma.com/design/ItSlowFontKey/x?node-id=3-1'
const SLOW_FRAME = {w: 1280, h: 400}
const SLOW_FONT_FILE = '/slow/fonts/'
const FALLBACK_FAMILY = 'font-family: monospace;'
const SLOW_FAMILY = "font-family: 'Slow Sans', monospace;"
const SLOW_DOCUMENT = {
  name: 'it slow font',
  lastModified: '2026-11-10T00:00:00Z',
  version: '1',
  nodes: {
    '3:1': {
      document: figmaFrame({
        id: '3:1',
        name: 'Report',
        box: {x: 0, y: 0, ...SLOW_FRAME},
        children: [figmaFrame({id: '3:2', name: 'Paragraph', box: {x: 40, y: 40, w: 480, h: 160}})],
      }),
    },
  },
}

describe('design_check on a button whose label is bare text', () => {
  it('pairs the design label with the button that holds it and compares its font with the button font', async () => {
    await goto('barebutton')
    const image = join(kit.targetsDir, 'bare-button.png')
    await writeFile(image, blankPng({width: bareButton.frame.w, height: bareButton.frame.h}))
    await call('design_get', {figma: bareButton.link, image, document: bareButton.document})
    const checked = roundOf(await call('design_check', {}))
    const label = checked.rows.filter((row) => row.node === bareButton.label).map((row) => row.kind)
    expect([checked.coverage.missing.includes(bareButton.label), label.includes('font family')]).toEqual([false, true])
  })
})

describe('design_check at a width other than the tab', () => {
  it('keeps a margin the page sets from a variable, though a later rule in the block sets one side again', async () => {
    await goto('sidemargin')
    const image = join(kit.targetsDir, 'side-margin.png')
    await writeFile(image, blankPng({width: sideMargin.frame.w, height: sideMargin.frame.h}))
    await call('design_get', {figma: sideMargin.link, image, document: sideMargin.document})
    const checked = roundOf(await call('design_check', {}))
    expect(checked.rows.filter((row) => row.node === sideMargin.panel).map((row) => row.text)).toEqual([])
  })
})

describe('design_check on a paragraph that wraps', () => {
  const wrapRows = async (width: number, design = wrapText.tall): Promise<string[]> => {
    await goto(`/?variant=wrap&width=${width}`)
    const image = join(kit.targetsDir, 'wrap-text.png')
    await writeFile(image, blankPng({width: design.frame.w, height: design.frame.h}))
    await call('design_get', {figma: wrapText.link, image, document: design.document})
    const checked = roundOf(await call('design_check', {}))
    return checked.rows.filter((row) => row.magnitude === 'reflow').map((row) => row.text)
  }

  it('names the text and its line counts when it wraps to one more line than the frame', async () => {
    expect(await wrapRows(640)).toEqual([
      `text Paragraph [${wrapText.paragraph}] p.wrap-text: wraps to 4 lines, the frame has 3`,
    ])
  })

  it('has no wrap row once the paragraph is as wide as the frame, its padding not counted as a line', async () => {
    expect(await wrapRows(800)).toEqual([])
  })

  it('counts every line of a text that runs past a short frame', async () => {
    expect(await wrapRows(480, wrapText.short)).toEqual([
      `text Paragraph [${wrapText.paragraph}] p.wrap-text: wraps to 5 lines, the frame has 3`,
    ])
  })

  it('says a text breaks into fewer lines than the frame when it is wider', async () => {
    expect(await wrapRows(1100)).toEqual([
      `text Paragraph [${wrapText.paragraph}] p.wrap-text: breaks into 2 lines, the frame has 3`,
    ])
  })
})

describe('design_check on a page far taller than the frame', () => {
  const pageRows = async (query: string): Promise<{rows: string[]; reasons: string[]}> => {
    await goto(`/?variant=tall${query}`)
    const image = join(kit.targetsDir, 'tall-page.png')
    await writeFile(image, blankPng({width: tallPage.frame.w, height: tallPage.frame.h}))
    await call('design_get', {figma: tallPage.link, image, document: tallPage.document})
    const checked = roundOf(await call('design_check', {}))
    const rows = checked.rows.filter((row) => row.kind === designConfig.rowKinds.page).map((row) => row.text)
    return {rows, reasons: checked.reasons}
  }

  it('names the image that makes it tall, before the coverage sentence', async () => {
    const lines = (await readFile(APP_FILE, 'utf8')).split('\n')
    const line = lines.findIndex((text) => text.includes('className="tall-line"')) + 1
    const {rows, reasons} = await pageRows('')
    const row = `the page is 123184 px tall, the frame is 400; the tallest element past the frame is img.tall-line at src/App.tsx:${line}, 123120 px`
    expect([rows, reasons[0]]).toEqual([[row], `${row}.`])
  })

  it('has no page row once the image width is constrained', async () => {
    expect((await pageRows('&width=1px')).rows).toEqual([])
  })
})

describe('design_check on a row near its breakpoint', () => {
  const stackRows = async (width: number): Promise<string[]> => {
    await goto(`/?variant=stackrow&width=${width}`)
    const image = join(kit.targetsDir, 'stack-row.png')
    await writeFile(image, blankPng({width: stackRow.frame.w, height: stackRow.frame.h}))
    await call('design_get', {figma: stackRow.link, image, document: stackRow.document})
    const checked = roundOf(await call('design_check', {}))
    return checked.rows.filter((row) => row.text.includes('did not stack')).map((row) => row.text)
  }
  const tolerance = designConfig.tolerances.geometryPx

  it('has no breakpoint row when the row is under its breakpoint by the geometry tolerance', async () => {
    expect(await stackRows(stackRow.breakpoint - tolerance)).toEqual([])
  })

  it('says the row did not stack when it is under its breakpoint by more than the geometry tolerance', async () => {
    const wide = stackRow.breakpoint - tolerance - tolerance
    expect(await stackRows(wide)).toContain(
      `frame Row [${stackRow.row}] at ${stackRow.frame.w} wide: did not stack; it is ${wide}px wide, under its breakpoint ${stackRow.breakpoint}px, and its children are not one under another`,
    )
  })
})

describe('design_check on a page whose fonts load slowly', () => {
  it('measures the same page on the first check, while an @import font is still loading, and on the second', async () => {
    await goto('slowfont')
    const image = join(kit.targetsDir, 'slow-font.png')
    await writeFile(image, blankPng({width: SLOW_FRAME.w, height: SLOW_FRAME.h}))
    await call('design_get', {figma: SLOW_LINK, image, document: SLOW_DOCUMENT})
    const slowly = (response: {url: () => string}): boolean => response.url().includes(SLOW_FONT_FILE)
    const requested = kit.page.waitForRequest(slowly)
    const landed = kit.page.waitForResponse(slowly)
    const styles = await readFile(STYLES_FILE, 'utf8')
    await writeFile(STYLES_FILE, styles.replace(FALLBACK_FAMILY, SLOW_FAMILY))
    const [first, second] = await requested
      .then(() => call('design_check', {}))
      .then(async (checked) => [roundOf(checked), roundOf(await landed.then(() => call('design_check', {})))])
      .finally(() => writeFile(STYLES_FILE, styles))
    expect([second?.round, second?.unchanged]).toEqual([first?.round, true])
  })
})

describe('design_check image rows', () => {
  const PICTURE = picture.box
  const folder = join(kit.hostRoot, 'public', 'design')
  const frame = join(kit.targetsDir, 'picture-frame.png')

  const found: string[] = []

  beforeAll(async () => {
    await mkdir(folder, {recursive: true})
    found.push(...(await readdir(folder)))
    await writeFile(
      join(folder, 'same.png'),
      picture.painted({width: PICTURE.w * 2, height: PICTURE.h * 2, turned: false}),
    )
    await writeFile(join(folder, 'other.png'), picture.painted({width: PICTURE.w, height: PICTURE.h, turned: true}))
    await writeFile(frame, picture.framed())
  })

  afterAll(async () => {
    const written = (await readdir(folder)).filter((name) => !found.includes(name))
    await Promise.all(written.map((name) => rm(join(folder, name), {force: true})))
  })

  const imageRows = async (src: string): Promise<ReturnType<typeof roundOf>['rows']> => {
    await goto(`/?variant=picture&src=${encodeURIComponent(src)}`)
    await call('design_get', {figma: picture.link, image: frame, document: picture.document})
    return roundOf(await call('design_check', {})).rows.filter((row) => row.kind === 'image')
  }

  it('passes a page that serves the same picture from another file at another size', async () => {
    expect(await imageRows('/design/same.png')).toEqual([])
  })

  it('fails a page that serves a different picture, naming both pictures', async () => {
    const rows = await imageRows('/design/other.png')
    expect(rows.map((row) => row.node)).toEqual(['2:2'])
    expect(['/design/2-2.png', '/design/other.png'].every((name) => rows[0]?.text.includes(name))).toBe(true)
  })
})

const NamedSchema = z.array(z.looseObject({name: z.string()}))

function migrated(list: typeof migrations): DatabaseSync {
  const client = new DatabaseSync(':memory:')
  list.flatMap((migration) => migration.sql).forEach((statement) => client.exec(statement))
  return client
}

function pragma(input: {client: DatabaseSync; statement: string}): unknown[] {
  return input.client.prepare(input.statement).all()
}

describe('run database schema', () => {
  it('migrates a run database forward with the reply column and the round indexes', () => {
    const client = migrated(migrations)
    const names = (statement: string) => NamedSchema.parse(pragma({client, statement})).map((entry) => entry.name)
    expect(names('PRAGMA index_list(design_rows)')).toContain('rows_by_round')
    expect(names('PRAGMA table_info(design_tool_calls)')).toContain('reply')
    expect(names('PRAGMA table_info(design_node_components)')).toContain('run_id')
    expect(names('PRAGMA table_info(design_fom_nodes)')).toContain('fill_kind')
  })
})

describe('a run database from either branch', () => {
  it.each(['twentyeight-figma7-1', 'catalog-era'])('opens %s and migrates it to the merged tables', async (name) => {
    const stateRoot = await mkdtemp(join(tmpdir(), 'conciv-design-forward-'))
    await mkdir(join(stateRoot, '.conciv'))
    const source = new DatabaseSync(fileURLToPath(new URL(`fixtures/runs/${name}/.conciv/conciv.db`, import.meta.url)))
    source.exec(`VACUUM INTO '${join(stateRoot, '.conciv', 'conciv.db')}'`)
    source.close()
    const orm = openDb({stateRoot, extensions: [{name: 'design', migrations}]})
    const client = orm.$client
    const names = (statement: string) => NamedSchema.parse(pragma({client, statement})).map((entry) => entry.name)
    expect(names('PRAGMA table_info(design_rounds)')).toEqual(expect.arrayContaining(['broken_by', 'drift']))
    expect(names('PRAGMA index_list(design_rows)')).toContain('rows_by_round')
    expect(names('PRAGMA table_info(design_fom)')).toContain('site')
    client.close()
    await rm(stateRoot, {recursive: true, force: true})
  })
})

type Store = ReturnType<typeof openStore>

type Sources = ReturnType<typeof catalogSources>

async function withStore<T>(run: (input: {store: Store; sources: Sources}) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), 'conciv-runs-home-'))
  const store = openStore(home)
  const homeOrm = openHomeDb(home)
  const sources = catalogSources({
    orm: homeOrm,
    sources: sourceCatalog({extension: 'design', sources: storeSources(), home}),
  })
  try {
    return await run({store, sources})
  } finally {
    closeHomeDb(homeOrm)
    store.close()
    await rm(home, {recursive: true, force: true})
  }
}

const ForeignSchema = z.array(z.looseObject({table: z.string(), from: z.string()}))

const STORED = [
  'targets',
  'rounds',
  'missing',
  'candidates',
  'widths',
  'regions',
  'rows',
  'fom',
  'nodes',
  'votes',
  'tool_calls',
  'runs',
  'labels',
  'node_components',
  'notes',
  'artifacts',
  'lanes',
  'judgements',
  'reports',
]

const VIEWS = [
  'run_summary',
  'round_rows',
  'lowest_rendered',
  'page_height_rows',
  'broken_rounds',
  'mispairs',
  'lost_components',
  'hint_vs_drawn',
  'kit_per_round',
  'judged',
  'wave_summary',
]

function seededRuns(store: Store): number[] {
  const {runs, targets, rounds} = storeTables
  const seeds = [
    {verdict: 'done' as const, cost: 1, rows: 2, pixels: 0.1, rendered: 5},
    {verdict: 'not-yet' as const, cost: 3, rows: 4, pixels: 0.3, rendered: 7},
  ]
  return seeds.map((seed, index) => {
    const [run] = store.orm
      .insert(runs)
      .values({
        model: 'm',
        prompt_head: 'p',
        started: 0,
        ended: 60_000,
        cost: seed.cost,
        verdict: seed.verdict,
        wave: 'thirty',
        lane: `figma7-${index}`,
      })
      .returning()
      .all()
    if (run === undefined) throw new Error('no run row')
    store.orm
      .insert(targets)
      .values({
        target_id: 't',
        run_id: run.run_id,
        session: 's',
        link: 'l',
        width: 390,
        height: 800,
        scale: 1,
        design: {
          id: 't',
          source: {kind: 'figma', ref: 'key/1:2'},
          viewport: {width: 390, height: 800},
          scale: 1,
          root: {
            id: '1:2',
            hash: '1:2',
            box: {x: 0, y: 0, w: 390, h: 800},
            kind: 'box',
            border: null,
            radius: 0,
            children: [],
          },
        },
        image: 'i',
        at: 0,
      })
      .run()
    store.orm
      .insert(rounds)
      .values({
        target_id: 't',
        run_id: run.run_id,
        round: 1,
        rows_count: seed.rows,
        pixel_share: seed.pixels,
        nodes: 9,
        rendered: seed.rendered,
        tree: '',
        verdict: seed.verdict,
        at: 0,
      })
      .run()
    return run.run_id
  })
}

describe('the runs store', () => {
  it('lists every stored table and every view as a source, each readable', async () => {
    await withStore(async ({sources}) => {
      const expected = [...STORED.map((name) => `design_stored_${name}`), ...VIEWS.map((name) => `design_${name}`)]
      expect(new Set(sources.list().map((source) => source.name))).toEqual(new Set(expected))
      const read = await Promise.all(expected.map((from) => sources.read({from, limit: 1})))
      expect(read).toEqual(expected.map(() => []))
    })
  })

  it('answers wave_summary per wave and width with the done count and the medians', async () => {
    await withStore(async ({store, sources}) => {
      seededRuns(store)
      expect(await sources.read({from: 'design_wave_summary', where: 'wave == "thirty"'})).toEqual([
        {
          wave: 'thirty',
          width: 390,
          runs: 2,
          done: 1,
          median_rows: 3,
          median_pixels: 0.2,
          median_cost: 2,
          median_lowest_rendered: 6,
        },
      ])
    })
  })

  it('takes a judgement through the house write, refuses a score of six, and joins it in judged', async () => {
    await withStore(async ({store, sources}) => {
      const [run] = seededRuns(store)
      const judgement = {run, target: 't', width: 390, reason: 'close', judge_model: 'opus', at: 1}
      await sources.write({into: 'design_stored_judgements', values: {...judgement, score: 4}})
      await expect(
        sources.write({into: 'design_stored_judgements', values: {...judgement, judge_model: 'other', score: 6}}),
      ).rejects.toMatchObject({cause: {message: 'CHECK constraint failed: judgements_score'}})
      expect(
        await sources.read({
          from: 'design_judged',
          where: 'score != null',
          select: ['run', 'lane', 'verdict', 'score'],
        }),
      ).toEqual([{run, lane: 'figma7-0', verdict: 'done', score: 4}])
      await expect(sources.write({into: 'design_stored_notes', values: {target: 't', run, text: 'x'}})).rejects.toThrow(
        'design_stored_notes is read-only',
      )
    })
  })

  it('keys every child row to its run, target and round, and indexes the round lookups', async () => {
    await withStore(async ({store}) => {
      const client = store.orm.$client
      const names = (statement: string) => NamedSchema.parse(pragma({client, statement})).map((entry) => entry.name)
      const parents = (table: string) =>
        ForeignSchema.parse(pragma({client, statement: `PRAGMA foreign_key_list(${table})`})).map(
          (entry) => entry.table,
        )
      expect(names('PRAGMA index_list(design_rows)')).toEqual(expect.arrayContaining(['rows_by_round', 'rows_by_node']))
      expect(new Set(parents('design_rounds'))).toEqual(new Set(['design_runs', 'design_targets']))
      expect(new Set(parents('design_rows'))).toEqual(new Set(['design_runs', 'design_targets', 'design_rounds']))
      expect(names('PRAGMA table_info(design_tool_calls)')).toContain('reply')
      expect(() =>
        store.orm.$client.exec(
          `INSERT INTO design_runs (model, prompt_head, started, verdict) VALUES ('m', 'p', 1, 'fine')`,
        ),
      ).toThrow('CHECK constraint failed: runs_verdict')
    })
  })
})

const ProvenanceSchema = z.array(
  z.object({
    model: z.string(),
    project_key: z.string(),
    branch: z.string().nullable(),
    head: z.string().nullable(),
    wave: z.string().nullable(),
    lane: z.string().nullable(),
    tools_head: z.string().nullable(),
    tools_version: z.string().nullable(),
    tools_fingerprint: z.string().nullable(),
    verdict: z.string().nullable(),
    cost: z.number().nullable(),
  }),
)

const PROVENANCE = [
  'model',
  'project_key',
  'branch',
  'head',
  'wave',
  'lane',
  'tools_head',
  'tools_version',
  'tools_fingerprint',
  'verdict',
  'cost',
]

async function git(input: {cwd: string; args: string[]}): Promise<string> {
  return (await promisify(execFile)('git', input.args, {cwd: input.cwd})).stdout.trim()
}

describe('run start and run end', () => {
  it('writes the git branch, head, project key and tool version of a git project, and closes with the verdict', async () => {
    const run = (args: string[], options: Record<string, string | number>) =>
      kit.rpc.extensions.run({name: 'design:run', args, options})
    await run(['start', 'it-model', 'it-head'], {wave: 'thirty', lane: 'figma7-1'})
    await run(['end', 'done'], {cost: 2})
    const [row] = ProvenanceSchema.parse(
      await kit.rpc.db.read({from: 'design_runs', where: 'model == "it-model"', select: PROVENANCE}),
    )
    const [remote, branch, head] = await Promise.all([
      git({cwd: kit.hostRoot, args: ['remote', 'get-url', 'origin']}),
      git({cwd: kit.hostRoot, args: ['rev-parse', '--abbrev-ref', 'HEAD']}),
      git({cwd: kit.hostRoot, args: ['rev-parse', 'HEAD']}),
    ])
    expect(row).toEqual({
      model: 'it-model',
      project_key: `${remote}#packages/it/test/fixtures/design/host/`,
      branch,
      head,
      wave: 'thirty',
      lane: 'figma7-1',
      tools_head: head,
      tools_version: z.object({version: z.string()}).parse(JSON.parse(await readFile(DESIGN_PACKAGE, 'utf8'))).version,
      tools_fingerprint: expect.any(String),
      verdict: 'done',
      cost: 2,
    })
  })

  it('keys a project without git by its package name, with no branch, head, wave or lane', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'conciv-design-no-git-'))
    const stateRoot = await mkdtemp(join(tmpdir(), 'conciv-design-no-git-state-'))
    const home = await mkdtemp(join(tmpdir(), 'conciv-design-no-git-home-'))
    await writeFile(join(cwd, 'package.json'), JSON.stringify({name: 'no-git-host'}))
    const orm = openDb({stateRoot, extensions: [design]})
    const {commands, sources} = extensionDb({orm, extensions: [design], home, cwd})
    await commands.find((command) => command.name === 'design:run')?.run({args: ['start', 'm', 'p'], options: {}})
    const [row] = ProvenanceSchema.parse(await sources.read({from: 'design_runs', select: PROVENANCE}))
    expect([row?.project_key, row?.branch, row?.head, row?.wave, row?.lane]).toEqual([
      'no-git-host',
      null,
      null,
      null,
      null,
    ])
    orm.$client.close()
    await Promise.all([cwd, stateRoot, home].map((dir) => rm(dir, {recursive: true, force: true})))
  })

  it('keys an untracked copy inside a git checkout by its package name, with no branch or head', async () => {
    const waveDir = await mkdtemp(join(FIXTURES, 'untracked-'))
    importedDirs.push(waveDir)
    const cwd = await lane({root: FIXTURES, wave: basename(waveDir), label: 'copy'})
    const stateRoot = await mkdtemp(join(tmpdir(), 'conciv-design-untracked-state-'))
    const home = await mkdtemp(join(tmpdir(), 'conciv-design-untracked-home-'))
    const orm = openDb({stateRoot, extensions: [design]})
    const {commands, sources} = extensionDb({orm, extensions: [design], home, cwd})
    await commands.find((command) => command.name === 'design:run')?.run({args: ['start', 'm', 'p'], options: {}})
    const [row] = ProvenanceSchema.parse(await sources.read({from: 'design_runs', select: PROVENANCE}))
    expect([row?.project_key, row?.branch, row?.head]).toEqual(['design-fixture-host', null, null])
    orm.$client.close()
    await Promise.all([stateRoot, home].map((dir) => rm(dir, {recursive: true, force: true})))
  })
})

const BACKFILL = 'runs_backfill_wave_lane'

const TARGET_IDS_MOVED = 'ALTER TABLE design_targets DROP COLUMN ids'

const RUN_FIXTURE = fileURLToPath(new URL('fixtures/runs/twentysix-figma7-1/', import.meta.url))

const ImportedSchema = z.object({runId: z.number(), imported: z.boolean(), copied: z.record(z.string(), z.number())})

const CountSchema = z.object({count: z.number()})

const importedDirs: string[] = []

afterAll(() => Promise.all(importedDirs.map((dir) => rm(dir, {recursive: true, force: true}))))

async function runImport(input: {dir: string; options?: Record<string, string | string[]>}) {
  return ImportedSchema.parse(
    await kit.rpc.extensions.run({name: 'design:run-import', args: [input.dir], options: input.options ?? {}}),
  )
}

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  importedDirs.push(dir)
  return dir
}

async function fixtureCopy(statement: string): Promise<string> {
  const dir = await tempDir('conciv-run-project-')
  await mkdir(join(dir, '.conciv'))
  const source = new DatabaseSync(join(RUN_FIXTURE, '.conciv', 'conciv.db'), {readOnly: true})
  source.exec(`VACUUM INTO '${join(dir, '.conciv', 'conciv.db')}'`)
  source.close()
  const copy = new DatabaseSync(join(dir, '.conciv', 'conciv.db'))
  copy.exec(`${TARGET_IDS_MOVED};${statement}`)
  copy.close()
  return dir
}

const CURRENT_FIXTURE = await fixtureCopy('')

function fixtureCount(input: {table: string; where?: string}): number {
  const source = new DatabaseSync(join(RUN_FIXTURE, '.conciv', 'conciv.db'), {readOnly: true})
  const {count} = CountSchema.parse(
    source.prepare(`SELECT count(*) AS count FROM ${input.table} ${input.where ?? ''}`).get(),
  )
  source.close()
  return count
}

async function storedCount(input: {from: string; runId: number}): Promise<number> {
  return (await kit.rpc.db.read({from: input.from, where: `run == ${input.runId}`})).length
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

describe('run import', () => {
  const COPIED = ['design_stored_rounds', 'design_stored_rows', 'design_stored_votes', 'design_stored_tool_calls']

  it('imports a finished run once, its rounds, rows and votes under one run id, and returns that id again', async () => {
    const expected = ['design_rounds', 'design_rows', 'design_votes', 'design_tool_calls'].map((table) =>
      fixtureCount({table}),
    )
    const first = await runImport({dir: CURRENT_FIXTURE})
    const counted = () => Promise.all(COPIED.map((from) => storedCount({from, runId: first.runId})))
    expect(await counted()).toEqual(expected)
    const again = await runImport({dir: CURRENT_FIXTURE})
    expect([again.imported, again.runId]).toEqual([false, first.runId])
    expect(await counted()).toEqual(expected)
  })

  it('imports a live database that lacks a newer column with null in it', async () => {
    const dir = await fixtureCopy(
      "ALTER TABLE design_runs ADD COLUMN lane text; UPDATE design_runs SET lane = 'figma7-1'",
    )
    const {runId} = await runImport({dir})
    expect(
      await kit.rpc.db.read({from: 'design_stored_runs', where: `run == ${runId}`, select: ['wave', 'lane']}),
    ).toEqual([{wave: null, lane: 'figma7-1'}])
  })

  it('refuses a live database with a column the store lacks, naming it, and copies nothing', async () => {
    const dir = await fixtureCopy('ALTER TABLE design_rows ADD COLUMN surprise TEXT')
    await expect(runImport({dir})).rejects.toThrow('design_rows.surprise')
    expect(await kit.rpc.db.read({from: 'design_stored_runs', where: `source_path == "${dir}"`})).toEqual([])
  })

  it('stores the design, a screenshot per width, the source tar and the transcript with checksums and lifetimes, and the lane', async () => {
    const dir = await fixtureCopy("UPDATE design_runs SET verdict = 'done'")
    const inputs = await tempDir('conciv-run-artifacts-')
    const widths = [390, 1280]
    await Promise.all(
      ['screenshots', 'design', 'source'].map((folder) => mkdir(join(inputs, folder), {recursive: true})),
    )
    await Promise.all([
      ...widths.flatMap((width) => [
        writeFile(join(inputs, 'screenshots', `${width}.png`), `shot ${width}`),
        writeFile(join(inputs, 'design', `${width}.png`), `design ${width}`),
      ]),
      writeFile(join(inputs, 'source', 'App.tsx'), 'export function App() {}'),
      writeFile(join(inputs, 'transcript.jsonl'), '{"turn":1}'),
    ])
    const {runId} = await runImport({
      dir,
      options: {
        screenshots: join(inputs, 'screenshots'),
        design: join(inputs, 'design'),
        source: join(inputs, 'source'),
        transcript: join(inputs, 'transcript.jsonl'),
        lane: dir,
        lifetime: ['screenshot=7'],
      },
    })
    const rows = z
      .array(
        z.object({
          kind: z.string(),
          width: z.number().nullable(),
          path: z.string(),
          size: z.number(),
          checksum: z.string(),
          lifetime: z.string(),
        }),
      )
      .parse(
        await kit.rpc.db.read({
          from: 'design_stored_artifacts',
          where: `run == ${runId}`,
          select: ['kind', 'width', 'path', 'size', 'checksum', 'lifetime'],
        }),
      )
    expect(new Set(rows.map((row) => `${row.kind} ${row.width} ${row.lifetime}`))).toEqual(
      new Set([
        'design 390 infinite',
        'design 1280 infinite',
        'screenshot 390 7',
        'screenshot 1280 7',
        'source null infinite',
        'transcript null 90',
      ]),
    )
    const stored = await Promise.all(rows.map((row) => readFile(join(kit.home, 'artifacts', row.path))))
    expect(stored.map((bytes) => [sha256(bytes), bytes.length])).toEqual(rows.map((row) => [row.checksum, row.size]))
    expect(rows.every((row) => row.path.startsWith(`${runId}/`))).toBe(true)
    const screenshot = rows.find((row) => row.kind === 'screenshot' && row.width === 390)
    expect(screenshot?.checksum).toBe(sha256(await readFile(join(inputs, 'screenshots', '390.png'))))
    expect(await kit.rpc.db.read({from: 'design_stored_lanes', where: `run == ${runId}`, select: ['path']})).toEqual([
      {path: dir},
    ])
  })

  it('answers run_summary per width with the round, verdict and rows of the final gate', async () => {
    const GateSchema = z.object({
      variants: z.array(
        z.object({target: z.string(), round: z.number(), verdict: z.string(), counts: z.object({rows: z.number()})}),
      ),
    })
    const gate = GateSchema.parse(JSON.parse(await readFile(join(RUN_FIXTURE, 'gate-final.json'), 'utf8')))
    const {runId} = await runImport({dir: CURRENT_FIXTURE})
    const rows = await kit.rpc.db.read({
      from: 'design_run_summary',
      where: `run == ${runId}`,
      select: ['target', 'round', 'verdict', 'rows'],
      order: [{field: 'width', dir: 'desc'}],
    })
    expect(rows).toEqual(
      gate.variants.map((variant) => ({
        target: variant.target,
        round: variant.round,
        verdict: variant.verdict,
        rows: variant.counts.rows,
      })),
    )
    expect(await kit.rpc.db.read({from: 'design_mispairs', where: 'run == 0'})).toEqual([])
    await expect(kit.rpc.db.write({into: 'design_stored_runs', values: {model: 'm'}})).rejects.toThrow(
      'design_stored_runs is read-only',
    )
  })

  it('answers the wave questions: broken rounds, page-height rows and the lowest rendered count per width', async () => {
    const broken = fixtureCount({table: 'design_rounds', where: 'WHERE broken IS NOT NULL'})
    const page = fixtureCount({table: 'design_rows', where: "WHERE kind = 'page'"})
    const targets = fixtureCount({table: 'design_targets'})
    const {runId} = await runImport({dir: CURRENT_FIXTURE})
    const counts = await Promise.all(
      ['design_broken_rounds', 'design_page_height_rows', 'design_lowest_rendered'].map((from) =>
        storedCount({from, runId}),
      ),
    )
    expect(counts).toEqual([broken, page, targets])
  })

  it('reads the run summary of an imported run through the CLI, filtered by cost', async () => {
    const {runId} = await runImport({dir: CURRENT_FIXTURE})
    const source = new DatabaseSync(join(RUN_FIXTURE, '.conciv', 'conciv.db'), {readOnly: true})
    const widths = z
      .array(z.object({width: z.number()}))
      .parse(source.prepare('SELECT width FROM design_targets ORDER BY width').all())
    source.close()
    const printed = await promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(import.meta.resolve('@conciv/cli/bin')),
        'db',
        'query',
        '--from',
        'design_run_summary',
        '--where',
        `run == ${runId} && cost > 2`,
        '--select',
        'run,width,verdict',
        '--order',
        'width',
      ],
      {cwd: kit.stateRoot, env: {...process.env, CONCIV_STATE_ROOT: kit.stateRoot}},
    )
    const SummarySchema = z.object({
      ok: z.literal(true),
      data: z.array(z.object({run: z.number(), width: z.number(), verdict: z.string()})),
    })
    const {data} = SummarySchema.parse(JSON.parse(printed.stdout))
    expect(data.map((row) => [row.run, row.width])).toEqual(widths.map((row) => [runId, row.width]))
  })

  it('imports a tool call that names a round the run never stored', async () => {
    const dir = await fixtureCopy(
      "INSERT INTO design_tool_calls (run_id, target_id, tool, round, input, reply_bytes, duration_ms, at) SELECT run_id, target_id, 'design_status', 0, '{}', 0, 0, at FROM design_rounds LIMIT 1",
    )
    const {runId, copied} = await runImport({dir})
    expect([copied.design_tool_calls, await storedCount({from: 'design_stored_tool_calls', runId})]).toEqual([28, 28])
  })

  it('backfills the wave and lane of a stored run from the run dir name in its source path', async () => {
    const home = await tempDir('conciv-runs-backfill-')
    const store = openStore(home)
    store.orm.$client.exec(
      "INSERT INTO design_runs (model, prompt_head, started, source_path, source_run_id) VALUES ('m', 'p', 1, '/lanes/twentyfour-figma7-1/state', 1)",
    )
    const backfill = runsMigrations.find((migration) => migration.name.endsWith(BACKFILL))
    backfill?.sql.forEach((statement) => store.orm.$client.exec(statement))
    store.close()
    const homeOrm = openHomeDb(home)
    const sources = catalogSources({
      orm: homeOrm,
      sources: sourceCatalog({extension: 'design', sources: storeSources(), home}),
    })
    const read = await sources.read({from: 'design_stored_runs', select: ['wave', 'lane']})
    closeHomeDb(homeOrm)
    expect(read).toEqual([{wave: 'twentyfour', lane: 'figma7-1'}])
  })
})

async function withHome<T>(
  run: (input: {home: string; store: Store; sources: Sources; command: (name: string) => Command}) => Promise<T>,
): Promise<T> {
  const [cwd, stateRoot, home] = await Promise.all([
    tempDir('conciv-gc-cwd-'),
    tempDir('conciv-gc-state-'),
    tempDir('conciv-gc-home-'),
  ])
  await writeFile(join(cwd, 'package.json'), JSON.stringify({name: 'gc-host'}))
  const orm = openDb({stateRoot, extensions: [design]})
  const {commands, sources} = extensionDb({orm, extensions: [design], home, cwd})
  const store = openStore(home)
  const command = (name: string): Command => {
    const found = commands.find((entry) => entry.name === `design:${name}`)
    if (found === undefined) throw new Error(`no command design:${name}`)
    return found
  }
  try {
    return await run({home, store, sources, command})
  } finally {
    store.close()
    orm.$client.close()
  }
}

type Command = {run: (call: {args: string[]; options: Record<string, string | boolean | string[]>}) => unknown}

const GcSchema = z.object({removed: z.array(z.string()), kept: z.number()})

describe('runs gc', () => {
  it('removes an artifact written with a lifetime of 0 days, its row and file, and keeps an infinite one', async () => {
    await withHome(async ({home, store, sources, command}) => {
      const [run = 0] = seededRuns(store)
      const paths = store.orm.transaction((tx) =>
        storeArtifacts({
          tx,
          home,
          runId: run,
          artifacts: [
            {kind: 'screenshot', width: 390, name: '390.png', bytes: Buffer.from('shot'), lifetime: '0'},
            {kind: 'source', width: null, name: 'source.tar', bytes: Buffer.from('tar'), lifetime: 'infinite'},
          ],
        }),
      )
      const [expired = '', kept = ''] = paths.map(({path}) => join(home, 'artifacts', path))
      expect(GcSchema.parse(await command('runs-gc').run({args: [], options: {}}))).toEqual({
        removed: [expired],
        kept: 1,
      })
      expect(await sources.read({from: 'design_stored_artifacts', select: ['kind']})).toEqual([{kind: 'source'}])
      expect([existsSync(expired), existsSync(kept)]).toEqual([false, true])
    })
  })

  it('with --state removes a registered lane dir, leaves an unregistered dir and never reads source_path', async () => {
    await withHome(async ({store, sources, command}) => {
      const [registered, unregistered] = seededRuns(store)
      const lane = await tempDir('conciv-gc-lane-')
      const other = await tempDir('conciv-gc-other-')
      store.orm
        .insert(storeTables.lanes)
        .values({run_id: registered ?? 0, path: lane, registered: 0})
        .run()
      store.orm.$client
        .prepare('UPDATE design_runs SET source_path = ?, source_run_id = 1 WHERE run_id = ?')
        .run(other, unregistered ?? 0)
      expect(GcSchema.parse(await command('runs-gc').run({args: [], options: {state: true}}))).toEqual({
        removed: [lane],
        kept: 0,
      })
      expect([existsSync(lane), existsSync(other)]).toEqual([false, true])
      expect(await sources.read({from: 'design_stored_runs', select: ['run']})).toHaveLength(2)
    })
  })
})

describe('report', () => {
  it('writes the wave report whose cells equal the wave_summary and judged reads, and records it', async () => {
    await withHome(async ({home, sources, command}) => {
      const lanes = ['figma7-1', 'figma7-2']
      const dirs = await Promise.all(
        lanes.map((lane) =>
          fixtureCopy(
            `ALTER TABLE design_runs ADD COLUMN wave text; ALTER TABLE design_runs ADD COLUMN lane text; UPDATE design_runs SET wave = 'it-wave', lane = '${lane}'`,
          ),
        ),
      )
      const imported = await Promise.all(
        dirs.map(async (dir) => ImportedSchema.parse(await command('run-import').run({args: [dir], options: {}}))),
      )
      const [first] = imported
      const [judgedTarget] = z
        .array(z.object({target: z.string(), width: z.number()}))
        .parse(await sources.read({from: 'design_judged', where: `run == ${first?.runId}`, limit: 1}))
      await sources.write({
        into: 'design_stored_judgements',
        values: {run: first?.runId, ...judgedTarget, score: 4, reason: 'close', judge_model: 'opus', at: 1},
      })
      const printed = z.string().parse(await command('report').run({args: ['it-wave'], options: {}}))
      expect(printed).toBe(join(home, 'artifacts', 'reports', 'it-wave.md'))
      const cells = (await readFile(printed, 'utf8'))
        .split('\n')
        .filter((line) => line.startsWith('| ') && !line.startsWith('| -'))
        .map((line) => line.slice(2, -2).split(' | '))
      const shown = (rows: Record<string, unknown>[]) =>
        rows.flatMap((row) => [Object.keys(row), Object.values(row).map((value) => String(value ?? ''))])
      const summary = await sources.read({
        from: 'design_wave_summary',
        where: 'wave == "it-wave"',
        select: ['width', 'runs', 'done', 'median_rows', 'median_pixels', 'median_cost', 'median_lowest_rendered'],
        order: [{field: 'width', dir: 'asc'}],
      })
      const judged = await sources.read({
        from: 'design_judged',
        where: 'wave == "it-wave"',
        select: ['run', 'lane', 'target', 'width', 'verdict', 'rows', 'pixels', 'score', 'reason'],
        order: [
          {field: 'run', dir: 'asc'},
          {field: 'target', dir: 'asc'},
          {field: 'width', dir: 'asc'},
        ],
      })
      expect(summary.map((row) => row.runs)).toEqual(summary.map(() => 2))
      expect(judged.some((row) => row.score === 4)).toBe(true)
      const judgedHeader = Object.keys(judged[0] ?? {})
      expect(cells).toEqual([
        ...summary.flatMap((row) => shown([row])),
        judgedHeader,
        ...judged.map((row) => Object.values(row).map((value) => String(value ?? ''))),
      ])
      const [report] = z
        .array(
          z.object({wave: z.string(), artifact_id: z.number(), queries: z.array(z.looseObject({from: z.string()}))}),
        )
        .parse(await sources.read({from: 'design_stored_reports', select: ['wave', 'artifact_id', 'queries']}))
      expect(report?.queries.map((query) => query.from)).toEqual(['design_wave_summary', 'design_judged'])
      expect(
        await sources.read({
          from: 'design_stored_artifacts',
          where: `artifact_id == ${report?.artifact_id}`,
          select: ['kind', 'path'],
        }),
      ).toEqual([{kind: 'report', path: join('reports', 'it-wave.md')}])
    })
  })
})

const TRIAL_BIN = fileURLToPath(new URL('../src/trial/trial.ts', import.meta.url))

const FIXTURES = fileURLToPath(new URL('fixtures/', import.meta.url))

const STORE_RUN = 'store run '

async function trial(input: {args: string[]; home: string; stdin?: string}): Promise<string> {
  const running = promisify(execFile)(
    process.execPath,
    [fileURLToPath(import.meta.resolve('tsx/cli')), TRIAL_BIN, ...input.args],
    {env: {...process.env, CONCIV_HOME: input.home}},
  )
  running.child.stdin?.end(input.stdin ?? '')
  return (await running).stdout
}

function storeRunOf(printed: string): number {
  const line = printed.split('\n').find((each) => each.startsWith(STORE_RUN))
  if (line === undefined) throw new Error(`trial serve printed no store run:\n${printed}`)
  return Number(line.slice(STORE_RUN.length))
}

describe('trial', () => {
  const served = {home: '', printed: ''}

  beforeAll(async () => {
    served.home = await tempDir('conciv-trial-home-')
    const waveDir = await mkdtemp(join(FIXTURES, 'trial-'))
    importedDirs.push(waveDir)
    const project = await lane({root: FIXTURES, wave: basename(waveDir), label: 'serve'})
    served.printed = await trial({
      home: served.home,
      args: ['serve', '--project', project, '--route', '/?variant=target', '--image', target('u1-1280')],
      stdin: 'run start it-model it-head\ncheck\n',
    })
  })

  it('serve with two stdin commands lands its run in the store with a design and a screenshot per width', async () => {
    const runId = storeRunOf(served.printed)
    const {sources} = homeCatalog(served.home)
    const widths = z
      .array(z.object({width: z.number()}))
      .parse(await sources.read({from: 'design_run_summary', where: `run == ${runId}`, select: ['width']}))
    expect(widths.length).toBeGreaterThan(0)
    const artifacts = z
      .array(z.object({kind: z.string(), width: z.number().nullable()}))
      .parse(await sources.read({from: 'design_stored_artifacts', where: `run == ${runId}`, select: ['kind', 'width']}))
    expect(new Set(artifacts.map((row) => `${row.kind} ${row.width}`))).toEqual(
      new Set(['source null', ...widths.flatMap(({width}) => [`design ${width}`, `screenshot ${width}`])]),
    )
  })

  it('judge names every width of a run whose design or screenshot is missing and writes no judgement', async () => {
    await withHome(async ({home, sources, command}) => {
      const dir = await fixtureCopy(
        "ALTER TABLE design_runs ADD COLUMN wave text; ALTER TABLE design_runs ADD COLUMN lane text; UPDATE design_runs SET wave = 'it-judge', lane = 'figma7-1'",
      )
      const {runId} = ImportedSchema.parse(await command('run-import').run({args: [dir], options: {}}))
      const widths = z
        .array(z.object({target: z.string(), width: z.number()}))
        .parse(await sources.read({from: 'design_run_summary', where: `run == ${runId}`, select: ['target', 'width']}))
      const printed = await trial({home, args: ['judge', 'it-judge']})
      expect(new Set(printed.trim().split('\n'))).toEqual(
        new Set(
          widths.map(
            (row) => `run ${runId} ${row.target} width ${row.width}: no design and no screenshot artifact; not judged`,
          ),
        ),
      )
      expect(await sources.read({from: 'design_stored_judgements'})).toEqual([])
    })
  })

  it('rescore replays a stored round on the current pairer and prints the pairs before and after', async () => {
    const runId = storeRunOf(served.printed)
    const {sources} = homeCatalog(served.home)
    const [stored] = z.array(z.object({target: z.string(), round: z.number()})).parse(
      await sources.read({
        from: 'design_stored_rounds',
        where: `run == ${runId}`,
        select: ['target', 'round'],
        limit: 1,
      }),
    )
    const before = await sources.read({
      from: 'design_stored_votes',
      where: `run == ${runId} && round == ${stored?.round} && won == true`,
    })
    const printed = await trial({home: served.home, args: ['rescore', String(runId), String(stored?.round)]})
    expect(printed).toContain(
      `run ${runId} ${stored?.target} round ${stored?.round}: paired before ${before.length} after `,
    )
  })
})
