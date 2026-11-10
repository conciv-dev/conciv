import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {PNG} from 'pngjs'
import {afterAll, afterEach, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {closeHomeDb, extensionTable, openDb, openHomeDb} from '@conciv/db'
import {DESIGN_TOOLS, type Design, type DesignNode, type IdNode} from '@conciv/extension-design/defs'
import {readIds} from '../../extensions/design/src/shared/id-tree.js'
import {designTables} from '../../extensions/design/src/server/tables.js'
import {migrations} from '../../extensions/design/src/server/migrations.gen.js'
import {createViteOxcSource} from '../../extensions/design/src/server/catalog/vite-oxc-source.js'
import {createCatalog} from '../../extensions/design/src/server/catalog/catalog.js'
import {createComponentRows} from '../../extensions/design/src/server/catalog/component-rows.js'
import {createNameVariantHinter} from '../../extensions/design/src/server/catalog/name-variant-hinter.js'
import {CatalogSchemas} from '../../extensions/design/src/shared/catalog-defs.js'
import {bootDesignHost} from './fixtures/design/boot.js'
import {figmaFrame} from './fixtures/design/figma-frame.js'

const HOST_ROOT = fileURLToPath(new URL('fixtures/design/host/', import.meta.url))
const CARD_SOURCE = 'packages/extensions/design/src/xray/card.tsx'

const [, checkDef] = DESIGN_TOOLS

type Checked = Exclude<z.output<NonNullable<typeof checkDef.outputSchema>>, {variants: unknown}>
type Kit = Awaited<ReturnType<typeof bootDesignHost>>

const kit = await bootDesignHost()
const {call} = kit

afterAll(() => kit.dispose())

function blankPng(input: {width: number; height: number}): Uint8Array {
  const png = new PNG({width: input.width, height: input.height})
  png.data.fill(255)
  return new Uint8Array(PNG.sync.write(png))
}

function roundOf(checked: Checked): Exclude<Checked, {unsettled: true} | {compile: unknown}> {
  if ('unsettled' in checked || 'compile' in checked) throw new Error(`no round: ${JSON.stringify(checked)}`)
  return checked
}

describe('catalog component rows', () => {
  const NAMED_LINK = 'https://www.figma.com/design/ItFixtureKey/x?node-id=10-1'
  const BLUE = {r: 0x42 / 255, g: 0x6b / 255, b: 0xf2 / 255, a: 1}
  const CHIP_ROW = "Chip is drawn by hand; the design names `Chip` (`import {Chip} from './Chip.tsx'`)"

  function namedBox(input: {id: string; name: string; y: number; type?: string; componentId?: string}): unknown {
    return {
      id: input.id,
      name: input.name,
      type: input.type ?? 'FRAME',
      ...(input.componentId === undefined ? {} : {componentId: input.componentId}),
      absoluteBoundingBox: {x: 40, y: input.y, width: 200, height: 48},
      fills: [{type: 'SOLID', color: BLUE}],
      cornerRadius: 16,
      children: [],
    }
  }

  function namedText(input: {id: string; text: string; y: number}): unknown {
    return {
      id: input.id,
      name: input.text,
      type: 'TEXT',
      characters: input.text,
      style: {fontSize: 16, fontFamily: 'Inter', fontWeight: 400, lineHeightPx: 24},
      absoluteBoundingBox: {x: 40, y: input.y, width: 200, height: 24},
      fills: [{type: 'SOLID', color: {r: 0, g: 0, b: 0, a: 1}}],
      children: [],
    }
  }

  function documentOf(input: {id: string; children: unknown[]; components?: Record<string, {name: string}>}) {
    return {
      name: 'it fixture',
      lastModified: '2026-11-10T00:00:00Z',
      version: '1',
      nodes: {
        [input.id]: {
          document: figmaFrame({
            id: input.id,
            name: 'Named',
            box: {x: 0, y: 0, w: 1280, h: 720},
            children: input.children,
          }),
          components: input.components ?? {},
        },
      },
    }
  }

  const NAMED_DOCUMENT = documentOf({
    id: '10:1',
    children: [
      namedBox({id: '10:2', name: 'Chip', y: 40, type: 'INSTANCE', componentId: '90:1'}),
      namedBox({id: '10:3', name: 'Table', y: 160}),
    ],
    components: {'90:1': {name: 'Chip'}},
  })

  async function measured(input: {on: Kit; page: string; link: string; document: unknown}) {
    await input.on.goto(input.page)
    const image = join(input.on.targetsDir, 'named-figma.png')
    await writeFile(image, blankPng({width: 1280, height: 720}))
    const got = await input.on.call('design_get', {figma: input.link, image, document: input.document})
    const checked = roundOf(await input.on.call('design_check', {}))
    const rows = checked.rows
      .filter((row) => row.magnitude === 'component')
      .map((row) => [row.node, row.component, row.specifier, row.text])
    return {got, rows}
  }

  async function componentRows(input: {on: Kit; page: string}) {
    return (await measured({...input, link: NAMED_LINK, document: NAMED_DOCUMENT})).rows
  }

  it('lists an instance of a component drawn by hand as one component row, its import line from the drawing file', async () => {
    expect(await componentRows({on: kit, page: 'drift-hand'})).toEqual([['10:2', 'Chip', './Chip.tsx', CHIP_ROW]])
  })

  it('lists no component row when the named component renders the node', async () => {
    expect(await componentRows({on: kit, page: 'drift'})).toEqual([])
  })

  it('lists no component row for a do-not-use component, and one at any score for a preferred one', async () => {
    try {
      await call('design_components', {doNotUse: 'Chip', prefer: 'Table'})
      expect((await componentRows({on: kit, page: 'drift-hand'})).map((row) => [row[0], row[1]])).toEqual([
        ['10:3', 'Table'],
      ])
    } finally {
      await call('design_components', {clear: 'Chip'})
      await call('design_components', {clear: 'Table'})
    }
  })

  it('lists no component row with catalog hints off', async () => {
    const bare = await bootDesignHost({config: {catalog: {hint: false}}})
    try {
      expect(await componentRows({on: bare, page: 'drift-hand'})).toEqual([])
    } finally {
      await bare.dispose()
    }
  })

  it('gives no hint to a node that shares no word with a component name', async () => {
    const {got} = await measured({
      on: kit,
      page: 'drift-hand',
      link: 'https://www.figma.com/design/ItFixtureKey/x?node-id=11-1',
      document: documentOf({
        id: '11:1',
        children: [namedBox({id: '11:2', name: 'Header', y: 40}), namedBox({id: '11:3', name: 'Part', y: 160})],
      }),
    })
    expect(
      got.nodes.filter((node) => node.hint !== undefined).map((node) => [node.name, node.hint?.component]),
    ).toEqual([])
  })

  it('gives a text that holds a component word as a whole word no row and no hint of 1', async () => {
    const {got, rows} = await measured({
      on: kit,
      page: 'drift-hand',
      link: 'https://www.figma.com/design/ItFixtureKey/x?node-id=12-1',
      document: documentOf({
        id: '12:1',
        children: [
          namedBox({id: '12:3', name: 'Header', y: 40}),
          namedBox({id: '12:4', name: 'Part', y: 160}),
          namedText({id: '12:2', text: '96K sold so far', y: 280}),
        ],
      }),
    })
    const hint = got.nodes.find((node) => node.id === '12:2')?.hint
    expect([hint === undefined || hint.confidence < 1, rows.filter((row) => row[1] === 'Far')]).toEqual([true, []])
  })

  it('gives an instance of a kit component a hint of 1 and no row in a host of another framework', async () => {
    const {got, rows} = await measured({
      on: kit,
      page: 'drift-hand',
      link: 'https://www.figma.com/design/ItFixtureKey/x?node-id=13-1',
      document: documentOf({
        id: '13:1',
        children: [namedBox({id: '13:2', name: 'Profile', y: 40, type: 'INSTANCE', componentId: '91:1'})],
        components: {'91:1': {name: 'Avatar'}},
      }),
    })
    const hint = got.nodes.find((node) => node.id === '13:2')?.hint
    expect([hint?.component, hint?.confidence, rows]).toEqual(['Avatar', 1, []])
  })
})

describe('a component row where the component can be used', () => {
  const opened: Array<() => Promise<void>> = []

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((close) => close()))
  })

  async function rowsAt(input: {component: string; layer: string; source: string}) {
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
    const config = CatalogSchemas.CatalogConfig.parse({})
    const rows = createComponentRows({catalog, hinters: [createNameVariantHinter()], config, cwd: HOST_ROOT})
    const box = {x: 0, y: 0, w: 200, h: 48}
    const node: DesignNode = {
      id: '20:2',
      hash: '20:2',
      box,
      kind: 'box',
      border: null,
      radius: 0,
      figma: {
        type: 'INSTANCE',
        name: input.layer,
        component: input.component,
        absolute: false,
        mode: null,
        box,
        fields: {},
      },
      children: [],
    }
    const design: Design = {
      id: 'used',
      source: {kind: 'figma', ref: 'ItFixtureKey/20:1'},
      viewport: {width: 1280, height: 720},
      scale: 1,
      root: {
        id: '20:1',
        hash: '20:1',
        box: {x: 0, y: 0, w: 1280, h: 720},
        kind: 'box',
        border: null,
        radius: 0,
        children: [node],
      },
    }
    const [file = '', line = '0', column = '0'] = input.source.split(':')
    const site: IdNode = {
      id: 'site',
      dom: [],
      cssom: [],
      src: {at: {file, line: Number(line), column: Number(column)}, element: 'div', classes: [], parent: null},
      fom: [{nodeId: node.id, instance: null, confidence: 1, margin: 1, round: 1}],
      children: [],
    }
    const related = await catalog.componentOf(input.source)
    const listed = await rows.rows({
      design,
      reads: readIds({root: site, live: null}),
      relation: new Map(related === null ? [] : [[node.id, related]]),
    })
    return listed.map((row) => [row.node, row.component, row.specifier, row.text])
  }

  it('lists a kit instance drawn by hand in a file of the kit framework, with the import line that file writes', async () => {
    expect(await rowsAt({component: 'Avatar', layer: 'Profile', source: `${CARD_SOURCE}:12:3`})).toEqual([
      [
        '20:2',
        'Avatar',
        '@conciv/ui-kit-system',
        "Profile is drawn by hand; the design names `Avatar` (`import {Avatar} from '@conciv/ui-kit-system'`)",
      ],
    ])
  })

  it('lists no row for a kit Button inside a project component that renders the kit Button', async () => {
    expect(await rowsAt({component: 'Button', layer: 'Button', source: `${CARD_SOURCE}:12:3`})).toEqual([])
  })
})
