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
import type {LiveComponent, Provenance, Winner} from '@conciv/extension-design/types'
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

it('captures at the requested height when the width equals the tab width', async () => {
  await page.setViewportSize({width: 1280, height: 720})
  const result = await call('design_capture', {width: 1280, height: 900})
  const png = decodePng(readFileSync(fileUnder(stateRoot, result.path)))
  expect([png.width, png.height]).toEqual([1280, 900])
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
  await call('design_target', {image: target('plain-1280'), route: '/plain.html', width: 1280})
  const report = await call('design_diff', {})
  expect(report.components).toEqual([])
  expect(report.hint).toContain('data-conciv-source')
})

it('names the route and width when no target exists', async () => {
  const message = await rpc.registry.call({name: 'design_diff', input: {width: 1024}}).then(
    () => '',
    (error: unknown) => String(error),
  )
  expect(message).toContain('design_target')
  expect(message).toContain('/plain.html')
  expect(message).toContain('1024')
})

it('refuses to diff a target while the tab shows another route', async () => {
  const registered = await call('design_target', {image: target('u1-1280'), route: '/', width: 1280})
  await expect(rpc.registry.call({name: 'design_diff', input: {target: registered.id}})).rejects.toMatchObject({
    code: 'route-mismatch',
    message: expect.stringContaining('/plain.html'),
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
  await call('design_target', {image: target('u1-1280'), route: '/', width: 1280})
  const report = await call('design_diff', {})
  expect(report.components).toContainEqual(
    expect.objectContaining({source: expect.objectContaining({file: 'src/Toolbar.tsx'}), tag: 'header', deltas: []}),
  )
  const status = await call('design_status', {route: '/'})
  expect(status.done).toBe(false)
  expect(status.targets[0]?.above).toBeGreaterThan(0)
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

it('status without a route finds the targets registered for the pathname of the live route', async () => {
  await goto('target')
  const registered = await call('design_target', {image: target('u1-1280'), route: '/', width: 1280})
  expect(await call('design_status', {})).toMatchObject({
    route: '/',
    targets: [expect.objectContaining({id: registered.id})],
  })
})

it('keeps twenty runs per target', async () => {
  for (const _ of Array.from({length: 21})) await call('design_diff', {})
  const first = (await call('design_status', {route: '/'})).targets[0]
  expect(first).toBeDefined()
  if (first === undefined) return
  const names = await readdir(fileUnder(stateRoot, `.conciv/design/${first.id}`))
  expect(['live-', 'diff-', 'result-'].map((prefix) => names.filter((name) => name.startsWith(prefix)).length)).toEqual(
    [20, 20, 20],
  )
}, 360_000)

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
  expect(
    await frame.evaluate(
      (el) =>
        el instanceof HTMLIFrameElement && el.contentDocument?.querySelector('[data-conciv-script-root]') === null,
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
  const gap = mobile.components.flatMap((c) => c.deltas).find((d) => d.kind === 'gap-before')
  expect(gap).toMatchObject({breakpoint: true, file: 'src/card.module.css'})
  expect(gap?.declaration).toBe('gap: 16px')
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
  const start = Date.now()
  await expect(rpc.registry.call({name: 'design_diff', input: {width: 390}})).rejects.toMatchObject({
    message: expect.stringContaining('chromium'),
  })
  expect(Date.now() - start).toBeLessThan(6_000)
  await page.unroute('**/blocked')
})

describe('x-ray page', () => {
  it('a diff report links the x-ray page of its target and the page serves', async () => {
    await goto('target')
    const registered = await call('design_target', {image: target('u1-1280'), route: '/', width: 1280})
    const report = await call('design_diff', {width: 1280})
    expect(report.xray).toContain(`/api/ext/design/xray?target=${registered.id}`)
    const html = await fetch(report.xray)
    expect(html.status).toBe(200)
    expect(await html.text()).toContain('<script type="module"')
    expect((await fetch(report.xray.replace(registered.id, 'nope'))).status).toBe(404)
  })

  it('serves the run images and refuses paths outside the design dir', async () => {
    const report = await call('design_diff', {width: 1280})
    const base = new URL(report.xray).origin
    expect((await fetch(`${base}/api/ext/design/files/${report.livePath}`)).headers.get('content-type')).toBe(
      'image/png',
    )
    expect(await rawStatus({origin: base, path: '/api/ext/design/files/../../package.json'})).toBe(404)
    expect(await rawStatus({origin: base, path: '/api/ext/design/files//etc/hosts'})).toBe(404)
  })

  it('renders the rail from the last run and opens the inspector on the first component', async () => {
    await goto('/')
    const report = await call('design_diff', {width: 1280})
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
    const report = await call('design_diff', {width: 1280})
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
    const report = await call('design_diff', {width: 1280})
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
    const report = await call('design_diff', {width: 1280})
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
    const narrow = await call('design_target', {image: target('u1-390'), route: '/', width: 390})
    const report = await call('design_diff', {width: 1280})
    const xray = await browser.newPage()
    await xray.goto(`${report.xray}&view=capture`)
    await xray.getByRole('radiogroup', {name: 'Viewport'}).getByText('390').click()
    await expectLocator(xray.getByRole('radio', {name: '390'})).toBeChecked()
    await expectLocator(xray).toHaveURL((url) => url.search.includes(narrow.id) && url.search.includes('view=capture'))
    await expectLocator(xray.getByRole('radio', {name: 'Capture'})).toBeChecked()
    await xray.close()
  })

  it('capture view shows the stage', async () => {
    await goto('/')
    const report = await call('design_diff', {width: 1280})
    const xray = await browser.newPage()
    await xray.goto(`${report.xray}&view=capture`)
    await expectLocator(xray.getByRole('radio', {name: 'Capture'})).toBeChecked()
    await expectLocator(xray.getByRole('radio', {name: 'Slider'})).toBeChecked()
    await expectLocator(xray.getByRole('radio', {name: 'Side by side'})).toBeVisible()
    await expectLocator(xray.getByRole('figure')).toContainText('Live over design')
    await xray.close()
  })

  it('capture view keeps the off count pill off the stage', async () => {
    await goto('/')
    const report = await call('design_diff', {width: 1280})
    const above = report.components.filter((part) => part.deltas.length > 0).length + report.unmatched.length
    const pill = `${above} of ${report.components.length + report.unmatched.length} off`
    const xray = await browser.newPage()
    await xray.goto(report.xray)
    await expectLocator(xray.getByText(pill)).toBeVisible()
    await xray.goto(`${report.xray}&view=capture`)
    await expectLocator(xray.getByRole('figure')).toContainText('Live over design')
    await expectLocator(xray.getByText(pill)).toHaveCount(0)
    await xray.close()
  })

  it('a row keyed by its source attribute shows the element tag, not the attribute selector', async () => {
    await goto('/')
    const report = await call('design_diff', {width: 1280})
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

  it('a width without a run offers exactly one Run diff', async () => {
    await goto('/')
    const unrun = await call('design_target', {image: target('u1-390'), route: '/', width: 390, name: 'unrun'})
    const report = await call('design_diff', {width: 1280})
    const url = new URL(report.xray)
    url.searchParams.set('target', unrun.id)
    const xray = await browser.newPage()
    await xray.goto(url.toString())
    await expectLocator(xray.getByText('No diff for')).toBeVisible()
    await expectLocator(xray.getByRole('button', {name: 'Run diff'})).toHaveCount(1)
    await xray.close()
  })

  it('a region without a source falls back to its kind and cannot open', async () => {
    await goto('missing')
    const report = await call('design_diff', {width: 1280})
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
    const report = await call('design_diff', {width: 1280})
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
})

const colorDistance = differenceCiede2000()

function sameSource(input: {a: LiveComponent['source']; b: LiveComponent['source']}): boolean {
  const {a, b} = input
  return a !== null && b !== null && a.file === b.file && a.line === b.line && a.column === b.column
}

async function toolbarButtons(): Promise<LiveComponent[]> {
  const captured = await call('design_capture', {width: 1280, height: 720})
  const toolbar = captured.components.find((c) => c.source?.file === 'src/Toolbar.tsx')
  return toolbar?.children ?? []
}

const StoredModelSchema = z.object({
  root: z.object({
    children: z.array(
      z.object({
        kind: z.string().optional(),
        text: z.string().optional(),
        box: z.object({x: z.number(), y: z.number(), w: z.number(), h: z.number()}),
      }),
    ),
  }),
})

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
    const registered = await call('design_target', {image: target('u1-1280'), route: '/', width: 1280})
    expect(registered.text?.runs).toBeGreaterThan(0)
    const stored = StoredModelSchema.parse(
      JSON.parse(await readFile(fileUnder(stateRoot, `.conciv/design/${registered.id}/model.json`), 'utf8')),
    )
    const label = stored.root.children.find((child) => child.kind === 'text' && child.text?.toLowerCase() === 'export')
    expect(label).toBeDefined()
    expect(first).toBeDefined()
    if (label === undefined || first === undefined) return
    expect(inside({inner: label.box, outer: first.box})).toBe(true)
  })

  it('a recolored label is a foreground delta measured from glyph ink', async () => {
    await goto('text-recolor')
    await call('design_target', {image: target('u1-1280'), route: '/', width: 1280})
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
    await call('design_target', {image: target('u1-1280'), route: '/', width: 1280})
    const report = await call('design_diff', {})
    expect(report.components.flatMap((c) => c.deltas)).toEqual([])
    expect(report.components.filter(aboveTolerance)).toEqual([])
    expect((await call('design_status', {route: '/'})).done).toBe(true)
  })

  it('a container whose own paint changed stays reported when its text is noise', async () => {
    await goto('badge-textnoise')
    await call('design_target', {image: target('u1-1280'), route: '/', width: 1280})
    const report = await call('design_diff', {})
    const header = report.components.find((c) => fromToolbar(c) && c.tag === 'header')
    expect(header?.deltas).toEqual([])
    expect(header?.mismatch).toBeGreaterThanOrEqual(TILE_GATE)
    expect(report.components.filter((c) => fromToolbar(c) && c.tag === 'button').filter(aboveTolerance)).toEqual([])
    expect((await call('design_status', {route: '/'})).done).toBe(false)
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
    await call('design_target', {image: target('u1-1280-firefox'), route: '/', width: 1280})
    const report = await call('design_diff', {})
    expect(report.components.filter((c) => fromToolbar(c) && aboveTolerance(c))).toEqual([])
    expect(report.components.flatMap((c) => c.deltas.map((d) => d.kind))).not.toContain('foreground')
    expect(report.components.flatMap((c) => c.deltas.map((d) => d.kind))).not.toContain('text')
    expect((await call('design_status', {route: '/'})).done).toBe(true)
  })

  it('a changed label is a text delta on the button that paints it', async () => {
    await goto('text-changed')
    await call('design_target', {image: target('u1-1280'), route: '/', width: 1280})
    const [first] = await toolbarButtons()
    const report = await call('design_diff', {})
    const texts = report.components.flatMap((c) =>
      c.deltas.filter((d) => d.kind === 'text').map((delta) => ({component: c, delta})),
    )
    expect(texts).toHaveLength(1)
    expect(texts[0]?.component.source).toEqual(first?.source)
    expect(texts[0]?.delta).toMatchObject({
      live: 'Download',
      target: 'Export',
      via: 'source',
      file: 'src/Toolbar.tsx',
    })
  })
})
