/* oxlint-disable playwright/no-raw-locators, playwright/prefer-web-first-assertions -- the Task 7 cases read the hidden capture frame and the tab field directly */
import {existsSync, readFileSync} from 'node:fs'
import {mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {request as httpRequest} from 'node:http'
import {tmpdir} from 'node:os'
import {isAbsolute, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import react from '@vitejs/plugin-react'
import {differenceCiede2000} from 'culori'
import pixelmatch from 'pixelmatch'
import {chromium, type Browser, type Page} from 'playwright'
import {expect as expectLocator} from 'playwright/test'
import {PNG} from 'pngjs'
import {createServer} from 'vite'
import {afterAll, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {makeRpcClient, ToolCommandSignatureSchema, type RpcClient} from '@conciv/contract'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {EXTENSIONS_ROUTE} from '@conciv/extension-compiler/extensions'
import {awaitPagePlaneSubscribed} from '@conciv/extension-testkit/page-plane'
import type {} from '@conciv/extension-design/client'
import {
  CaptureInputSchema,
  ClearInputSchema,
  DESIGN_GUIDE,
  DESIGN_TOOL_DEFS,
  designVerb,
  diffDef,
  DiffInputSchema,
  StatusInputSchema,
  TargetInputSchema,
  WinnerInputSchema,
  type CaptureResult,
  type ClearResult,
  type DiffReport,
  type StatusReport,
  type TargetResult,
  type WinnerResult,
} from '@conciv/extension-design/defs'
import {mapDeclaration} from '@conciv/extension-design/provenance'
import {glyphCoreColor} from '@conciv/extension-design/colors'
import {destroyPaddle, paddleReader, trimToInk} from '@conciv/extension-design/paddle'
import {groupText} from '@conciv/extension-design/text-groups'
import type {Box, ColorMetric, LiveComponent, Provenance, Raster, TextRun, Winner} from '@conciv/extension-design/types'
import {unplugin} from '../src/plugin-instance.js'
import {renderTargets} from './fixtures/design/render-targets.js'

const HOST_ROOT = fileURLToPath(new URL('fixtures/design/host/', import.meta.url))
const PROVENANCE_DIR = fileURLToPath(new URL('fixtures/design/provenance/', import.meta.url))
const ENDPOINT_FILE = 'dev-endpoint.json'
const PAGE_DRIVER_TIMEOUT_MS = 30_000
const COLOR_DELTA_E = 3
const TILE_GATE = 0.005
const TILE_MARGIN = 8
const HOST_STYLES = join(HOST_ROOT, 'src', 'styles.css')

const CatalogSchema = z.array(ToolCommandSignatureSchema)
const EndpointSchema = z.object({apiBase: z.string().min(1)})

type DesignConfigInput = NonNullable<ConcivConfig['extensions']>['design']

function decodePng(bytes: Buffer): PNG {
  return PNG.sync.read(bytes)
}

type Call = {
  (name: 'design_target', input: z.input<typeof TargetInputSchema>): Promise<TargetResult>
  (name: 'design_diff', input: z.input<typeof DiffInputSchema>): Promise<DiffReport>
  (name: 'design_status', input: z.input<typeof StatusInputSchema>): Promise<StatusReport>
  (name: 'design_capture', input: z.input<typeof CaptureInputSchema>): Promise<CaptureResult>
  (name: 'design_winner', input: z.input<typeof WinnerInputSchema>): Promise<WinnerResult>
  (name: 'design_clear', input: z.input<typeof ClearInputSchema>): Promise<ClearResult>
}

type Kit = {
  rpc: RpcClient
  browser: Browser
  page: Page
  origin: string
  stateRoot: string
  targetsDir: string
  call: Call
  goto: (to: string) => Promise<void>
  dispose: () => Promise<void>
}

function makeCall(rpc: RpcClient): Call {
  function call(name: 'design_target', input: z.input<typeof TargetInputSchema>): Promise<TargetResult>
  function call(name: 'design_diff', input: z.input<typeof DiffInputSchema>): Promise<DiffReport>
  function call(name: 'design_status', input: z.input<typeof StatusInputSchema>): Promise<StatusReport>
  function call(name: 'design_capture', input: z.input<typeof CaptureInputSchema>): Promise<CaptureResult>
  function call(name: 'design_winner', input: z.input<typeof WinnerInputSchema>): Promise<WinnerResult>
  function call(name: 'design_clear', input: z.input<typeof ClearInputSchema>): Promise<ClearResult>
  async function call(name: string, input: Record<string, unknown>): Promise<unknown> {
    const def = DESIGN_TOOL_DEFS.find((candidate) => candidate.name === name)
    if (def?.outputSchema === undefined) throw new Error(`no design tool named ${name}`)
    return def.outputSchema.parse(await rpc.registry.call({name, input}))
  }
  return call
}

const WIDGET_BOOT = `${react.preambleCode.replace('__BASE__', '/')}\nawait import(${JSON.stringify(EXTENSIONS_ROUTE)})`

async function injectWidget(page: Page, apiBase: string): Promise<void> {
  await page.evaluate(
    ({base, entry}) => {
      if (document.querySelector('meta[name="conciv-api-base"]')) return
      const apiMeta = document.createElement('meta')
      apiMeta.name = 'conciv-api-base'
      apiMeta.content = base
      const widgetMeta = document.createElement('meta')
      widgetMeta.name = 'conciv-widget'
      widgetMeta.content = '{}'
      const script = document.createElement('script')
      script.type = 'module'
      script.textContent = entry
      document.head.append(apiMeta, widgetMeta, script)
    },
    {base: apiBase, entry: WIDGET_BOOT},
  )
}

async function boot(options: {config?: DesignConfigInput} = {}): Promise<Kit> {
  const stateRoot = await mkdtemp(join(tmpdir(), 'conciv-design-state-'))
  const devEndpointDir = await mkdtemp(join(tmpdir(), 'conciv-design-endpoint-'))
  const server = await createServer({
    root: HOST_ROOT,
    configFile: false,
    logLevel: 'silent',
    server: {host: '127.0.0.1', port: 0},
    plugins: [
      react(),
      unplugin.vite({
        stateRoot,
        harnessBin: 'true',
        systemPrompt: false,
        devEndpointDir,
        extensions: {design: options.config ?? {}},
      }),
    ],
  })
  await server.listen()
  const local = server.resolvedUrls?.local[0]
  if (local === undefined) throw new Error('the fixture dev server has no local url')
  const origin = new URL(local).origin
  const {apiBase} = EndpointSchema.parse(JSON.parse(await readFile(join(devEndpointDir, ENDPOINT_FILE), 'utf8')))
  const session = (await makeRpcClient(apiBase).sessions.resolve({})).sessionId
  const rpc = makeRpcClient(apiBase, {headers: {[CONCIV_SESSION_HEADER]: session}})
  const browser = await chromium.launch({args: ['--disable-features=LocalNetworkAccessChecks']})
  const targetsDir = await mkdtemp(join(tmpdir(), 'conciv-design-targets-'))
  await renderTargets({browser, dir: targetsDir})
  const page = await browser.newPage({viewport: {width: 1280, height: 720}})
  const goto = (to: string): Promise<void> =>
    awaitPagePlaneSubscribed(page, async () => {
      await page.goto(new URL(to.startsWith('/') ? to : `/?variant=${to}`, origin).href, {
        waitUntil: 'domcontentloaded',
      })
      await injectWidget(page, apiBase)
      await page.waitForFunction(() => '__CONCIV_PAGE_DRIVER__' in window, undefined, {
        timeout: PAGE_DRIVER_TIMEOUT_MS,
      })
    })
  await goto('/')
  return {
    rpc,
    browser,
    page,
    origin,
    stateRoot,
    targetsDir,
    call: makeCall(rpc),
    goto,
    dispose: async () => {
      await browser.close()
      await server.close()
      await rm(stateRoot, {recursive: true, force: true})
      await rm(devEndpointDir, {recursive: true, force: true})
      await rm(targetsDir, {recursive: true, force: true})
    },
  }
}

function target(name: string): string {
  return join(kit.targetsDir, `${name}.png`)
}

function capturePage(xray: string): string {
  const url = new URL(xray)
  return new URL(`capture${url.search}`, url).href
}

function fileUnder(root: string, relative: string): string {
  return isAbsolute(relative) ? relative : join(root, relative)
}

function rawStatus(input: {origin: string; path: string}): Promise<number> {
  const url = new URL(input.origin)
  return new Promise((resolve, reject) => {
    const sent = httpRequest({host: url.hostname, port: url.port, path: input.path}, (response) => {
      response.resume()
      resolve(response.statusCode ?? 0)
    })
    sent.on('error', reject)
    sent.end()
  })
}

const NO_STYLES = {background: '', color: '', fontSize: 0, lineHeight: 0, fontWeight: 0, radius: 0}

function mapFixture(input: {
  file: string
  line: number
  column: number
  property: string
  value: string
  target: number | string
  selector?: string
}): Promise<Provenance> {
  const winner: Winner = {
    selector: input.selector ?? null,
    declaration: `${input.property}: ${input.value}`,
    value: input.value,
    important: false,
    inline: input.selector === undefined,
    inherited: false,
    sheet: {href: null, viteDevId: null, emotion: false, styled: false, adopted: false},
    conditions: [],
    rulePath: input.selector ?? '',
  }
  const component: LiveComponent = {
    source: {file: input.file, line: input.line, column: input.column},
    tag: 'div',
    text: '',
    box: {x: 0, y: 0, w: 0, h: 0},
    textBox: null,
    glyphs: [],
    axis: null,
    styles: NO_STYLES,
    index: 1,
    children: [],
  }
  return mapDeclaration({
    winner,
    component,
    property: input.property,
    target: input.target,
    cwd: PROVENANCE_DIR,
    cssMap: {find: () => null},
  })
}

process.env.LAUNCH_EDITOR = 'true'

const kit = await boot()
const {rpc, browser, page, stateRoot, call, goto} = kit

afterAll(() => kit.dispose())

it('declares six design tools with the flags from the spec', async () => {
  const catalog = CatalogSchema.parse(await rpc.registry.catalog(undefined)).filter((entry) =>
    entry.name.startsWith('design_'),
  )
  expect(catalog.map((entry) => entry.name)).toEqual([
    'design_target',
    'design_diff',
    'design_status',
    'design_capture',
    'design_winner',
    'design_clear',
  ])
  expect(catalog.map((entry) => entry.mutating)).toEqual([true, false, false, false, false, true])
  expect(catalog.every((entry) => entry.category === 'design' && entry.approval === undefined)).toBe(true)
  expect(designVerb('design_diff')).toBe('diff')
  expect(diffDef.inputSchema.parse({})).toEqual({depth: 3, limit: 12})
})

it('registers a PNG target sized by its header, and the same bytes keep their id and decisions', async () => {
  const first = await call('design_target', {image: target('u1-1280')})
  expect(first).toMatchObject({route: '/', width: 1280, height: 720, scale: 1})
  const decisions = fileUnder(stateRoot, `.conciv/design/${first.id}/decisions.json`)
  const decided = JSON.stringify([{id: 'd1', kind: 'pin', anchor: 'text-0', value: null, at: 1}])
  await writeFile(decisions, decided)
  await call('design_target', {image: target('u1-2560'), scale: 2})
  const second = await call('design_target', {image: target('u1-1280'), name: 'invoices'})
  expect(second.id).toBe(first.id)
  expect((await call('design_status', {})).targets.map((t) => t.id)).toEqual([first.id])
  expect(await readFile(decisions, 'utf8')).toBe(decided)
})

it('divides the header width of a retina export by the stated scale', async () => {
  expect(await call('design_target', {image: target('u1-2560'), scale: 2})).toMatchObject({
    width: 1280,
    height: 720,
    scale: 2,
  })
})

it('clear removes a target by id', async () => {
  const retina = await call('design_target', {image: target('u1-2560'), scale: 2})
  expect(await call('design_clear', {target: retina.id})).toEqual({removed: 1})
  expect(existsSync(fileUnder(stateRoot, `.conciv/design/${retina.id}`))).toBe(false)
})

it('captures the live page at the tab width as a 1x PNG with the component tree', async () => {
  await page.setViewportSize({width: 1280, height: 720})
  const result = await call('design_capture', {height: 720})
  const png = decodePng(readFileSync(fileUnder(stateRoot, result.path)))
  expect([png.width, png.height]).toEqual([1280, 720])
  const toolbar = result.components.find((c) => c.source?.file === 'src/Toolbar.tsx')
  expect(toolbar?.source).toEqual({file: 'src/Toolbar.tsx', line: 4, column: 5})
  expect(toolbar?.children.map((c) => c.text)).toEqual(['Export', 'Create'])
  expect(toolbar?.styles.background).toBe('#ffffff')
})

it('captures at the requested height when the width equals the tab width', async () => {
  await page.setViewportSize({width: 1280, height: 720})
  const result = await call('design_capture', {height: 900})
  const png = decodePng(readFileSync(fileUnder(stateRoot, result.path)))
  expect([png.width, png.height]).toEqual([1280, 900])
})

it('stays 1x when the device pixel ratio is 2', async () => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setDeviceMetricsOverride', {width: 1280, height: 720, deviceScaleFactor: 2, mobile: false})
  const result = await call('design_capture', {height: 720})
  expect(decodePng(readFileSync(fileUnder(stateRoot, result.path))).width).toBe(1280)
  await cdp.send('Emulation.clearDeviceMetricsOverride')
})

it('design_target records the live route as a label and the width of the image', async () => {
  expect(await call('design_target', {image: target('u1-1280')})).toMatchObject({route: '/', width: 1280})
})

it('ranks the toolbar first with an inset delta and reports the missing card, never a width', async () => {
  await goto('/')
  await call('design_target', {image: target('u1-1280')})
  const report = await call('design_diff', {})
  expect(report.components[0]?.source).toEqual({file: 'src/Toolbar.tsx', line: 4, column: 5})
  expect(report.components[0]?.deltas).toContainEqual(
    expect.objectContaining({kind: 'inset-right', live: 24, target: 0}),
  )
  expect(report.components.flatMap((c) => c.deltas.map((d) => d.kind))).not.toContain('width')
  expect(report.unmatched).toContainEqual(
    expect.objectContaining({kind: 'extra', source: {file: 'src/Cards.tsx', line: 9, column: 7}}),
  )
  expect(report.diffImage.startsWith('.conciv/design/') || isAbsolute(report.diffImage)).toBe(true)
  expect(existsSync(fileUnder(stateRoot, report.diffImage))).toBe(true)
  expect(report.warnings, 'the table cells render from data; the literals left are headers and Create').toEqual([])
})

it('a recolored toolbar is a background delta and a wider one a fill delta', async () => {
  await goto('recolor')
  const recolored = (await call('design_diff', {})).components[0]?.deltas
  expect(recolored).toContainEqual(expect.objectContaining({kind: 'background', live: '#f5f5f5', target: '#ffffff'}))
  expect(recolored?.map((d) => d.kind).toSorted()).toEqual(['background'])
  await goto('wide')
  expect((await call('design_diff', {})).components[0]?.deltas.map((d) => d.kind).toSorted()).toEqual(['fill'])
})

it('an identical page yields no components and no unmatched', async () => {
  await goto('target')
  const report = await call('design_diff', {})
  expect([report.components, report.unmatched]).toEqual([[], []])
  expect(report.mismatch).toBeLessThan(0.005)
})

it('a page without source attributes returns a hint and no components', async () => {
  await goto('/plain.html')
  await call('design_target', {image: target('plain-1280')})
  const report = await call('design_diff', {})
  expect(report.components).toEqual([])
  expect(report.hint).toContain('data-conciv-source')
})

it('says no target is registered once every target is cleared', async () => {
  await call('design_clear', {all: true})
  await expect(rpc.registry.call({name: 'design_diff', input: {}})).rejects.toMatchObject({code: 'no-target'})
  expect((await call('design_status', {})).targets).toEqual([])
})

it('refuses to diff a target while the tab shows another route, with a route item', async () => {
  await goto('/')
  const registered = await call('design_target', {image: target('u1-1280')})
  await goto('/plain.html')
  const report = await call('design_diff', {})
  expect(report.route).toEqual({live: '/plain.html', target: '/'})
  expect(report.target.id).toBe(registered.id)
  expect(report.components).toEqual([])
})

it('the pixelmatch comparator produces the same ranking as blazediff', async () => {
  const other = await boot({config: {comparator: 'pixelmatch'}})
  try {
    await other.goto('/')
    await other.call('design_target', {image: target('u1-1280')})
    expect((await other.call('design_diff', {})).components[0]?.source?.file).toBe('src/Toolbar.tsx')
  } finally {
    await other.dispose()
  }
})

it('names the winning declaration per property with media, inline, inherited and library sheets', async () => {
  await goto('/')
  const winners = await call('design_winner', {
    selector: '[data-conciv-source="src/Toolbar.tsx:4:5"]',
    properties: ['padding-right', 'padding-left', 'background-color', 'color', 'min-height'],
  })
  expect(winners['padding-right']).toMatchObject({
    selector: '.toolbar',
    conditions: ['@media (min-width: 600px)'],
    important: false,
  })
  expect(winners['padding-left']).toMatchObject({
    selector: '.pl-8',
    sheet: expect.objectContaining({viteDevId: expect.stringContaining('src/styles.css')}),
  })
  expect(winners['background-color']).toMatchObject({inline: true})
  expect(winners['color']).toMatchObject({inherited: true})
  expect(winners['min-height']).toMatchObject({
    selector: '.Lib-toolbar',
    sheet: expect.objectContaining({viteDevId: expect.stringContaining('fixtures/lib/lib.css')}),
  })
})

it('deltas carry provenance: a CSS line, a className token, a library default', async () => {
  const report = await call('design_diff', {})
  const toolbar = report.components[0]
  expect(toolbar).toBeDefined()
  if (toolbar === undefined) return
  expect(toolbar.deltas).toContainEqual(
    expect.objectContaining({
      kind: 'inset-right',
      via: 'css',
      file: 'src/styles.css',
      declaration: 'padding-right: 24px',
    }),
  )
  expect(toolbar.deltas).toContainEqual(
    expect.objectContaining({kind: 'inset-left', via: 'className', file: 'src/Toolbar.tsx', declaration: 'pl-8'}),
  )
  expect(toolbar.deltas.find((d) => d.via === 'library')).toMatchObject({
    selector: '.Lib-toolbar',
    file: 'src/Toolbar.tsx',
    line: 4,
    column: 5,
  })
})

it('inline and sx keys map to the JSX attribute with a spacing suggestion only for literals', async () => {
  expect(
    await mapFixture({file: 'Sx.tsx', line: 12, column: 9, property: 'padding-left', value: '16px', target: 24}),
  ).toEqual({via: 'sx', file: 'Sx.tsx', line: 14, column: 17, declaration: 'p: 2', suggest: 'p: 3'})
  const inlineGap = await mapFixture({
    file: 'Inline.tsx',
    line: 21,
    column: 7,
    property: 'gap',
    value: '8px',
    target: 16,
  })
  expect(inlineGap).toEqual({via: 'style', file: 'Inline.tsx', line: 21, column: 21, declaration: 'gap: 8'})
  expect(
    (
      await mapFixture({
        file: 'Inline.tsx',
        line: 20,
        column: 5,
        property: 'padding-left',
        value: '24px',
        target: 16,
      })
    ).via,
  ).toBe('unknown')
  const fn = await mapFixture({
    file: 'Sx.tsx',
    line: 12,
    column: 9,
    property: 'color',
    value: 'rgb(25, 118, 210)',
    target: '#000000',
  })
  expect(fn).toMatchObject({via: 'sx', line: 13, column: 17})
  expect(fn.suggest).toBeUndefined()
  expect(
    (await mapFixture({file: 'Inline.tsx', line: 20, column: 5, property: 'gap', value: '16px', target: 24})).via,
  ).toBe('unknown')
  expect(
    await mapFixture({
      file: 'Classes.tsx',
      line: 9,
      column: 5,
      property: 'padding-left',
      value: '32px',
      target: 48,
      selector: '.pl-8',
    }),
  ).toMatchObject({via: 'className', line: 9, column: 58, declaration: 'pl-8'})
})

it('a component whose pixels differ without a measured delta is reported and keeps status open', async () => {
  await goto('badge')
  await call('design_target', {image: target('u1-1280')})
  const report = await call('design_diff', {})
  expect(report.components).toContainEqual(
    expect.objectContaining({source: expect.objectContaining({file: 'src/Toolbar.tsx'}), tag: 'header', deltas: []}),
  )
  const status = await call('design_status', {})
  expect(status.done).toBe(false)
  expect(status.targets[0]?.above).toBeGreaterThan(0)
})

it('status flips to done when every width matches', async () => {
  await goto('/')
  await call('design_target', {image: target('u1-1280')})
  await call('design_diff', {})
  expect((await call('design_status', {})).done).toBe(false)
  await goto('target')
  await call('design_diff', {})
  expect(await call('design_status', {})).toMatchObject({
    done: true,
    targets: [expect.objectContaining({width: 1280, above: 0})],
  })
})

it('status reports the current target of the session with its route label', async () => {
  await goto('target')
  const registered = await call('design_target', {image: target('u1-1280')})
  expect(await call('design_status', {})).toMatchObject({
    route: '/',
    targets: [expect.objectContaining({id: registered.id})],
  })
})

it('keeps twenty runs per target besides run 0', async () => {
  await call('design_diff', {})
  const current = (await call('design_status', {})).targets[0]
  expect(current).toBeDefined()
  if (current === undefined) return
  const home = fileUnder(stateRoot, `.conciv/design/${current.id}`)
  const runZero = (await readdir(home)).filter((name) => name.startsWith('result-')).toSorted()[0]
  for (const _ of Array.from({length: 21})) await call('design_diff', {})
  const names = await readdir(home)
  expect(['live-', 'diff-', 'result-'].map((prefix) => names.filter((name) => name.startsWith(prefix)).length)).toEqual(
    [21, 21, 21],
  )
  expect(names).toContain(runZero)
}, 360_000)

it('diffs at 390 through an inert hidden frame and leaves the tab untouched', async () => {
  await goto('/')
  await page.fill('#field', 'typed')
  await call('design_target', {image: target('u1-390')})
  const report = await call('design_diff', {})
  expect(report.target.width).toBe(390)
  expect(report.components.find((c) => c.source?.file === 'src/Cards.tsx')).toBeDefined()
  const frame = page.locator('iframe[data-conciv-capture]')
  expect(await frame.count()).toBe(1)
  expect(await frame.getAttribute('inert')).not.toBeNull()
  expect(await frame.getAttribute('aria-hidden')).toBe('true')
  expect(await frame.getAttribute('tabindex')).toBe('-1')
  expect(
    await frame.evaluate(
      (el) =>
        el instanceof HTMLIFrameElement && el.contentDocument?.querySelector('[data-conciv-script-root]') === null,
    ),
  ).toBe(true)
  expect(await page.inputValue('#field')).toBe('typed')
  await call('design_diff', {})
  expect(await frame.count()).toBe(1)
})

it('a delta present only at 390 is flagged as a breakpoint delta', async () => {
  await goto('mobile-gap')
  await call('design_target', {image: target('u1-1280')})
  await call('design_diff', {})
  await call('design_target', {image: target('u1-390')})
  const mobile = await call('design_diff', {})
  const gap = mobile.components.flatMap((c) => c.deltas).find((d) => d.kind === 'gap-before')
  expect(gap).toMatchObject({breakpoint: true, file: 'src/card.module.css'})
  expect(gap?.declaration).toBe('gap: 16px')
})

it('clear removes the frame', async () => {
  await call('design_clear', {all: true})
  expect(await page.locator('iframe[data-conciv-capture]').count()).toBe(0)
})

it('fails inside the cap with the fallback options when the frame is blocked', async () => {
  await page.route('**/blocked', (route) =>
    route.fulfill({
      status: 200,
      headers: {'content-type': 'text/html', 'x-frame-options': 'DENY'},
      body: '<p>blocked</p>',
    }),
  )
  await goto('/blocked')
  await call('design_target', {image: target('u1-390')})
  const start = Date.now()
  await expect(rpc.registry.call({name: 'design_diff', input: {}})).rejects.toMatchObject({
    message: expect.stringContaining('chromium'),
  })
  expect(Date.now() - start).toBeLessThan(6_000)
  await page.unroute('**/blocked')
})

describe('x-ray page', () => {
  it('a diff report links the x-ray page of its target and the page serves', async () => {
    await goto('target')
    const registered = await call('design_target', {image: target('u1-1280')})
    const report = await call('design_diff', {})
    expect(report.xray).toContain(`/api/ext/design/xray/list?target=${registered.id}`)
    const html = await fetch(report.xray)
    expect(html.status).toBe(200)
    expect(await html.text()).toContain('<script type="module"')
    expect((await fetch(report.xray.replace(registered.id, 'nope'))).status).toBe(404)
  })

  it('serves the run images and refuses paths outside the design dir', async () => {
    const report = await call('design_diff', {})
    const base = new URL(report.xray).origin
    expect((await fetch(`${base}/api/ext/design/files/${report.livePath}`)).headers.get('content-type')).toBe(
      'image/png',
    )
    expect(await rawStatus({origin: base, path: '/api/ext/design/files/../../package.json'})).toBe(404)
    expect(await rawStatus({origin: base, path: '/api/ext/design/files//etc/hosts'})).toBe(404)
  })

  it('renders the rail from the last run and opens the inspector on the first component', async () => {
    await goto('/')
    const report = await call('design_diff', {})
    const [first, second] = report.components
    expect(first?.source).toBeDefined()
    expect(second?.source).toBeDefined()
    if (first?.source === undefined || first.source === null) return
    if (second?.source === undefined || second.source === null) return
    const xray = await browser.newPage()
    await xray.goto(report.xray)
    const row = xray.getByRole('listitem').first()
    await row.waitFor()
    expect(await row.textContent()).toContain(first.source.file)
    const inspector = xray.getByRole('region', {name: 'component'})
    await inspector.waitFor()
    expect(await inspector.textContent()).toContain(first.source.file)
    await xray.keyboard.press('j')
    await expectLocator(inspector).toContainText(second.source.file)
    await xray.close()
  })

  it('renders one row per component with one badge per delta', async () => {
    await goto('/')
    const report = await call('design_diff', {})
    const [first] = report.components
    expect(first?.deltas.length).toBeGreaterThan(0)
    if (first === undefined) return
    const xray = await browser.newPage()
    await xray.goto(report.xray)
    const rows = xray.getByRole('button', {expanded: true}).or(xray.getByRole('button', {expanded: false}))
    await expectLocator(rows).toHaveCount(report.components.length + report.unmatched.length)
    const badges = xray.getByRole('listitem').first().getByRole('list', {name: 'Deltas'}).getByRole('listitem')
    await expectLocator(badges).toHaveCount(first.deltas.length)
    await expectLocator(badges.first()).toContainText(`${first.deltas[0]?.kind} `)
    await xray.close()
  })

  it('j expands the next row and Enter opens its source', async () => {
    await goto('/')
    const report = await call('design_diff', {})
    const second = report.components[1]?.source
    expect(second).toBeDefined()
    if (second === undefined || second === null) return
    const xray = await browser.newPage()
    await xray.goto(report.xray)
    await expectLocator(xray.getByRole('region', {name: 'component'})).toBeVisible()
    await xray.keyboard.press('j')
    const name = second.file.split('/').at(-1)?.split('.')[0] ?? second.file
    await expectLocator(xray.getByRole('region', {name})).toContainText(second.file)
    await xray.keyboard.press('Enter')
    await expectLocator(xray.getByRole('status').filter({hasText: 'in the editor'})).toHaveText(
      `Opened ${second.file}:${second.line} in the editor`,
    )
    await xray.close()
  })

  it('copy fix prompt writes the prompt', async () => {
    await goto('/')
    const report = await call('design_diff', {})
    const kind = report.components[0]?.deltas[0]?.kind
    expect(kind).toBeDefined()
    const xray = await browser.newPage({permissions: ['clipboard-read', 'clipboard-write']})
    await xray.goto(report.xray)
    await xray.getByRole('button', {name: 'Copy fix prompt'}).click()
    await expectLocator(xray.getByRole('status').filter({hasText: 'copied'})).toHaveText('Fix prompt copied')
    expect(await xray.evaluate(() => navigator.clipboard.readText())).toContain(`${kind}`)
    await xray.close()
  })

  it('viewport chip switches target and keeps the view', async () => {
    await goto('/')
    const narrow = await call('design_target', {image: target('u1-390')})
    await call('design_target', {image: target('u1-1280')})
    const report = await call('design_diff', {})
    const xray = await browser.newPage()
    await xray.goto(capturePage(report.xray))
    await xray.getByRole('radiogroup', {name: 'Viewport'}).getByText('390').click()
    await expectLocator(xray.getByRole('radio', {name: '390'})).toBeChecked()
    await expectLocator(xray).toHaveURL(
      (url) => url.pathname.endsWith('/xray/capture') && url.search.includes(narrow.id),
    )
    await expectLocator(xray.getByRole('radio', {name: 'Capture'})).toBeChecked()
    await xray.close()
    await call('design_clear', {target: narrow.id})
  })

  it('capture view shows the stage', async () => {
    await goto('/')
    const report = await call('design_diff', {})
    const xray = await browser.newPage()
    await xray.goto(capturePage(report.xray))
    await expectLocator(xray.getByRole('radio', {name: 'Capture'})).toBeChecked()
    await expectLocator(xray.getByRole('radio', {name: 'Slider'})).toBeChecked()
    await expectLocator(xray.getByRole('radio', {name: 'Side by side'})).toBeVisible()
    await expectLocator(xray.getByRole('figure')).toContainText('Live over design')
    await xray.close()
  })

  it('capture view keeps the off count pill off the stage', async () => {
    await goto('/')
    const report = await call('design_diff', {})
    const above = report.components.filter(aboveTolerance).length + report.unmatched.length
    const pill = `${above} of ${report.components.length + report.unmatched.length} off`
    const xray = await browser.newPage()
    await xray.goto(report.xray)
    await expectLocator(xray.getByText(pill)).toBeVisible()
    await xray.goto(capturePage(report.xray))
    await expectLocator(xray.getByRole('figure')).toContainText('Live over design')
    await expectLocator(xray.getByText(pill)).toHaveCount(0)
    await xray.close()
  })

  it('a row keyed by its source attribute shows the element tag, not the attribute selector', async () => {
    await goto('/')
    const report = await call('design_diff', {})
    const first = report.components[0]
    expect(first?.selector).toContain('[data-conciv-source=')
    if (first === undefined) return
    const xray = await browser.newPage()
    await xray.goto(report.xray)
    const row = xray.getByRole('listitem').first()
    await expectLocator(row.getByText(first.tag, {exact: true})).toBeVisible()
    await expectLocator(row).not.toContainText('data-conciv-source')
    await xray.close()
  })

  it('a width without a run keeps the panel Run diff and says it was not diffed yet', async () => {
    await goto('/')
    const unrun = await call('design_target', {image: target('u1-390'), name: 'unrun'})
    await call('design_target', {image: target('u1-1280')})
    const report = await call('design_diff', {})
    const url = new URL(report.xray)
    url.searchParams.set('target', unrun.id)
    const xray = await browser.newPage()
    await xray.goto(url.toString())
    await expectLocator(xray.getByText('No diff for')).toBeVisible()
    await expectLocator(xray.getByText('not diffed yet')).toBeVisible()
    await expectLocator(xray.getByRole('button', {name: 'Run diff'})).toHaveCount(2)
    await xray.close()
    await call('design_clear', {target: unrun.id})
  })

  it('hovering the select all button shows its tooltip', async () => {
    await goto('/')
    const report = await call('design_diff', {})
    const xray = await browser.newPage()
    await xray.goto(report.xray)
    await xray.getByRole('button', {name: 'Select all'}).hover()
    await expectLocator(xray.getByRole('tooltip')).toHaveText('Select all')
    await xray.close()
  })

  it('arrow keys switch the viewport and keep focus in the viewport group', async () => {
    await goto('/')
    const narrow = await call('design_target', {image: target('u1-390')})
    await call('design_target', {image: target('u1-1280')})
    const report = await call('design_diff', {})
    const xray = await browser.newPage()
    await xray.goto(report.xray)
    const group = xray.getByRole('radiogroup', {name: 'Viewport'})
    const desktop = group.getByRole('radio', {name: '1280'})
    await expectLocator(desktop).toBeChecked()
    await desktop.focus()
    await xray.keyboard.press('ArrowRight')
    await expectLocator(xray).toHaveURL((url) => !url.search.includes(report.target.id))
    await expectLocator(group.getByRole('radio', {checked: true})).toBeFocused()
    await expectLocator(desktop).not.toBeChecked()
    await expectLocator(group.locator('label[data-focus-visible]')).toHaveCount(1)
    await xray.close()
    await call('design_clear', {target: narrow.id})
  })

  it('keys 2 and 1 switch the view route and the view selection follows', async () => {
    await goto('/')
    const report = await call('design_diff', {})
    const xray = await browser.newPage()
    await xray.goto(report.xray)
    await expectLocator(xray.getByRole('radio', {name: 'List'})).toBeChecked()
    await xray.getByRole('radiogroup', {name: 'Viewport'}).getByRole('radio', {checked: true}).focus()
    await xray.keyboard.press('2')
    await expectLocator(xray).toHaveURL((url) => url.pathname.endsWith('/xray/capture'))
    await expectLocator(xray.getByRole('radio', {name: 'Capture'})).toBeChecked()
    await xray.keyboard.press('1')
    await expectLocator(xray).toHaveURL((url) => url.pathname.endsWith('/xray/list'))
    await expectLocator(xray.getByRole('radio', {name: 'List'})).toBeChecked()
    await xray.close()
  })

  it('clear search empties the query and shows the rows again', async () => {
    await goto('/')
    const report = await call('design_diff', {})
    const url = new URL(report.xray)
    url.searchParams.set('q', 'no-such-component')
    const xray = await browser.newPage()
    await xray.goto(url.toString())
    await expectLocator(xray.getByText('No component matches')).toBeVisible()
    await xray.getByRole('button', {name: 'Clear search'}).click()
    await expectLocator(xray.getByRole('list', {name: 'Components'})).toBeVisible()
    await expectLocator(xray.getByRole('textbox', {name: 'Search components'})).toHaveValue('')
    await expectLocator(xray).toHaveURL((current) => !current.searchParams.has('q'))
    await xray.close()
  })

  it('a region without a source falls back to its kind and cannot open', async () => {
    await goto('missing')
    const report = await call('design_diff', {})
    const region = report.unmatched.find((part) => part.source === undefined)
    expect(region).toBeDefined()
    if (region === undefined) return
    const xray = await browser.newPage()
    await xray.goto(report.xray)
    await xray
      .getByRole('button', {name: `${region.kind} region`})
      .first()
      .click()
    const card = xray.getByRole('region', {name: `${region.kind} region`})
    await expectLocator(card.getByRole('button', {name: 'Open source'})).toBeDisabled()
    await xray.close()
  })

  it('shows the stale badge once the source changes after the diff', async () => {
    await goto('/')
    const report = await call('design_diff', {})
    const xray = await browser.newPage()
    await xray.goto(report.xray)
    await expectLocator(xray.getByRole('listitem').first()).toBeVisible()
    await expectLocator(xray.getByText('stale: source changed')).toHaveCount(0)
    await writeFile(HOST_STYLES, await readFile(HOST_STYLES))
    await expectLocator(async () => {
      await xray.reload()
      await expectLocator(xray.getByText('stale: source changed')).toBeVisible({timeout: 1_000})
    }).toPass({timeout: 10_000})
    await xray.close()
  })

  it('keeps a numeric search query from the url', async () => {
    const report = await call('design_diff', {})
    const xray = await browser.newPage()
    await xray.goto(`${report.xray}&q=1280`)
    await expectLocator(xray.getByRole('textbox', {name: 'Search components'})).toHaveValue('1280')
    await xray.close()
  })

  it('a component off by paint alone says no property was measured', async () => {
    await goto('badge')
    await call('design_target', {image: target('u1-1280')})
    const report = await call('design_diff', {})
    const index = report.components.findIndex((c) => fromToolbar(c) && c.tag === 'header')
    const header = report.components[index]
    expect(header?.deltas).toEqual([])
    if (header === undefined) return
    const url = new URL(report.xray)
    url.searchParams.set('component', `${header.selector}#${index}`)
    const xray = await browser.newPage()
    await xray.goto(url.toString())
    await expectLocator(xray.getByRole('region', {name: 'component'})).toContainText(
      'The paint differs from the design, but no property delta was measured.',
    )
    await xray.close()
  })

  it('the filter offers no Match choice while the report lists only components off the design', async () => {
    await goto('/')
    const report = await call('design_diff', {})
    const xray = await browser.newPage()
    await xray.goto(report.xray)
    await expectLocator(xray.getByRole('checkbox', {name: 'Off'})).toBeVisible()
    await expectLocator(xray.getByRole('checkbox', {name: 'Match'})).toHaveCount(0)
    await expectLocator(xray.getByRole('button', {name: 'Invert selection'})).toHaveCount(0)
    await xray.close()
  })

  it('moving between rows reads the report once', async () => {
    await goto('/')
    const report = await call('design_diff', {})
    const xray = await browser.newPage()
    await xray.goto(report.xray)
    const inspector = xray.getByRole('region', {name: 'component'})
    await inspector.waitFor()
    const reads: string[] = []
    xray.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/xray/report')) reads.push(request.url())
    })
    await xray.keyboard.press('j')
    await expectLocator(inspector).toContainText(String(report.components[1]?.source?.file))
    await xray.keyboard.press('k')
    await expectLocator(inspector).toContainText(String(report.components[0]?.source?.file))
    expect(reads).toEqual([])
    await xray.close()
  })
})

const colorDistance = differenceCiede2000()

function sameSource(input: {a: LiveComponent['source']; b: LiveComponent['source']}): boolean {
  const {a, b} = input
  return a !== null && b !== null && a.file === b.file && a.line === b.line && a.column === b.column
}

async function toolbarButtons(): Promise<LiveComponent[]> {
  const captured = await call('design_capture', {height: 720})
  const toolbar = captured.components.find((c) => c.source?.file === 'src/Toolbar.tsx')
  return toolbar?.children ?? []
}

const StoredModelSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['text', 'box', 'image']),
      text: z.string().optional(),
      role: z.string().optional(),
      within: z.string().optional(),
      box: z.object({x: z.number(), y: z.number(), w: z.number(), h: z.number()}),
    }),
  ),
})

async function storedNodes(id: string): Promise<z.infer<typeof StoredModelSchema>['nodes']> {
  const path = fileUnder(stateRoot, `.conciv/design/${id}/model.json`)
  return StoredModelSchema.parse(JSON.parse(await readFile(path, 'utf8'))).nodes
}

function near(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  const edges = [a.x - b.x, a.y - b.y, a.x + a.w - b.x - b.w, a.y + a.h - b.y - b.h]
  return edges.every((edge) => Math.abs(edge) <= 2)
}

function inside(input: {inner: LiveComponent['box']; outer: LiveComponent['box']}): boolean {
  const {inner, outer} = input
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}

const ButtonBoxSchema = z.object({x: z.number(), y: z.number(), w: z.number(), h: z.number()})

type ReportedComponent = DiffReport['components'][number]

function aboveTolerance(component: ReportedComponent): boolean {
  return component.deltas.length > 0 || component.mismatch >= TILE_GATE
}

function fromToolbar(component: ReportedComponent): boolean {
  return component.source?.file === 'src/Toolbar.tsx'
}

function croppedPixels(input: {png: PNG; box: z.infer<typeof ButtonBoxSchema>}): Uint8Array {
  const {png, box} = input
  const left = Math.max(0, Math.floor(box.x))
  const top = Math.max(0, Math.floor(box.y))
  const width = Math.min(png.width, Math.ceil(box.x + box.w)) - left
  const height = Math.min(png.height, Math.ceil(box.y + box.h)) - top
  const data = new Uint8Array(width * height * 4)
  Array.from({length: height}, (_, row) => row).forEach((row) => {
    const start = ((top + row) * png.width + left) * 4
    data.set(png.data.subarray(start, start + width * 4), row * width * 4)
  })
  return data
}

function differingShare(input: {a: PNG; b: PNG; box: z.infer<typeof ButtonBoxSchema>}): number {
  const {a, b} = input
  const box = {
    x: input.box.x - TILE_MARGIN,
    y: input.box.y - TILE_MARGIN,
    w: input.box.w + TILE_MARGIN * 2,
    h: input.box.h + TILE_MARGIN * 2,
  }
  const width = Math.min(a.width, Math.ceil(box.x + box.w)) - Math.max(0, Math.floor(box.x))
  const height = Math.min(a.height, Math.ceil(box.y + box.h)) - Math.max(0, Math.floor(box.y))
  const differing = pixelmatch(croppedPixels({png: a, box}), croppedPixels({png: b, box}), undefined, width, height, {
    includeAA: false,
  })
  return differing / (width * height)
}

function reportedFor(input: {report: DiffReport; component: LiveComponent | undefined}): DiffReport['components'] {
  const {report, component} = input
  if (component === undefined) return []
  return report.components.filter((c) => sameSource({a: c.source, b: component.source}))
}

describe('text', () => {
  it('reads the text runs of a target once at registration', async () => {
    await goto('target')
    const [first] = await toolbarButtons()
    const registered = await call('design_target', {image: target('u1-1280')})
    expect(registered.text?.runs).toBeGreaterThan(0)
    const label = (await storedNodes(registered.id)).find(
      (node) => node.kind === 'text' && node.text?.toLowerCase() === 'export',
    )
    expect(label).toBeDefined()
    expect(first).toBeDefined()
    if (label === undefined || first === undefined) return
    expect(inside({inner: label.box, outer: first.box})).toBe(true)
  })

  it('a recolored label is a foreground delta measured from glyph ink', async () => {
    await goto('text-recolor')
    await call('design_target', {image: target('u1-1280')})
    const [first, second] = await toolbarButtons()
    const report = await call('design_diff', {})
    const foreground = reportedFor({report, component: first})
      .flatMap((c) => c.deltas)
      .find((d) => d.kind === 'foreground')
    expect(foreground).toBeDefined()
    expect(colorDistance(String(foreground?.live), '#ffd166')).toBeLessThanOrEqual(COLOR_DELTA_E)
    expect(colorDistance(String(foreground?.target), '#ffffff')).toBeLessThanOrEqual(COLOR_DELTA_E)
    expect(reportedFor({report, component: second}).flatMap((c) => c.deltas)).toEqual([])
  })

  it('text rendered with a second rasterization is no finding', async () => {
    await goto('textnoise')
    await call('design_target', {image: target('u1-1280')})
    const report = await call('design_diff', {})
    expect(report.components.flatMap((c) => c.deltas)).toEqual([])
    expect(report.components.filter(aboveTolerance)).toEqual([])
    expect((await call('design_status', {})).done).toBe(true)
  })

  it('a container whose own paint changed stays reported when its text is noise', async () => {
    await goto('badge-textnoise')
    await call('design_target', {image: target('u1-1280')})
    const report = await call('design_diff', {})
    const header = report.components.find((c) => fromToolbar(c) && c.tag === 'header')
    expect(header?.deltas).toEqual([])
    expect(header?.mismatch).toBeGreaterThanOrEqual(TILE_GATE)
    expect(report.components.filter((c) => fromToolbar(c) && c.tag === 'button').filter(aboveTolerance)).toEqual([])
    expect((await call('design_status', {})).done).toBe(false)
  })

  it('a target rendered by another browser matches the page', async () => {
    const button = ButtonBoxSchema.parse(
      JSON.parse(await readFile(join(kit.targetsDir, 'u1-1280-firefox.json'), 'utf8')),
    )
    const share = differingShare({
      a: decodePng(await readFile(target('u1-1280'))),
      b: decodePng(await readFile(target('u1-1280-firefox'))),
      box: button,
    })
    expect(share, 'the Firefox render of the first button differs from the Chromium one').toBeGreaterThanOrEqual(
      TILE_GATE,
    )
    await goto('target')
    await call('design_target', {image: target('u1-1280-firefox')})
    const report = await call('design_diff', {})
    expect(report.components.filter((c) => fromToolbar(c) && aboveTolerance(c))).toEqual([])
    expect(report.components.flatMap((c) => c.deltas.map((d) => d.kind))).not.toContain('foreground')
    expect(report.components.flatMap((c) => c.deltas.map((d) => d.kind))).not.toContain('text')
    expect((await call('design_status', {})).done).toBe(true)
  })

  it('a changed label rendered from an expression is no text delta', async () => {
    await goto('text-changed')
    await call('design_target', {image: target('u1-1280')})
    const report = await call('design_diff', {})
    expect(report.components.flatMap((c) => c.deltas.filter((d) => d.kind === 'text'))).toEqual([])
    expect(report.warnings).toEqual([])
  })

  it('a changed field border stays reported when its placeholder agrees', async () => {
    await goto('field-border')
    await call('design_target', {image: target('u1-1280')})
    const report = await call('design_diff', {})
    expect(report.components.filter((c) => c.tag === 'input').filter(aboveTolerance)).toHaveLength(1)
  })

  it('a recolored label inside an unsourced span is a foreground delta on its button', async () => {
    await goto('span-recolor')
    await call('design_target', {image: target('u1-1280')})
    const [first] = await toolbarButtons()
    const report = await call('design_diff', {})
    const foreground = reportedFor({report, component: first})
      .flatMap((c) => c.deltas)
      .find((d) => d.kind === 'foreground')
    expect(foreground).toBeDefined()
    expect(colorDistance(String(foreground?.live), '#ffd166')).toBeLessThanOrEqual(COLOR_DELTA_E)
    expect(colorDistance(String(foreground?.target), '#ffffff')).toBeLessThanOrEqual(COLOR_DELTA_E)
  })
})

const WHITE = [255, 255, 255] as const
const BLACK = [0, 0, 0] as const
const RED = [220, 30, 30] as const
const ciede2000: ColorMetric = {name: 'ciede2000', distance: ({a, b}) => colorDistance(a, b)}

type Ink = {box: Box; rgb: readonly [number, number, number]; phase?: number}

function painted(input: {inks: Ink[]}): Raster {
  const width = 200
  const height = 100
  const data = new Uint8Array(width * height * 4)
  Array.from({length: width * height}, (_, index) => index).forEach((index) => {
    const x = index % width
    const y = (index - x) / width
    const ink = input.inks.find(
      ({box, phase}) =>
        (x + 8 - (phase ?? 0)) % 8 < 3 && x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h,
    )
    data.set([...(ink?.rgb ?? WHITE), 255], index * 4)
  })
  return {width, height, data}
}

function glyphComponent(input: {glyphs: {text: string; boxes: Box[]}[]; x?: number}): LiveComponent {
  return {
    source: {file: 'src/App.tsx', line: 1, column: input.x ?? 1},
    tag: 'span',
    text: '',
    box: {x: 0, y: 0, w: 200, h: 100},
    textBox: null,
    glyphs: input.glyphs,
    axis: null,
    styles: {background: '#ffffff', color: '#000000', fontSize: 16, lineHeight: 20, fontWeight: 400, radius: 0},
    index: 1,
    children: [],
  }
}

function intersects(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

function inkInside(box: Box): Box {
  return {x: box.x + 2, y: box.y + 4, w: box.w - 4, h: box.h - 8}
}

function grouped(input: {components: LiveComponent[]; runs: TextRun[]; targetInks?: Ink[]; liveInks?: Ink[]}) {
  const liveBoxes = input.components.flatMap((c) => c.glyphs.flatMap((glyph) => glyph.boxes))
  const live = painted({inks: input.liveInks ?? liveBoxes.map((box) => ({box: inkInside(box), rgb: BLACK}))})
  const inked = input.runs.map((run) => ({...run, box: inkInside(run.box)}))
  const targetRaster = painted({inks: input.targetInks ?? inked.map((run) => ({box: run.box, rgb: BLACK}))})
  const runs = inked.map((run) => ({...run, box: trimToInk({raster: targetRaster, box: run.box})}))
  return groupText({components: input.components, runs, live, target: targetRaster, color: ciede2000})
}

describe('groupText', () => {
  it('returns nothing when the target has no runs', () => {
    const first = glyphComponent({glyphs: [{text: 'Export', boxes: [{x: 10, y: 10, w: 60, h: 20}]}]})
    expect(grouped({components: [first], runs: []})).toEqual({groups: [], agreeing: []})
  })

  it('joins two lines of one node in reading order', () => {
    const line1 = {x: 10, y: 10, w: 60, h: 20}
    const line2 = {x: 10, y: 40, w: 60, h: 20}
    const wrapped = glyphComponent({glyphs: [{text: 'Hello World', boxes: [line1, line2]}]})
    const runs = [
      {text: 'World', box: line2},
      {text: 'Hello', box: line1},
    ]
    const {groups} = grouped({components: [wrapped], runs})
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({liveText: 'Hello World', targetText: 'Hello World', agrees: true})
  })

  it('joins one node read as two OCR boxes', () => {
    const search = glyphComponent({glyphs: [{text: 'Search invoices', boxes: [{x: 10, y: 10, w: 140, h: 20}]}]})
    const runs = [
      {text: 'invoices', box: {x: 80, y: 10, w: 70, h: 20}},
      {text: 'Search', box: {x: 10, y: 10, w: 64, h: 20}},
    ]
    const {groups, agreeing} = grouped({components: [search], runs})
    expect(groups.map((group) => [group.targetText, group.agrees])).toEqual([['Search invoices', true]])
    expect(agreeing).toHaveLength(3)
  })

  it('joins two nodes read as one OCR box and gives the group to the first', () => {
    const exportButton = glyphComponent({glyphs: [{text: 'Export', boxes: [{x: 10, y: 10, w: 60, h: 20}]}], x: 1})
    const createButton = glyphComponent({glyphs: [{text: 'Create', boxes: [{x: 80, y: 10, w: 60, h: 20}]}], x: 2})
    const runs = [{text: 'Export Create', box: {x: 10, y: 10, w: 130, h: 20}}]
    const {groups} = grouped({components: [createButton, exportButton], runs})
    expect(groups).toHaveLength(1)
    expect(groups[0]?.owner).toBe(exportButton)
    expect(groups[0]).toMatchObject({liveText: 'Export Create', agrees: true})
  })

  it('forms no group from text that only one side has', () => {
    const lonely = glyphComponent({glyphs: [{text: 'Draft', boxes: [{x: 10, y: 10, w: 60, h: 20}]}]})
    const runs = [{text: 'Total', box: {x: 10, y: 60, w: 60, h: 20}}]
    expect(grouped({components: [lonely], runs})).toEqual({groups: [], agreeing: []})
  })

  it('ignores whitespace and case', () => {
    const label = glyphComponent({glyphs: [{text: ' Sign  in ', boxes: [{x: 10, y: 10, w: 60, h: 20}]}]})
    const runs = [{text: 'SIGN IN', box: {x: 10, y: 10, w: 60, h: 20}}]
    expect(grouped({components: [label], runs}).groups[0]?.agrees).toBe(true)
  })

  it('trims a wide live box to its ink before comparing the place', () => {
    const word = {x: 20, y: 15, w: 60, h: 20}
    const field = glyphComponent({glyphs: [{text: 'Search', boxes: [{x: 5, y: 5, w: 190, h: 40}]}]})
    const runs = [{text: 'Search', box: word}]
    const liveInks = [{box: inkInside(word), rgb: BLACK}]
    expect(grouped({components: [field], runs, liveInks}).groups[0]?.agrees).toBe(true)
  })

  it('disagrees on a different string', () => {
    const label = glyphComponent({glyphs: [{text: 'Export', boxes: [{x: 10, y: 10, w: 60, h: 20}]}]})
    const runs = [{text: 'Expert', box: {x: 10, y: 10, w: 60, h: 20}}]
    const {groups, agreeing} = grouped({components: [label], runs})
    expect(groups[0]).toMatchObject({liveText: 'Export', targetText: 'Expert', agrees: false})
    expect(agreeing).toEqual([])
  })

  it('disagrees on a different ink color', () => {
    const box = {x: 10, y: 10, w: 60, h: 20}
    const label = glyphComponent({glyphs: [{text: 'Export', boxes: [box]}]})
    const runs = [{text: 'Export', box}]
    const {groups} = grouped({components: [label], runs, targetInks: [{box: inkInside(box), rgb: RED}]})
    expect(groups[0]?.agrees).toBe(false)
  })

  it('disagrees on ink moved further than the geometry tolerance', () => {
    const label = glyphComponent({glyphs: [{text: 'Export', boxes: [{x: 10, y: 10, w: 60, h: 20}]}]})
    const moved = {x: 14, y: 10, w: 60, h: 20}
    const runs = [{text: 'Export', box: moved}]
    const targetInks = [{box: inkInside(moved), rgb: BLACK, phase: 4}]
    expect(grouped({components: [label], runs, targetInks}).groups[0]?.agrees).toBe(false)
  })

  it('gives a differing run to the first component whose string it lacks', () => {
    const exportButton = glyphComponent({glyphs: [{text: 'Export', boxes: [{x: 10, y: 10, w: 60, h: 20}]}], x: 1})
    const deleteButton = glyphComponent({glyphs: [{text: 'Delete', boxes: [{x: 80, y: 10, w: 60, h: 20}]}], x: 2})
    const runs = [{text: 'Export Create', box: {x: 10, y: 10, w: 130, h: 20}}]
    const {groups} = grouped({components: [exportButton, deleteButton], runs})
    expect(groups).toHaveLength(1)
    expect(groups[0]?.owner).toBe(deleteButton)
    expect(groups[0]).toMatchObject({liveText: 'Delete', targetText: 'Create', agrees: false})
  })

  it('masks only the labels of a shared run whose ink agrees', () => {
    const exportBox = {x: 10, y: 10, w: 60, h: 20}
    const createBox = {x: 80, y: 10, w: 60, h: 20}
    const exportButton = glyphComponent({glyphs: [{text: 'Export', boxes: [exportBox]}], x: 1})
    const createButton = glyphComponent({glyphs: [{text: 'Create', boxes: [createBox]}], x: 2})
    const runs = [{text: 'Export Create', box: {x: 10, y: 10, w: 130, h: 20}}]
    const targetInks = [
      {box: inkInside(exportBox), rgb: BLACK},
      {box: inkInside(createBox), rgb: RED},
    ]
    const {agreeing} = grouped({components: [exportButton, createButton], runs, targetInks})
    expect(agreeing.some((box) => intersects({a: box, b: inkInside(exportBox)}))).toBe(true)
    expect(agreeing.some((box) => intersects({a: box, b: inkInside(createBox)}))).toBe(false)
  })

  it('masks a field placeholder by its ink, not by the field box', () => {
    const word = {x: 20, y: 15, w: 60, h: 20}
    const fieldBox = {x: 5, y: 5, w: 190, h: 40}
    const field = glyphComponent({glyphs: [{text: 'Search', boxes: [fieldBox]}]})
    const runs = [{text: 'Search', box: word}]
    const liveInks = [{box: inkInside(word), rgb: BLACK}]
    const {agreeing} = grouped({components: [field], runs, liveInks})
    expect(agreeing.length).toBeGreaterThan(0)
    expect(agreeing.some((box) => intersects({a: box, b: {x: fieldBox.x, y: fieldBox.y, w: fieldBox.w, h: 1}}))).toBe(
      false,
    )
  })
})

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
  return {width, height, data}
}

describe('trimToInk', () => {
  it('shrinks a box to the ink inside it', () => {
    const raster = withInk({ink: {x: 12, y: 5, w: 8, h: 4}})
    expect(trimToInk({raster, box: {x: 10, y: 3, w: 20, h: 10}})).toEqual({x: 12, y: 5, w: 8, h: 4})
  })

  it('keeps a box with no ink', () => {
    const box = {x: 10, y: 3, w: 20, h: 10}
    expect(trimToInk({raster: withInk({ink: null}), box})).toEqual(box)
  })

  it('keeps a box under two pixels on a side', () => {
    const box = {x: 12, y: 5, w: 1, h: 10}
    expect(trimToInk({raster: withInk({ink: {x: 12, y: 5, w: 8, h: 4}}), box})).toEqual(box)
  })
})

describe('glyphCoreColor', () => {
  it('finds no ink on a flat tile', () => {
    const box = {x: 0, y: 0, w: 16, h: 16}
    const raster = {width: 16, height: 16, data: new Uint8Array(16 * 16 * 4).fill(200)}
    expect(glyphCoreColor({raster, box, glyphs: [box], background: '#c8c8c8', color: ciede2000})).toBeNull()
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
    const raster = {width: 16, height: 16, data}
    const ink = glyphCoreColor({raster, box, glyphs: [box], background: '#426bf2', color: ciede2000})
    expect(ink).not.toBeNull()
    expect(colorDistance(String(ink), '#ffd166')).toBeLessThanOrEqual(COLOR_DELTA_E)
  })
})

describe('paddle disposal', () => {
  it('a read queued before disposal finishes first and a read during disposal is refused', async () => {
    await destroyPaddle()
    const raster = painted({inks: []})
    const settled: string[] = []
    const queued = paddleReader.read({raster}).then(() => settled.push('read'))
    const disposed = destroyPaddle().then(() => settled.push('disposed'))
    await expect(paddleReader.read({raster})).rejects.toThrow('the OCR reader is shutting down')
    await Promise.all([queued, disposed])
    expect(settled).toEqual(['read', 'disposed'])
    expect(await paddleReader.read({raster})).toEqual([])
  })
})

describe('nodes', () => {
  it('registering u1-1280 yields box nodes for the toolbar, each card and the table within 2 px', async () => {
    await goto('target')
    const captured = await call('design_capture', {height: 720})
    const registered = await call('design_target', {image: target('u1-1280')})
    const boxes = (await storedNodes(registered.id)).filter((node) => node.kind === 'box')
    const wanted = captured.components.filter((c) =>
      ['src/Toolbar.tsx', 'src/Cards.tsx', 'src/Table.tsx'].includes(c.source?.file ?? ''),
    )
    const containers = [
      ...wanted.filter((c) => c.tag === 'header' || c.tag === 'table'),
      ...wanted.flatMap((c) => c.children.filter((child) => child.tag === 'article')),
    ]
    expect(containers.map((c) => c.tag).toSorted()).toEqual(['article', 'article', 'header', 'table'])
    expect(containers.filter((c) => !boxes.some((node) => near({a: node.box, b: c.box})))).toEqual([])
  })

  it('the Export text node is within the first button', async () => {
    await goto('target')
    const [first] = await toolbarButtons()
    const registered = await call('design_target', {image: target('u1-1280')})
    const nodes = await storedNodes(registered.id)
    const label = nodes.find((node) => node.kind === 'text' && node.text?.toLowerCase() === 'export')
    const button = nodes.find((node) => node.id === label?.within)
    expect(button?.kind).toBe('box')
    expect(first).toBeDefined()
    if (button === undefined || first === undefined) return
    expect(near({a: button.box, b: first.box})).toBe(true)
  })

  it('roles against roles-1280 reports no text delta and no warning', async () => {
    await goto('roles')
    const registered = await call('design_target', {image: target('roles-1280')})
    const texts = (await storedNodes(registered.id)).filter((node) => node.kind === 'text')
    const roles = Object.fromEntries(texts.map((node) => [node.text, node.role]))
    expect(roles).toMatchObject({'[Customer Name]': 'placeholder', '$1,200': 'data', 'INV-001': 'data'})
    const report = await call('design_diff', {})
    expect(report.components.flatMap((c) => c.deltas.filter((d) => d.kind === 'text'))).toEqual([])
    expect(report.warnings).toEqual([])
  })

  it('hardcoded against hardcoded-1280 reports a sample-data warning and done', async () => {
    await goto('hardcoded')
    await call('design_target', {image: target('hardcoded-1280')})
    const report = await call('design_diff', {})
    expect(report.warnings).toEqual([
      expect.objectContaining({kind: 'text', warning: 'sample-data', live: '1,200', file: 'src/Table.tsx'}),
    ])
    expect((await call('design_status', {})).done).toBe(true)
  })
})

describe('current target', () => {
  it('design_diff with no argument diffs the newest target of the session', async () => {
    await goto('/')
    await call('design_target', {image: target('u1-1280')})
    const narrow = await call('design_target', {image: target('u1-390')})
    const report = await call('design_diff', {})
    expect(report.target).toMatchObject({id: narrow.id, width: 390})
  })

  it('design_target returns the guide as next', async () => {
    const {next} = await call('design_target', {image: target('u1-1280')})
    expect(next).toContain('design_diff')
    expect(next).toBe(DESIGN_GUIDE)
  })

  it('design_status reports the current target', async () => {
    await goto('/')
    await call('design_target', {image: target('u1-390')})
    const wide = await call('design_target', {image: target('u1-1280')})
    await call('design_diff', {})
    expect(await call('design_status', {})).toMatchObject({
      targets: [expect.objectContaining({id: wide.id, width: 1280})],
      done: false,
      next: expect.stringContaining('design_diff'),
    })
  })

  it('a second image becomes current, and registering the first again makes it current with its id', async () => {
    await goto('target')
    const first = await call('design_target', {image: target('u1-1280')})
    const second = await call('design_target', {image: target('u1-1280-firefox')})
    expect((await call('design_diff', {})).target.id).toBe(second.id)
    const again = await call('design_target', {image: target('u1-1280')})
    expect(again.id).toBe(first.id)
    expect((await call('design_diff', {})).target.id).toBe(first.id)
  })

  it('design_clear with all then design_diff reports that no target is registered', async () => {
    await call('design_clear', {all: true})
    const message = await rpc.registry.call({name: 'design_diff', input: {}}).then(
      () => '',
      (error: unknown) => String(error),
    )
    expect(message).toContain('no design target is registered; register the design image with design_target')
  })
})
