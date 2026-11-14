import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {PNG} from 'pngjs'
import {afterAll, afterEach, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {closeHomeDb, openHomeDb} from '@conciv/db'
import {makeExtRpcClient} from '@conciv/extension'
import type {XrayRouter} from '@conciv/extension-design/server'
import type {Design, DesignNode, IdNode} from '@conciv/extension-design/defs'
import {DESIGN_TOOLS} from '@conciv/extension-design/design-tools'
import {readIds} from '../../extensions/design/src/shared/id-tree.js'
import {walk} from '../../extensions/design/src/shared/tree.js'
import {openStore} from '../../extensions/design/src/server/runs/open-store.js'
import {storeTables} from '../../extensions/design/src/server/runs/store-tables.js'
import {createViteOxcSource} from '../../extensions/design/src/server/catalog/vite-oxc-source.js'
import {createCatalog} from '../../extensions/design/src/server/catalog/catalog.js'
import {createComponentRows} from '../../extensions/design/src/server/catalog/component-rows.js'
import {createNameVariantHinter} from '../../extensions/design/src/server/catalog/name-variant-hinter.js'
import {CatalogSchemas} from '../../extensions/design/src/shared/catalog-defs.js'
import {bootDesignHost} from './fixtures/design/boot.js'
import {figmaFrame} from './fixtures/design/figma-frame.js'
import {cardsDesign} from './fixtures/design/cards.js'

const HOST_ROOT = fileURLToPath(new URL('fixtures/design/host/', import.meta.url))
const PLUGIN_ROOT = fileURLToPath(new URL('fixtures/design/plugin-only/', import.meta.url))
const CARD_SOURCE = 'packages/extensions/design/src/xray/card.tsx'

const [, checkDef] = DESIGN_TOOLS

type Checked = Exclude<z.output<NonNullable<typeof checkDef.outputSchema>>, {variants: unknown}>
type Kit = Awaited<ReturnType<typeof bootDesignHost>>
const VariantsSchema = z.object({
  variants: z.array(
    z.object({
      width: z.number(),
      reflow: z.object({widths: z.array(z.object({width: z.number()}))}),
      rows: z.array(z.object({text: z.string(), magnitude: z.string(), width: z.number().optional()})),
    }),
  ),
})

const kit = await bootDesignHost()
const {call} = kit
const xrayRpc = makeExtRpcClient<XrayRouter>(kit.apiBase, 'design')

afterAll(() => kit.dispose())

function fixture(file: string): string {
  return fileURLToPath(new URL(`fixtures/design/${file}`, import.meta.url))
}

async function sliced(name: string, node: string): Promise<{figma: string; document: unknown; image: string}> {
  return {
    figma: `https://www.figma.com/design/ItFixtureKey/x?node-id=${node}`,
    document: JSON.parse(await readFile(fixture(`${name}.json`), 'utf8')),
    image: fixture(`${name}.png`),
  }
}

function blankPng(input: {width: number; height: number}): Uint8Array {
  const png = new PNG({width: input.width, height: input.height})
  png.data.fill(255)
  return new Uint8Array(PNG.sync.write(png))
}

function roundOf(checked: Checked): Exclude<Checked, {unsettled: true} | {compile: unknown} | {thrown: unknown}> {
  if ('unsettled' in checked || 'compile' in checked || 'thrown' in checked)
    throw new Error(`no round: ${JSON.stringify(checked)}`)
  return checked
}

describe('design_check on the cards page', () => {
  it('gives each row the design value and the page value, in the check and in the status', async () => {
    await kit.goto('target')
    await call('design_get', await cardsDesign(kit.targetsDir))
    const told = (rows: ReturnType<typeof roundOf>['rows']) =>
      rows
        .filter((row) => ['much', 'noticeably', 'paint'].includes(row.magnitude))
        .map((row) => `${row.node} ${row.kind}: ${String(row.expected)} expected, ${String(row.actual)} found`)
    const checked = told(roundOf(await call('design_check', {})).rows)
    expect([checked.length > 0, checked.filter((line) => line.includes('undefined'))]).toEqual([true, []])
    expect(told((await call('design_status', {})).rows)).toEqual(checked)
  })

  it('measures the page its code renders, not what the user opened in the tab', async () => {
    await kit.goto('filters')
    await call('design_get', await cardsDesign(kit.targetsDir))
    const closed = roundOf(await call('design_check', {}))
    await kit.page.getByText('Filters').click()
    const opened = roundOf(await call('design_check', {}))
    expect(opened.rows.map((row) => row.text)).toEqual(closed.rows.map((row) => row.text))
  })

  it('names the media query whose rule sets the measured value', async () => {
    await kit.goto('media-height')
    await call('design_get', await cardsDesign(kit.targetsDir))
    const checked = roundOf(await call('design_check', {}))
    expect(
      checked.rows
        .filter((row) => row.node === '1:2' && row.property === 'height')
        .map((row) => row.text.includes('set by @media') && row.text.includes('40rem')),
    ).toEqual([true])
  })

  it('names the route it measured and sends the agent to no other route when the design names its route', async () => {
    await kit.goto('target')
    await call('design_get', {...(await cardsDesign(kit.targetsDir)), route: '/?variant=empty'})
    const checked = await call('design_check', {})
    const reasons = 'reasons' in checked ? checked.reasons : []
    expect([
      reasons.some((line) => line.includes('/?variant=empty')),
      reasons.filter((line) => line.includes('route set to')),
    ]).toEqual([true, []])
  })
})

describe('a Figma line', () => {
  it('keeps the check from done while the page draws no line, and takes a visible border on that side as the line', async () => {
    await kit.goto('input-field')
    await call('design_get', await sliced('input-field', '100-1418'))
    const bare = roundOf(await call('design_check', {}))
    await kit.goto('input-field-line')
    const lined = roundOf(await call('design_check', {}))
    await kit.goto('input-field-box')
    const boxed = roundOf(await call('design_check', {}))
    expect([
      bare.verdict,
      bare.coverage.missing.includes('100:1422'),
      bare.reasons.some((reason) => reason.includes('100:1422')),
      lined.coverage.missing.includes('100:1422'),
      boxed.coverage.missing.includes('100:1422'),
    ]).toEqual(['not yet', true, true, false, false])
  })

  it('counts as drawn by a sibling border on its edge or by its own 1px element', async () => {
    await kit.goto('process-row')
    await call('design_get', await sliced('process-row', '50-876'))
    const bordered = roundOf(await call('design_check', {}))
    await kit.goto('process-row-boxed')
    const element = roundOf(await call('design_check', {}))
    await kit.goto('input-field-rule')
    await call('design_get', await sliced('input-field', '100-1418'))
    const ruled = roundOf(await call('design_check', {}))
    expect([
      bordered.coverage.missing.includes('50:883'),
      element.coverage.missing.includes('50:883'),
      ruled.coverage.missing.includes('100:1422'),
    ]).toEqual([false, false, false])
  })
})

describe('a Figma stroke drawn inside the box', () => {
  it('is told as inside, and an outline inset by its weight or an inset box-shadow draws it', async () => {
    const borderRows = async () =>
      roundOf(await call('design_check', {}))
        .rows.filter((row) => row.node === '100:1418' && row.property === 'border')
        .map((row) => row.text)
    await kit.goto('input-field-bare')
    const got = await call('design_get', await sliced('input-field', '100-1418'))
    const bare = await borderRows()
    await kit.goto('input-field-outline')
    const outlined = await borderRows()
    await kit.goto('input-field-shadow')
    const shadowed = await borderRows()
    expect([
      got.nodes.find((node) => node.id === '100:1418')?.strokeAlign,
      got.rules.some((rule) => rule.includes('outline-offset')),
      bare,
      outlined,
      shadowed,
    ]).toEqual(['INSIDE', true, ['wrong border at [100:1418]: 1px #262626 inside expected, none found'], [], []])
  })
})

describe('a text field', () => {
  it('shows its placeholder as the design text it stands for, in the placeholder colour', async () => {
    await kit.goto('input-field-input')
    await call('design_get', await sliced('input-field', '100-1418'))
    const checked = roundOf(await call('design_check', {}))
    expect([
      checked.coverage.missing.includes('100:1421'),
      checked.rows.filter((row) => row.node === '100:1421' && row.text.includes('text color')).map((row) => row.text),
    ]).toEqual([false, []])
  })
})

describe('a media query on the page', () => {
  it('adds its widths, nested ones too, and an edit that lands while the check measures is in every width', async () => {
    const stylesFile = fileURLToPath(new URL('fixtures/design/host/src/styles.css', import.meta.url))
    await kit.goto('late-font')
    await call('design_get', await cardsDesign(kit.targetsDir))
    const told = (checked: Checked) => roundOf(checked).rows.map((row) => row.text)
    const reflowFont = kit.page.waitForRequest((request) => request.url().includes('/slow/fonts/'))
    const styles = await readFile(stylesFile, 'utf8')
    const during = call('design_check', {})
    try {
      await reflowFont
      await writeFile(stylesFile, `${styles}\n#root section {\n  height: 600px !important;\n}\n`)
      const checked = await during
      expect(roundOf(checked).reflow.widths.map((entry) => entry.width)).toContain(899)
      const after = told(await call('design_check', {}))
      expect([after.some((text) => text.includes('box taller than the design')), told(checked)]).toEqual([true, after])
    } finally {
      await writeFile(stylesFile, styles)
    }
    await kit.goto('media-height')
    await call('design_get', await cardsDesign(kit.targetsDir))
    expect(roundOf(await call('design_check', {})).reflow.widths.map((entry) => entry.width)).toContain(640)
  })
})

describe('an idle page while files outside the page change', () => {
  it('is measured once as a database beside it changes, and with no tab the check says to bind one', async () => {
    const stateDir = fileURLToPath(new URL('fixtures/design/host/.conciv-idle/', import.meta.url))
    await mkdir(stateDir, {recursive: true})
    const stateFile = join(stateDir, 'state.db')
    await writeFile(stateFile, '0')
    await kit.goto('target')
    await call('design_get', await cardsDesign(kit.targetsDir))
    const writes = {count: 0, running: true}
    const writing = (async () => {
      while (writes.running) {
        writes.count += 1
        await writeFile(stateFile, String(writes.count))
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    })()
    try {
      const checked = roundOf(await call('design_check', {}))
      writes.running = false
      await kit.page.goto('about:blank')
      const unbound = await call('design_check', {}).then(
        () => 'answered',
        (error: unknown) => String(error),
      )
      expect([checked.verdict.length > 0, writes.count > 1, unbound.includes('use_tab')]).toEqual([true, true, true])
    } finally {
      writes.running = false
      await writing
      await rm(stateDir, {recursive: true, force: true})
      await kit.goto('target')
    }
  })
})

describe('a Figma effect', () => {
  it('is carried into the design and flagged when the page leaves it out', async () => {
    const effectRows = async () =>
      roundOf(await call('design_check', {}))
        .rows.filter((row) => row.property === 'effect')
        .map((row) => row.text)
    await kit.goto('logo-tile')
    const got = await call('design_get', await sliced('logo-tile', '100-1683'))
    const glowing = await effectRows()
    await kit.goto('logo-tile-flat')
    const flat = await effectRows()
    expect([got.nodes.find((node) => node.id === '100:1683')?.effects, glowing, flat]).toEqual([
      [{type: 'inner-shadow', color: '#ffffff', opacity: 0.5, x: 0, y: 0, blur: 14, spread: 6}],
      [],
      ['wrong effect at [100:1683]: inner shadow 0 0 14px 6px #ffffff at 50% expected, none found'],
    ])
  })
})

describe('a Figma wrapper that draws nothing', () => {
  it('is not required when the page merges it into its children', async () => {
    await kit.goto('process-row')
    await call('design_get', await sliced('process-row', '50-876'))
    const checked = roundOf(await call('design_check', {}))
    expect(checked.reasons.filter((reason) => reason.includes('required nodes'))).toEqual([])
  })
})

describe('a page that drifts from the design', () => {
  it('is told where the drift starts when its 1px lines take space, from 3 px, and those lines match their crops', async () => {
    await kit.goto('process-column-flat')
    const got = await call('design_get', await sliced('process-column', '100-1535'))
    const rows = async () => roundOf(await call('design_check', {})).rows
    const told = (listed: Awaited<ReturnType<typeof rows>>, part: string) =>
      listed.filter((row) => row.text.includes(part)).map((row) => row.text)
    const flat = told(await rows(), 'drifts')
    await kit.goto('process-column')
    const lined = await rows()
    const drifted = told(lined, 'drifts')
    await kit.goto('process-column-screen')
    const screen = told(await rows(), 'drifts')
    await kit.goto('contact-form')
    await call('design_get', await sliced('contact-form', '100-1416'))
    const form = told(await rows(), 'drifts')
    await kit.goto('contact-form-flat')
    const formFlat = told(await rows(), 'drifts')
    await kit.goto('contact-section')
    await call('design_get', await sliced('contact-section', '100-1403'))
    const section = (await rows()).filter((row) => ['100:1415', '100:1416'].includes(row.node))
    expect([
      flat,
      drifted.map((text) => text.split('; ')[0]),
      drifted.some((text) => text.includes('below Line [100:1615]')),
      got.nodes.find((node) => node.id === '100:1615')?.asset,
      told(lined, 'wrong image'),
      screen,
      form.map((text) => text.split('; ')[0]),
      formFlat,
      section.map((row) => `${row.node} ${row.selector}`),
    ]).toEqual([
      [],
      ['the page drifts from the design: Card [100:1675] sits 7 px lower on the page than in the frame'],
      true,
      '/design/100-1615.png',
      [],
      [],
      ['the page drifts from the design: Button [100:1466] sits 3 px lower on the page than in the frame'],
      [],
      [],
    ])
  })
})

describe('a page between two frames', () => {
  it('is checked at its own breakpoints that fall between the frames', async () => {
    const document = async (file: string): Promise<unknown> => JSON.parse(await readFile(fixture(file), 'utf8'))
    await kit.goto('hero-gap')
    await call('design_get', {
      figma: [
        'https://www.figma.com/design/ItFixtureKey/x?node-id=100-1480',
        'https://www.figma.com/design/ItFixtureKey/x?node-id=100-1170',
      ],
      document: [await document('hero-390.json'), await document('hero-1440.json')],
      image: [fixture('hero-390.png'), fixture('hero-1440.png')],
    })
    const between = async () =>
      VariantsSchema.parse(await call('design_check', {})).variants.map((variant) =>
        variant.rows.filter((row) => row.magnitude === 'reflow' && row.width !== variant.width).map((row) => row.text),
      )
    const broken = await between()
    await kit.goto('hero-gap-fit')
    const fitted = await between()
    expect([broken, fitted]).toEqual([
      [
        [],
        [
          'frame Text Container [100:1480] at 600 wide: the page scrolls sideways; nothing may be wider than the page',
          'text Heading [100:1481] at 600 wide: sticks out of the page; keep it inside the page width',
          'text Paragraph [100:1482] at 600 wide: sticks out of the page; keep it inside the page width',
        ],
      ],
      [[], []],
    ])
  })
})

describe('a page that switches layouts between two frames', () => {
  it('is flagged when it keeps the narrow layout past the midpoint, and an image row names the picture shown', async () => {
    const document = async (file: string): Promise<unknown> => JSON.parse(await readFile(fixture(file), 'utf8'))
    await kit.goto('contact-bar')
    await call('design_get', {
      figma: [
        'https://www.figma.com/design/ItFixtureKey/x?node-id=100-1513',
        'https://www.figma.com/design/ItFixtureKey/x?node-id=100-1155',
      ],
      document: [await document('contact-bar-390.json'), await document('contact-bar-1440.json')],
      image: [fixture('contact-bar-390.png'), fixture('contact-bar-1440.png')],
    })
    const jumped = async () =>
      VariantsSchema.parse(await call('design_check', {})).variants.flatMap((variant) =>
        variant.rows.filter((row) => row.text.includes('lays its children out')).map((row) => row.text),
      )
    const late = await jumped()
    await kit.goto('contact-bar-fit')
    const early = await jumped()
    await kit.goto('contact-bar-stacked')
    const stacked = await jumped()
    await kit.goto('contact-bar-picture')
    const pictured = VariantsSchema.parse(await call('design_check', {})).variants.flatMap((variant) =>
      variant.rows.filter((row) => row.text.startsWith('wrong image')).map((row) => row.text),
    )
    expect([late, early, stacked, pictured]).toEqual([
      [
        'frame Sub Container [100:1514] at 1199 wide: lays its children out in a column as the 358 px frame does, though 1199 is nearer the 1280 px frame, which lays them out in a row; switch to the 358 px layout below 819',
      ],
      [],
      late,
      [
        'wrong image at [100:1158]: /design/100-1158.png expected, <img src=/late/design/4-30.svg>',
        'wrong image at [100:1162]: /design/100-1162.png expected, <img src=/late/design/4-30.svg>',
        'wrong image at [100:1166]: /design/100-1166.png expected, <img src=/late/design/4-30.svg>',
        'wrong image at [100:1516]: /design/100-1516.png expected, an image /late/design/4-30.svg',
        'wrong image at [100:1520]: /design/100-1520.png expected, an image /late/design/4-30.svg',
        'wrong image at [100:1524]: /design/100-1524.png expected, an image /late/design/4-30.svg',
      ],
    ])
  })
})

describe('an image node drawn as a box with its icon inside', () => {
  it('passes when the drawn element looks like the asset, whatever the file is named, and each button keeps its icon', async () => {
    await kit.goto('check-row')
    await call('design_get', await sliced('check-row', '83-30723'))
    const imageRows = async () =>
      roundOf(await call('design_check', {}))
        .rows.filter((row) => row.property === 'image')
        .map((row) => row.text)
    const drawn = await imageRows()
    await kit.goto('check-row-wrong')
    const wrong = await imageRows()
    const buttons = await call('design_get', await sliced('social-buttons', '83-30209'))
    expect([drawn, wrong, buttons.nodes.flatMap((node) => (node.asset === undefined ? [] : [node.asset]))]).toEqual([
      [],
      ['wrong image at [119:119]: /design/119-119.png expected, an image /design/4-30.svg'],
      ['/design/83-30210.png', '/design/83-30213.png', '/design/83-30216.png'],
    ])
  })
})

describe('a Figma frame stroked on one side', () => {
  it('is told with its side weights, and a box stroked all round is flagged', async () => {
    const borderRows = async () =>
      roundOf(await call('design_check', {}))
        .rows.filter((row) => row.node === '50:880' && row.property === 'border')
        .map((row) => row.text)
    await kit.goto('process-row')
    const got = await call('design_get', await sliced('process-row', '50-876'))
    const underlined = await borderRows()
    await kit.goto('process-row-boxed')
    const boxed = await borderRows()
    expect([got.nodes.find((node) => node.id === '50:880')?.individualStrokeWeights, underlined, boxed]).toEqual([
      {top: 0, right: 0, bottom: 1, left: 0},
      [],
      [
        'wrong border at [50:880]: 1px #262626 inside on bottom expected, 1px #262626 on top, right, bottom, left found',
      ],
    ])
  })
})

describe('a thin Figma bar', () => {
  it('pairs a 3px bar drawn at its design height', async () => {
    await kit.goto('range-slider')
    await call('design_get', await sliced('range-slider', '100-1449'))
    const checked = roundOf(await call('design_check', {}))
    expect([
      checked.coverage.missing.includes('100:1455'),
      checked.rows.filter((row) => row.node === '100:1455').map((row) => row.text),
    ]).toEqual([false, []])
  })
})

describe('a check in a new run of the same project', () => {
  it('numbers its rounds from 1, with no round of the run before', async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), 'conciv-design-runs-state-'))
    const homeDir = await mkdtemp(join(tmpdir(), 'conciv-design-runs-home-'))
    const checks = (input: {on: Kit; pages: string[]}) =>
      input.pages.reduce<Promise<number[]>>(async (done, page) => {
        const rounds = await done
        await input.on.goto(page)
        return [...rounds, roundOf(await input.on.call('design_check', {})).round]
      }, Promise.resolve([]))
    const first = await bootDesignHost({stateRoot, homeDir})
    try {
      await first.goto('target')
      await first.call('design_get', await cardsDesign(first.targetsDir))
      expect(await checks({on: first, pages: ['target', 'shifted']})).toEqual([1, 2])
    } finally {
      await first.dispose()
    }
    const second = await bootDesignHost({stateRoot, homeDir})
    try {
      expect(await checks({on: second, pages: ['target']})).toEqual([1])
    } finally {
      await second.dispose()
      await Promise.all([stateRoot, homeDir].map((dir) => rm(dir, {recursive: true, force: true})))
    }
  })
})

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

  it('reads the component rows of the running run from lost_components', async () => {
    await componentRows({on: kit, page: 'drift-hand'})
    const runIds = z
      .array(z.object({run: z.number()}))
      .parse(
        await kit.rpc.db
          .read({from: 'design_stored_runs', where: `session == "${kit.session}"`, select: fields('run')})
          .then((page) => page.results),
      )
      .map((row) => row.run)
    const runId = Math.max(0, ...runIds)
    const {results: rows} = await kit.rpc.db.read({
      from: 'design_lost_components',
      where: `component == "Chip" && run == ${runId}`,
      select: fields('node', 'component', 'specifier'),
    })
    expect(new Set(rows.map((row) => JSON.stringify(row)))).toEqual(
      new Set([JSON.stringify({node: '10:2', component: 'Chip', specifier: './Chip.tsx'})]),
    )
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
        .object({results: z.array(z.record(z.string(), z.unknown()))})
        .parse(
          await kit.rpc.registry.call({
            name: 'design_query',
            input: {
              ...input,
              select: fields(...input.select),
              where: `target == "${got.target}" && round == ${checked.round} && node == "18:2"`,
            },
          }),
        )
        .results.map((row) => input.select.map((field) => row[field]))
    const layers = await xrayRpc.xray.layers({id: got.target, round: checked.round})
    const placed = layers === null ? [] : [...walk(layers.root)].flatMap(({node}) => node.fom)
    const app = (await readFile(join(HOST_ROOT, 'src/App.tsx'), 'utf8')).split('\n')
    const site = `src/App.tsx:${app.findIndex((line) => line.includes('data-conciv-key="kItPlA"')) + 1}`
    expect([
      await read({from: 'node_components', select: ['node', 'source']}),
      await read({from: 'fom', select: ['node', 'id', 'site']}),
      placed.find((entry) => entry.nodeId === '18:2')?.component?.name,
    ]).toEqual([[['18:2', site]], [['18:2', 'kItPlA', site]], 'Pill'])
  })

  describe('a kit root that carries only its call site', () => {
    const SITE_LINK = 'https://www.figma.com/design/ItFixtureKey/x?node-id=19-1'
    const SITE_DOCUMENT = documentOf({
      id: '19:1',
      children: [namedBox({id: '19:2', name: 'Tag', y: 40}), namedBox({id: '19:3', name: 'Marker', y: 160})],
    })

    async function siteRounds(pages: string[], edit: () => Promise<void> = async () => {}) {
      await kit.goto(pages[0] ?? '')
      const image = join(kit.targetsDir, 'site-figma.png')
      await writeFile(image, blankPng({width: 1280, height: 720}))
      const got = await call('design_get', {figma: SITE_LINK, image, document: SITE_DOCUMENT})
      return pages.reduce<Promise<{layers: unknown[][]; rows: unknown[][]}[]>>(async (earlier, page, index) => {
        const listed = await earlier
        if (index > 0) await edit()
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
    it('lists the row for a kit component the page lost after an edit moved every line of the file that called it', async () => {
      const file = join(HOST_ROOT, 'src/SitePage.tsx')
      const source = await readFile(file, 'utf8')
      try {
        const rounds = await siteRounds(['site-kit', 'site-hand'], () => writeFile(file, `\n\n\n${source}`))
        expect(rounds.map((round) => round.rows.map((row) => [row[0], row[1]]))).toEqual([[], [['19:3', 'Badge']]])
      } finally {
        await writeFile(file, source)
      }
    })

    it('lists no row while the call site of a kit component stands and its pairing moved to a sibling, and the row once the call is gone', async () => {
      expect((await siteRounds(['site-kit', 'site-moved', 'site-hand'])).map((round) => round.rows)).toEqual([
        [],
        [],
        [
          [
            '19:3',
            'Badge',
            './ui-kit/Badge.tsx',
            "Marker was rendered by `Badge` and is now drawn by hand (`import {Badge} from './ui-kit/Badge.tsx'`)",
          ],
        ],
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
    const store = openStore(homeDir)
    const db = {orm: store.orm, tables: storeTables}
    opened.push(async () => {
      closeHomeDb(home)
      store.close()
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

function fields(...names: string[]): string {
  return `{${names.map((name) => `"${name}": ${name}`).join(', ')}}`
}
