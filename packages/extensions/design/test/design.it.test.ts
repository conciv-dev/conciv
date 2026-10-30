/* oxlint-disable playwright/no-raw-locators, playwright/prefer-web-first-assertions -- the Task 7 cases read the hidden capture frame and the tab field directly */
import {existsSync, readFileSync} from 'node:fs'
import {mkdtemp, readdir, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, isAbsolute, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import react from '@vitejs/plugin-react'
import {chromium, type Page} from 'playwright'
import {createServer} from 'vite'
import {afterAll, expect, it} from 'vitest'
import {z} from 'zod'
import {makeRpcClient, ToolCommandSignatureSchema, type RpcClient} from '@conciv/contract'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {EXTENSIONS_ROUTE} from '@conciv/extension-compiler/extensions'
import {awaitPagePlaneSubscribed} from '@conciv/extension-testkit/page-plane'
import {createConcivUnplugin} from '@conciv/plugin'
import designServer from '../src/server.js'
import type {DesignConfig} from '../src/shared/config.js'
import {
  CaptureInputSchema,
  ClearInputSchema,
  DESIGN_TOOL_DEFS,
  designVerbOfTool,
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
} from '../src/shared/defs.js'
import type {LiveComponent, Provenance, Winner} from '../src/shared/types.js'
import {decodePng} from '../src/server/raster.js'
import {mapDeclaration} from '../src/server/provenance/mappers.js'

const HOST_ROOT = fileURLToPath(new URL('fixtures/host/', import.meta.url))
const TARGETS_DIR = fileURLToPath(new URL('fixtures/targets/', import.meta.url))
const PROVENANCE_DIR = fileURLToPath(new URL('fixtures/provenance/', import.meta.url))
const ENDPOINT_FILE = 'dev-endpoint.json'
const PAGE_DRIVER_TIMEOUT_MS = 30_000

const CatalogSchema = z.array(ToolCommandSignatureSchema)
const EndpointSchema = z.object({apiBase: z.string().min(1)})

const embedEntry = fileURLToPath(import.meta.resolve('@conciv/embed'))

const concivUnplugin = createConcivUnplugin({
  serverExtensions: [designServer],
  clientEntries: [fileURLToPath(import.meta.resolve('@conciv/extension-design/client'))],
  embedEntry,
  nativePageDir: dirname(embedEntry),
  dedupeEntry: fileURLToPath(import.meta.resolve('@conciv/extension-compiler/dedupe')),
})

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
  page: Page
  origin: string
  stateRoot: string
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

async function boot(options: {config?: Partial<DesignConfig>} = {}): Promise<Kit> {
  const stateRoot = await mkdtemp(join(tmpdir(), 'conciv-design-state-'))
  const devEndpointDir = await mkdtemp(join(tmpdir(), 'conciv-design-endpoint-'))
  const server = await createServer({
    root: HOST_ROOT,
    configFile: false,
    logLevel: 'silent',
    server: {host: '127.0.0.1', port: 0},
    plugins: [
      react(),
      concivUnplugin.vite({
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
    page,
    origin,
    stateRoot,
    call: makeCall(rpc),
    goto,
    dispose: async () => {
      await browser.close()
      await server.close()
      await rm(stateRoot, {recursive: true, force: true})
      await rm(devEndpointDir, {recursive: true, force: true})
    },
  }
}

function target(name: string): string {
  return join(TARGETS_DIR, `${name}.png`)
}

function fileUnder(root: string, relative: string): string {
  return isAbsolute(relative) ? relative : join(root, relative)
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
    axis: null,
    styles: NO_STYLES,
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

const kit = await boot()
const {rpc, page, stateRoot, call, goto} = kit

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
  expect(designVerbOfTool('design_diff')).toBe('diff')
  expect(diffDef.inputSchema.parse({})).toEqual({depth: 3, limit: 12})
})

it('registers a PNG target for a route and width, replacing an earlier one', async () => {
  const first = await call('design_target', {image: target('u1-1280'), route: '/', width: 1280})
  expect(first).toMatchObject({route: '/', width: 1280, height: 720, scale: 1})
  const second = await call('design_target', {image: target('u1-1280'), route: '/', width: 1280, name: 'invoices'})
  expect(second.id).not.toBe(first.id)
  expect((await call('design_status', {route: '/'})).targets.map((t) => t.id)).toEqual([second.id])
  expect(existsSync(fileUnder(stateRoot, `.conciv/design/${first.id}`))).toBe(false)
})

it('scales a retina export to the registered width and records the scale', async () => {
  expect(await call('design_target', {image: target('u1-2560'), route: '/retina', width: 1280})).toMatchObject({
    width: 1280,
    height: 720,
    scale: 0.5,
  })
})

it('clear removes the targets of a route', async () => {
  expect(await call('design_clear', {route: '/retina'})).toEqual({removed: 1})
  expect((await call('design_status', {route: '/retina'})).targets).toEqual([])
})

it('captures the live page at the tab width as a 1x PNG with the component tree', async () => {
  await page.setViewportSize({width: 1280, height: 720})
  const result = await call('design_capture', {width: 1280, height: 720})
  const png = decodePng(readFileSync(fileUnder(stateRoot, result.path)))
  expect([png.width, png.height]).toEqual([1280, 720])
  const toolbar = result.components.find((c) => c.source?.file === 'src/Toolbar.tsx')
  expect(toolbar?.source).toEqual({file: 'src/Toolbar.tsx', line: 4, column: 5})
  expect(toolbar?.children.map((c) => c.text)).toEqual(['Export', 'Create'])
  expect(toolbar?.styles.background).toBe('#ffffff')
})

it('stays 1x when the device pixel ratio is 2', async () => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setDeviceMetricsOverride', {width: 1280, height: 720, deviceScaleFactor: 2, mobile: false})
  const result = await call('design_capture', {width: 1280, height: 720})
  expect(decodePng(readFileSync(fileUnder(stateRoot, result.path))).width).toBe(1280)
  await cdp.send('Emulation.clearDeviceMetricsOverride')
})

it('design_target takes the live route and width when they are omitted', async () => {
  expect(await call('design_target', {image: target('u1-1280')})).toMatchObject({route: '/', width: 1280})
})

it('ranks the toolbar first with an inset delta and reports the missing card, never a width', async () => {
  await goto('/')
  await call('design_target', {image: target('u1-1280'), route: '/', width: 1280})
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
})

it('a recolored toolbar is a background delta and a wider one a fill delta', async () => {
  await goto('recolor')
  expect((await call('design_diff', {})).components[0]?.deltas).toContainEqual(
    expect.objectContaining({kind: 'background', live: '#f5f5f5', target: '#ffffff'}),
  )
  await goto('wide')
  expect((await call('design_diff', {})).components[0]?.deltas.map((d) => d.kind)).toContain('fill')
})

it('an identical page yields no components and no unmatched', async () => {
  await goto('target')
  const report = await call('design_diff', {})
  expect([report.components, report.unmatched]).toEqual([[], []])
  expect(report.mismatch).toBeLessThan(0.005)
})

it('a page without source attributes returns a hint and no components', async () => {
  await goto('/plain.html')
  await call('design_target', {image: target('plain-1280'), route: '/plain.html', width: 1280})
  const report = await call('design_diff', {})
  expect(report.components).toEqual([])
  expect(report.hint).toContain('data-conciv-source')
})

it('names the route and width when no target exists', async () => {
  await expect(rpc.registry.call({name: 'design_diff', input: {width: 1024}})).rejects.toMatchObject({
    message: expect.stringContaining('design_target'),
  })
})

it('the pixelmatch comparator produces the same ranking as blazediff', async () => {
  const other = await boot({config: {comparator: 'pixelmatch'}})
  try {
    await other.goto('/')
    await other.call('design_target', {image: target('u1-1280'), route: '/', width: 1280})
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
  const toolbar = report.components[0]!
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

it('status flips to done when every width matches', async () => {
  await goto('/')
  await call('design_target', {image: target('u1-1280'), route: '/', width: 1280})
  await call('design_diff', {})
  expect((await call('design_status', {route: '/'})).done).toBe(false)
  await goto('target')
  await call('design_diff', {})
  expect(await call('design_status', {route: '/'})).toMatchObject({
    done: true,
    targets: [expect.objectContaining({width: 1280, above: 0})],
  })
})

it('keeps twenty runs per target', async () => {
  for (const _ of Array.from({length: 22})) await call('design_diff', {})
  const id = (await call('design_status', {route: '/'})).targets[0]!.id
  expect(
    (await readdir(fileUnder(stateRoot, `.conciv/design/${id}`))).filter((name) => name.startsWith('live-')),
  ).toHaveLength(20)
})

it('diffs at 390 through an inert hidden frame and leaves the tab untouched', async () => {
  await goto('/')
  await page.fill('#field', 'typed')
  await call('design_target', {image: target('u1-390'), route: '/', width: 390})
  const report = await call('design_diff', {width: 390})
  expect(report.target.width).toBe(390)
  expect(report.components.find((c) => c.source?.file === 'src/Cards.tsx')).toBeDefined()
  const frame = page.locator('iframe[data-conciv-capture]')
  expect(await frame.count()).toBe(1)
  expect(await frame.getAttribute('inert')).not.toBeNull()
  expect(await frame.getAttribute('aria-hidden')).toBe('true')
  expect(await frame.getAttribute('tabindex')).toBe('-1')
  expect(await frame.evaluate((el) => getComputedStyle(el).left)).toBe('-10000px')
  expect(
    await frame.evaluate(
      (el) => (el as HTMLIFrameElement).contentDocument?.querySelector('[data-conciv-script-root]') === null,
    ),
  ).toBe(true)
  expect(await page.inputValue('#field')).toBe('typed')
  await call('design_diff', {width: 390})
  expect(await frame.count()).toBe(1)
})

it('a delta present only at 390 is flagged as a breakpoint delta', async () => {
  await goto('mobile-gap')
  await call('design_diff', {width: 1280})
  const mobile = await call('design_diff', {width: 390})
  expect(mobile.components.flatMap((c) => c.deltas).find((d) => d.kind === 'gap-before')).toMatchObject({
    breakpoint: true,
  })
})

it('clear removes the frame', async () => {
  await call('design_clear', {route: '/'})
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
  await call('design_target', {image: target('plain-1280'), route: '/blocked', width: 390})
  await expect(rpc.registry.call({name: 'design_diff', input: {width: 390}})).rejects.toMatchObject({
    message: expect.stringContaining('chromium'),
  })
  await page.unroute('**/blocked')
})
