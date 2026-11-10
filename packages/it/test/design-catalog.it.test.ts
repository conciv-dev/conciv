import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {PNG} from 'pngjs'
import {afterAll, afterEach, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {closeHomeDb, extensionTable, openDb, openHomeDb} from '@conciv/db'
import {makeExtRpcClient} from '@conciv/extension'
import type {XrayRouter} from '@conciv/extension-design/server'
import {DESIGN_TOOLS, type Design, type DesignNode, type IdNode} from '@conciv/extension-design/defs'
import {readIds} from '../../extensions/design/src/shared/id-tree.js'
import {walk} from '../../extensions/design/src/shared/tree.js'
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
const PLUGIN_ROOT = fileURLToPath(new URL('fixtures/design/plugin-only/', import.meta.url))
const CARD_SOURCE = 'packages/extensions/design/src/xray/card.tsx'

const [, checkDef] = DESIGN_TOOLS

type Checked = Exclude<z.output<NonNullable<typeof checkDef.outputSchema>>, {variants: unknown}>
type Kit = Awaited<ReturnType<typeof bootDesignHost>>

const kit = await bootDesignHost()
const {call} = kit
const xrayRpc = makeExtRpcClient<XrayRouter>(kit.apiBase, 'design')

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

  function pillRow(frame: number) {
    return [
      `${frame}:2`,
      'Pill',
      './ui-kit/Pill.tsx',
      "Tag was rendered by `Pill` and is now drawn by hand (`import {Pill} from './ui-kit/Pill.tsx'`)",
    ]
  }

  async function roundsAcross(input: {on: Kit; frame: number; pages: string[]}) {
    const {on, frame} = input
    await on.goto(input.pages[0] ?? '')
    const image = join(on.targetsDir, 'kit-figma.png')
    await writeFile(image, blankPng({width: 1280, height: 720}))
    await on.call('design_get', {
      figma: `https://www.figma.com/design/ItFixtureKey/x?node-id=${frame}-1`,
      image,
      document: documentOf({id: `${frame}:1`, children: [namedBox({id: `${frame}:2`, name: 'Tag', y: 40})]}),
    })
    return input.pages.reduce<Promise<unknown[][][]>>(async (earlier, page, index) => {
      const listed = await earlier
      if (index > 0) await on.goto(page)
      const checked = roundOf(await on.call('design_check', {}))
      const rows = checked.rows
        .filter((row) => row.magnitude === 'component')
        .map((row) => [row.node, row.component, row.specifier, row.text])
      return [...listed, rows]
    }, Promise.resolve([]))
  }

  it('lists a node the kit rendered last round and the page now draws by hand as one component row, none once restored', async () => {
    expect(await roundsAcross({on: kit, frame: 14, pages: ['drift-kit', 'drift-hand', 'drift-kit']})).toEqual([
      [],
      [pillRow(14)],
      [],
    ])
  })

  it('credits the node paired to the root of a kit component that stamps nothing to the component written at its call site', async () => {
    await kit.goto('drift-kit')
    const image = join(kit.targetsDir, 'kit-figma.png')
    await writeFile(image, blankPng({width: 1280, height: 720}))
    const got = await call('design_get', {
      figma: 'https://www.figma.com/design/ItFixtureKey/x?node-id=18-1',
      image,
      document: documentOf({id: '18:1', children: [namedBox({id: '18:2', name: 'Tag', y: 40})]}),
    })
    const checked = roundOf(await call('design_check', {}))
    const read = async (input: {from: string; select: string[]}) =>
      z
        .array(z.record(z.string(), z.unknown()))
        .parse(
          await kit.rpc.registry.call({
            name: 'design_query',
            input: {...input, where: `target == "${got.target}" && round == ${checked.round} && node == "18:2"`},
          }),
        )
        .map((row) => input.select.map((field) => row[field]))
    const layers = await xrayRpc.xray.layers({id: got.target, round: checked.round})
    const placed = layers === null ? [] : [...walk(layers.root)].flatMap(({node}) => node.fom)
    expect([
      await read({from: 'node_components', select: ['node', 'source']}),
      await read({from: 'fom', select: ['node', 'id', 'site']}),
      placed.find((entry) => entry.nodeId === '18:2')?.component?.name,
    ]).toEqual([[['18:2', 'src/App.tsx:159']], [['18:2', 'kItPlA', 'src/App.tsx:159']], 'Pill'])
  })

  describe('a kit root that carries only its call site', () => {
    const SITE_LINK = 'https://www.figma.com/design/ItFixtureKey/x?node-id=19-1'
    const SITE_DOCUMENT = documentOf({
      id: '19:1',
      children: [namedBox({id: '19:2', name: 'Tag', y: 40}), namedBox({id: '19:3', name: 'Marker', y: 160})],
    })

    async function siteRounds(pages: string[]) {
      await kit.goto(pages[0] ?? '')
      const image = join(kit.targetsDir, 'site-figma.png')
      await writeFile(image, blankPng({width: 1280, height: 720}))
      const got = await call('design_get', {figma: SITE_LINK, image, document: SITE_DOCUMENT})
      return pages.reduce<Promise<{layers: unknown[][]; rows: unknown[][]}[]>>(async (earlier, page, index) => {
        const listed = await earlier
        if (index > 0) await kit.goto(page)
        const checked = roundOf(await call('design_check', {}))
        const layers = await xrayRpc.xray.layers({id: got.target, round: checked.round})
        const placed =
          layers === null
            ? []
            : [...walk(layers.root)].flatMap(({node}) =>
                node.fom.map((entry: IdNode['fom'][number]) => ({node, entry})),
              )
        return [
          ...listed,
          {
            layers: placed
              .filter(({entry}) => entry.nodeId === '19:2' || entry.nodeId === '19:3')
              .map(({node, entry}) => [entry.nodeId, node.id, entry.component?.name])
              .toSorted((a, b) => String(a[0]).localeCompare(String(b[0]))),
            rows: checked.rows
              .filter((row) => row.magnitude === 'component')
              .map((row) => [row.node, row.component, row.specifier, row.text]),
          },
        ]
      }, Promise.resolve([]))
    }

    it('makes the roots of two kit components with no key nodes, paired and credited, and lists the one the page then draws by hand', async () => {
      expect(await siteRounds(['site-kit', 'site-hand'])).toEqual([
        {
          layers: [
            ['19:2', 'src/SitePage.tsx:7/0', 'Pill'],
            ['19:3', 'src/SitePage.tsx:8/0', 'Badge'],
          ],
          rows: [],
        },
        {
          layers: [
            ['19:2', 'src/SitePage.tsx:16/0', 'Pill'],
            ['19:3', 'sThBdg', 'SiteHandPage'],
          ],
          rows: [
            [
              '19:3',
              'Badge',
              './ui-kit/Badge.tsx',
              "Marker was rendered by `Badge` and is now drawn by hand (`import {Badge} from './ui-kit/Badge.tsx'`)",
            ],
          ],
        },
      ])
    })
  })

  it('lists no row for a component the page lost while the component is do-not-use, and the row once cleared', async () => {
    const pages = ['drift-kit', 'drift-hand']
    const flagged = await call('design_components', {doNotUse: 'Pill'})
      .then(() => roundsAcross({on: kit, frame: 15, pages}))
      .finally(() => call('design_components', {clear: 'Pill'}))
    expect([flagged, await roundsAcross({on: kit, frame: 16, pages})]).toEqual([
      [[], []],
      [[], [pillRow(16)]],
    ])
  })

  it('lists the row for a component the page lost with catalog hints off', async () => {
    const bare = await bootDesignHost({config: {catalog: {hint: false}}})
    try {
      expect(await roundsAcross({on: bare, frame: 17, pages: ['drift-kit', 'drift-hand']})).toEqual([[], [pillRow(17)]])
    } finally {
      await bare.dispose()
    }
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

  async function catalogAt(cwd: string) {
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
    return createCatalog({home, db, cwd, sources: [createViteOxcSource()]})
  }

  async function rowsAt(input: {component: string; layer: string; source: string}) {
    const catalog = await catalogAt(HOST_ROOT)
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
      earlier: [],
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

  it('matches a stamp to a walked file in one form: a host path that shares the tail of an outside file is not that file', async () => {
    const catalog = await catalogAt(HOST_ROOT)
    const named = async (source: string) => (await catalog.componentOf(source))?.names[0] ?? null
    expect([await named(`${CARD_SOURCE}:12:3`), await named('src/xray/card.tsx:12:3')]).toEqual(['Card', null])
  })

  async function builtKitHost(): Promise<string> {
    const base = await mkdtemp(join(tmpdir(), 'conciv-built-kit-'))
    opened.push(() => rm(base, {recursive: true, force: true}))
    const files: Record<string, string> = {
      'kit/package.json': JSON.stringify({
        name: 'built-chip',
        type: 'module',
        exports: {'.': {types: './dist/x.d.ts', import: './dist/x.js'}},
      }),
      'kit/dist/x.js': "import {k} from './chunk-a1.js'\nexport {k as Chip}\n",
      'kit/dist/chunk-a1.js': "function k(p) {\n  return h('span', p)\n}\nexport {k}\n",
      'kit/dist/x.d.ts': "export {Chip} from './styled/chip.js'\n",
      'kit/dist/styled/chip.d.ts':
        "import type {JSX} from 'solid-js'\nexport declare function Chip(props: {value: string}): JSX.Element\n",
      'host/package.json': JSON.stringify({name: 'built-kit-host', type: 'module'}),
      'host/index.html': '<script type="module" src="/main.tsx"></script>\n',
      'host/main.tsx': 'import {Chip} from \'built-chip\'\nexport function App() {\n  return <Chip value="a" />\n}\n',
    }
    await Promise.all(
      Object.entries(files).map(async ([file, text]) => {
        await mkdir(join(base, file, '..'), {recursive: true})
        await writeFile(join(base, file), text)
      }),
    )
    await mkdir(join(base, 'host/node_modules'), {recursive: true})
    await symlink(join(base, 'kit'), join(base, 'host/node_modules/built-chip'))
    return join(base, 'host')
  }

  it('reads a linked package whose exports point at its dist from its declarations, naming each component as exported', async () => {
    const catalog = await catalogAt(await builtKitHost())
    const listed = (await catalog.list({hidden: true})).filter((component) => component.specifier === 'built-chip')
    expect(listed.map((component) => component.names)).toEqual([['Chip']])
  })

  it('lists the kit Chip the x-ray overlay imports from its built tools entry', async () => {
    const catalog = await catalogAt(HOST_ROOT)
    const tools = (await catalog.list({hidden: true})).filter(
      (component) => component.specifier === '@conciv/ui-kit-chat/tools',
    )
    expect(tools.filter((component) => component.names.includes('Chip')).map((component) => component.names)).toEqual([
      ['Chip'],
    ])
  })

  it('gives a module that imports no framework the framework its tsconfig jsx setting names', async () => {
    const catalog = await catalogAt(HOST_ROOT)
    const page = (await catalog.list({hidden: true})).find((component) => component.names.includes('XrayPage'))
    expect(page?.framework).toBe('react')
  })

  it('gives a module with no framework import and no tsconfig jsx the framework of the vite plugins that reached it', async () => {
    const catalog = await catalogAt(PLUGIN_ROOT)
    const badge = (await catalog.list({hidden: true})).find((component) => component.names.includes('Badge'))
    expect(badge?.framework).toBe('react')
  })
})
