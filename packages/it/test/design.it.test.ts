/* oxlint-disable playwright/no-raw-locators -- the cases read the tab directly */
import {execFile} from 'node:child_process'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {basename, join} from 'node:path'
import {setImmediate as nextTurn} from 'node:timers/promises'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'
import {differenceCiede2000} from 'culori'
import {expect as expectLocator} from 'playwright/test'
import {PNG} from 'pngjs'
import {createStorage} from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import {afterAll, afterEach, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {closeHomeDb, componentScans, extensionTable, openDb, openHomeDb} from '@conciv/db'
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
import {createViteOxcSource} from '../../extensions/design/src/server/catalog/vite-oxc-source.js'
import {createCatalog} from '../../extensions/design/src/server/catalog/catalog.js'
import {backfillRelation} from '../../extensions/design/src/server/catalog/backfill-relation.js'
import {createCssTokenSource} from '../../extensions/design/src/server/catalog/token-source.js'
import {createTokenMap} from '../../extensions/design/src/server/catalog/token-map.js'
import type {Component, Scan} from '../../extensions/design/src/shared/catalog-defs.js'
import {bootDesignHost} from './fixtures/design/boot.js'
import {cardsDesign} from './fixtures/design/cards.js'
import {figmaFrame} from './fixtures/design/figma-frame.js'

const HOST_ROOT = fileURLToPath(new URL('fixtures/design/host/', import.meta.url))
const CARDS_FILE = fileURLToPath(new URL('fixtures/design/host/src/Cards.tsx', import.meta.url))
const PAGE_DRIVER_TIMEOUT_MS = 30_000
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

function roundOf(checked: Checked): Exclude<Checked, {unsettled: true} | {compile: unknown}> {
  if ('unsettled' in checked || 'compile' in checked) throw new Error(`no round: ${JSON.stringify(checked)}`)
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
      counts: {much: 0, noticeably: 0, slightly: 0, pins: 0, other: 0, reflow: 0, paint: 0, rows: 0},
      pixels: {share: 0},
      progress: null,
      at: 1,
      tree: '',
      verdict: null,
      unsettled: null,
      broken: null,
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
      'Chip',
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
      "import {Chip} from './src/Chip.tsx'",
    ])
    const listed = await call('design_components', {})
    expect(firstOfTier({text: listed.text, tier: 'kit'})).not.toBe("import {Button} from '@conciv/ui-kit-system'")
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
    expect(placed.find((entry) => entry.nodeId === '8:2')?.component).toEqual({
      name: 'Chip',
      specifier: './src/Chip.tsx',
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
})
