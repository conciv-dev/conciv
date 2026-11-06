/* oxlint-disable playwright/no-raw-locators, playwright/prefer-web-first-assertions -- these cases read the tab field and the mirror host directly */
import {createHash} from 'node:crypto'
import {existsSync, readFileSync} from 'node:fs'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {request as httpRequest} from 'node:http'
import {tmpdir} from 'node:os'
import {isAbsolute, join} from 'node:path'
import {setImmediate as nextTurn} from 'node:timers/promises'
import {fileURLToPath} from 'node:url'
import react from '@vitejs/plugin-react'
import {differenceCiede2000} from 'culori'
import pixelmatch from 'pixelmatch'
import {chromium, type Browser, type Page} from 'playwright'
import {expect as expectLocator} from 'playwright/test'
import {PNG} from 'pngjs'
import {createStorage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import memoryDriver from 'unstorage/drivers/memory'
import {createServer} from 'vite'
import {afterAll, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {makeRpcClient, ToolCommandSignatureSchema, type RpcClient} from '@conciv/contract'
import {CONCIV_SESSION_HEADER, type SessionId} from '@conciv/protocol/chat-types'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {EXTENSIONS_ROUTE} from '@conciv/extension-compiler/extensions'
import {awaitPagePlaneSubscribed} from '@conciv/extension-testkit/page-plane'
import {holdSilentSubscriber} from '@conciv/extension-testkit/push-wire'
import {makeExtRpcClient, type AnyToolBuilder} from '@conciv/extension'
import type {} from '@conciv/extension-design/client'
import type {XrayRouter} from '@conciv/extension-design/server'
import {
  DESIGN_TOOLS,
  RunSchema,
  type Box,
  type Design,
  type Delta,
  type DesignNode,
  type DiffReport,
  type LiveComponent,
  type Match,
  type Raster,
  type Run,
} from '@conciv/extension-design/defs'
import {designConfig} from '../../extensions/design/src/shared/tolerances.js'
import {walk} from '../../extensions/design/src/shared/tree.js'
import {createStore} from '../../extensions/design/src/server/store.js'
import {createWords} from '../../extensions/design/src/server/words.js'
import {createRaster} from '../../extensions/design/src/server/raster.js'
import {createImageAdapter} from '../../extensions/design/src/server/sources/image.js'
import {createProvenance} from '../../extensions/design/src/server/provenance.js'
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
const PAIR_BUDGET_MS = 20_000
const MEASURE_TIMEOUT_MS = 60_000

const CatalogSchema = z.array(ToolCommandSignatureSchema)
const EndpointSchema = z.object({apiBase: z.string().min(1)})

const [targetDef, diffDef, statusDef, watchDef, captureDef, , , winnerDef, clearDef] = DESIGN_TOOLS
const DESIGN_TOOL_BUILDERS: readonly AnyToolBuilder[] = DESIGN_TOOLS

type DesignConfigInput = NonNullable<ConcivConfig['extensions']>['design']
type ToolOutput<Tool extends {outputSchema?: z.ZodType}> = z.output<NonNullable<Tool['outputSchema']>>
type TargetResult = ToolOutput<typeof targetDef>
type StatusReport = ToolOutput<typeof statusDef>
type CaptureResult = Omit<ToolOutput<typeof captureDef>, 'components'> & {components: LiveComponent[]}
type WinnerResult = ToolOutput<typeof winnerDef>
type ClearResult = ToolOutput<typeof clearDef>
type CompactReport = ToolOutput<typeof diffDef>
type Winner = NonNullable<WinnerResult[string]>
type TextNode = Extract<DesignNode, {kind: 'text'}>

const LiveComponentsSchema = RunSchema.shape.extras
const FullReportSchema = z.custom<DiffReport>((value) => diffDef.outputSchema?.safeParse(value).success === true)

function compactReport(raw: unknown): CompactReport {
  const schema = diffDef.outputSchema
  if (schema === undefined) throw new Error('design_diff declares no output schema')
  return schema.parse(raw)
}

function decodePng(bytes: Buffer): PNG {
  return PNG.sync.read(bytes)
}

type Call = {
  (name: 'design_target', input: z.input<typeof targetDef.inputSchema>): Promise<TargetResult>
  (name: 'design_diff', input: z.input<typeof diffDef.inputSchema>): Promise<DiffReport>
  (name: 'design_status', input: z.input<typeof statusDef.inputSchema>): Promise<StatusReport>
  (name: 'design_capture', input: z.input<typeof captureDef.inputSchema>): Promise<CaptureResult>
  (name: 'design_winner', input: z.input<typeof winnerDef.inputSchema>): Promise<WinnerResult>
  (name: 'design_clear', input: z.input<typeof clearDef.inputSchema>): Promise<ClearResult>
}

type Kit = {
  rpc: RpcClient
  browser: Browser
  page: Page
  origin: string
  apiBase: string
  session: SessionId
  stateRoot: string
  targetsDir: string
  call: Call
  goto: (to: string) => Promise<void>
  dispose: () => Promise<void>
}

function makeCall(rpc: RpcClient): Call {
  function call(name: 'design_target', input: z.input<typeof targetDef.inputSchema>): Promise<TargetResult>
  function call(name: 'design_diff', input: z.input<typeof diffDef.inputSchema>): Promise<DiffReport>
  function call(name: 'design_status', input: z.input<typeof statusDef.inputSchema>): Promise<StatusReport>
  function call(name: 'design_capture', input: z.input<typeof captureDef.inputSchema>): Promise<CaptureResult>
  function call(name: 'design_winner', input: z.input<typeof winnerDef.inputSchema>): Promise<WinnerResult>
  function call(name: 'design_clear', input: z.input<typeof clearDef.inputSchema>): Promise<ClearResult>
  async function call(name: string, input: Record<string, unknown>): Promise<unknown> {
    if (name === diffDef.name) {
      return FullReportSchema.parse(await rpc.registry.call({name, input: {full: true, ...input}}))
    }
    if (name === captureDef.name && captureDef.outputSchema !== undefined) {
      const captured = captureDef.outputSchema.parse(await rpc.registry.call({name, input}))
      return {...captured, components: LiveComponentsSchema.parse(captured.components)}
    }
    const def = DESIGN_TOOL_BUILDERS.find((candidate) => candidate.name === name)
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
    apiBase,
    session,
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

const NO_BORDER = {width: 0, style: 'none', color: '#000000', side: 'top' as const}
const NO_STYLES = {
  background: '',
  color: '',
  fontSize: 0,
  lineHeight: 0,
  fontWeight: 0,
  fontFamily: '',
  textAlign: 'start',
  radius: 0,
  position: 'static',
  sizing: {width: 'auto' as const, height: 'auto' as const},
  border: NO_BORDER,
  gradient: null,
}

const PROVENANCE_SELECTOR = '[data-conciv-source="fixture"]'
const DELTA_FOR_PROPERTY: Record<string, Delta['kind']> = {
  'padding-left': 'inset-left',
  gap: 'gap-before',
  color: 'foreground',
}

type Provenance = Pick<Delta, 'via' | 'file' | 'line' | 'column' | 'declaration' | 'selector' | 'suggest'>

async function mapFixture(input: {
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
    key: null,
    instance: null,
    owner: null,
    tag: 'div',
    text: '',
    box: {x: 0, y: 0, w: 0, h: 0},
    textBox: null,
    glyphs: [],
    axis: null,
    columns: null,
    styles: NO_STYLES,
    role: null,
    hints: [],
    index: 1,
    path: '/1',
    drawn: false,
    placeholder: null,
    children: [],
  }
  const kind = DELTA_FOR_PROPERTY[input.property]
  if (kind === undefined) throw new Error(`no delta kind reads ${input.property}`)
  const provenance = createProvenance({
    project: createStorage({driver: fsDriver({base: PROVENANCE_DIR, readOnly: true})}),
    cwd: PROVENANCE_DIR,
    bundler: undefined,
  })
  try {
    const [[attributed] = []] = await provenance.attribute({
      entries: [
        {
          deltas: [{kind, live: input.value, target: input.target}],
          live: component,
          selector: PROVENANCE_SELECTOR,
          host: {selector: PROVENANCE_SELECTOR, live: component},
        },
      ],
      page: {call: async () => ({[input.property]: winner})},
      width: 1280,
      height: 720,
    })
    if (attributed === undefined) throw new Error('the provenance stage returned no delta')
    const {via, file, line, column, declaration, selector, suggest} = attributed
    return {via, file, line, column, declaration, selector, suggest}
  } finally {
    provenance.dispose()
  }
}

process.env.LAUNCH_EDITOR = 'true'

const kit = await boot()
const {rpc, browser, page, stateRoot, call, goto} = kit
const xrayRpc = makeExtRpcClient<XrayRouter>(kit.apiBase, 'design')
const designWords = createWords({config: designConfig.parse({}), cwd: HOST_ROOT})
const store = createStore({
  state: createStorage({driver: fsDriver({base: join(stateRoot, '.conciv', 'design')})}),
  words: designWords,
})

afterAll(() => kit.dispose())

type StoredNode = {
  id: string
  kind: DesignNode['kind']
  box: Box
  within: string | undefined
  text?: string
  lines?: TextNode['lines']
  role?: TextNode['role']
  typography?: TextNode['typography']
  holds?: number
  radius?: number
  paint?: Extract<DesignNode, {kind: 'box'}>['paint']
  layout?: DesignNode['layout']
}

type Pair = {
  node: string
  path: string
  fingerprint: {tag: string; key: string | null; source: LiveComponent['source']}
}

type LedgerEntry = {
  status: Match['status']
  since: string
  pair: Pair | null
  item: Run['items'][number] | null
}

type StoredLedger = {run: string; nodes: Record<string, LedgerEntry>}

async function storedNodes(id: string): Promise<StoredNode[]> {
  const design = await store.design(id)
  return [...walk(design.root)].flatMap(({node, parent}) =>
    parent === null ? [] : [viewOf({node, within: parent === design.root ? undefined : parent.id})],
  )
}

function viewOf(input: {node: Match['node']; within: string | undefined}): StoredNode {
  const {node, within} = input
  const base = {id: node.id, kind: node.kind, box: node.box, within, layout: node.layout}
  if (node.kind === 'text') {
    return {...base, text: node.text, lines: node.lines, role: node.role, typography: node.typography}
  }
  if (node.kind === 'image') return {...base, holds: node.holds}
  return {...base, radius: node.radius, paint: node.paint}
}

async function runNodes(id: string): Promise<StoredNode[]> {
  const run = await storedRun({id})
  return [...walk(run.root)].flatMap(({node: match, parent}) =>
    parent === null ? [] : [viewOf({node: match.node, within: parent === run.root ? undefined : parent.node.id})],
  )
}

function runIds(id: string): Promise<string[]> {
  return store.runs(id)
}

async function storedRun(input: {id: string; run?: string}): Promise<Run> {
  const {id, run} = input
  const found = run === undefined ? await store.latest(id) : await store.run({id, run})
  if (found === null) throw new Error(`target ${id} has no run ${run ?? ''}`)
  return found
}

function pairsOf(run: Run): Pair[] {
  return [...walk(run.root)].flatMap(({node: match, depth}) =>
    depth === 0 || match.live === null ? [] : [pairOf({match, live: match.live})],
  )
}

function pairOf(input: {match: Match; live: NonNullable<Match['live']>}): Pair {
  const {match, live} = input
  return {node: match.node.id, path: live.path, fingerprint: {tag: live.tag, key: live.key, source: live.source}}
}

async function latestPairs(id: string): Promise<Pair[]> {
  return pairsOf(await storedRun({id}))
}

async function runPairs(input: {id: string; run: string}): Promise<Map<string, Pair>> {
  return new Map(pairsOf(await storedRun(input)).map((pair) => [pair.node, pair]))
}

async function storedPairs(input: {id: string; run: string}): Promise<Map<string, string>> {
  return new Map([...(await runPairs(input)).values()].map((pair) => [pair.node, pair.path]))
}

async function storedLedger(id: string): Promise<StoredLedger> {
  const run = await storedRun({id})
  const items = new Map<string, Run['items'][number]>()
  run.items.forEach((item) => {
    if (item.node !== undefined && !items.has(item.node)) items.set(item.node, item)
  })
  const nodes = [...walk(run.root)].flatMap(({node: match, depth}): [string, LedgerEntry][] =>
    depth === 0
      ? []
      : [
          [
            match.node.id,
            {
              status: match.status,
              since: match.since,
              pair: match.live === null ? null : pairOf({match, live: match.live}),
              item: items.get(match.node.id) ?? null,
            },
          ],
        ],
  )
  return {run: run.id, nodes: Object.fromEntries(nodes)}
}

function reportRun(report: DiffReport): string {
  return report.livePath.split('/').at(-2) ?? ''
}

function hashed(node: DesignNode): DesignNode {
  const children = node.children.map(hashed)
  const own = JSON.stringify({...node, hash: '', children: []})
  const hash = createHash('sha256')
    .update(own)
    .update(children.map((child) => child.hash).join(' '))
    .digest('hex')
  return {...node, hash, children}
}

function mapped(input: {node: DesignNode; map: (node: DesignNode) => DesignNode}): DesignNode {
  const node = input.map(input.node)
  return {...node, children: node.children.map((child) => mapped({node: child, map: input.map}))}
}

async function editDesign(input: {id: string; figma?: boolean; map: (node: DesignNode) => DesignNode}): Promise<void> {
  const {id} = input
  const [design, image, record] = await Promise.all([store.design(id), store.image({id}), store.record(id)])
  if (image === null || record === null) throw new Error(`target ${id} is not stored`)
  const source = input.figma === true ? {kind: 'figma' as const, ref: design.source.ref} : design.source
  await store.put({
    design: {...design, source, root: hashed(mapped({node: design.root, map: input.map}))},
    image,
    session: kit.session,
    ...(record.route === undefined ? {} : {route: record.route}),
  })
}

async function putDesign(input: {
  id: string
  png: PNG
  children: DesignNode[]
  route: string | undefined
}): Promise<void> {
  const {id, png, route} = input
  const design: Design = {
    id,
    source: {kind: 'figma', ref: id},
    viewport: {width: png.width, height: png.height},
    scale: 1,
    root: hashed({
      id: 'root',
      hash: '',
      box: {x: 0, y: 0, w: png.width, h: png.height},
      kind: 'box',
      border: null,
      radius: 0,
      children: input.children,
    }),
  }
  await store.put({
    design,
    image: PNG.sync.write(png),
    session: kit.session,
    ...(route === undefined ? {} : {route}),
  })
}

async function targetPng(id: string): Promise<PNG> {
  const image = await store.image({id})
  if (image === null) throw new Error(`target ${id} has no image`)
  return PNG.sync.read(Buffer.from(image))
}

function boxNode(input: {id: string; box: Box; children?: DesignNode[]; paint?: {background: string}}): DesignNode {
  return {
    id: input.id,
    hash: '',
    box: input.box,
    kind: 'box',
    border: null,
    radius: 0,
    ...(input.paint === undefined ? {} : {paint: input.paint}),
    children: input.children ?? [],
  }
}

function textNode(input: {id: string; box: Box; words: string}): DesignNode {
  return {
    id: input.id,
    hash: '',
    box: input.box,
    kind: 'text',
    text: input.words,
    lines: [{box: input.box, text: input.words, confidence: 1}],
    confidence: 1,
    children: [],
  }
}

function imageNode(input: {id: string; box: Box}): DesignNode {
  return {id: input.id, hash: '', box: input.box, kind: 'image', holds: 0, children: []}
}

it('declares seven design tools with the flags from the spec', async () => {
  const catalog = CatalogSchema.parse(await rpc.registry.catalog(undefined)).filter((entry) =>
    entry.name.startsWith('design_'),
  )
  expect(catalog.map((entry) => entry.name)).toEqual([
    'design_target',
    'design_diff',
    'design_status',
    'design_watch',
    'design_capture',
    'design_winner',
    'design_clear',
  ])
  expect(catalog.map((entry) => entry.mutating)).toEqual([true, false, false, false, false, false, true])
  expect(catalog.every((entry) => entry.category === 'design' && entry.approval === undefined)).toBe(true)
  expect(diffDef.inputSchema.parse({})).toEqual({depth: 3, limit: 12})
})

it('registers a PNG target sized by its header, and the same bytes keep their id and decisions', async () => {
  const first = await call('design_target', {image: target('u1-1280')})
  expect(first).toMatchObject({route: '/', width: 1280, height: 720, scale: 1})
  const decided = await store.decide({id: first.id, kind: 'pin', anchor: 'text-0', value: null})
  await call('design_target', {image: target('u1-2560'), scale: 2})
  const second = await call('design_target', {image: target('u1-1280'), name: 'invoices'})
  expect(second.id).toBe(first.id)
  expect((await call('design_status', {})).targets.map((t) => t.id)).toEqual([first.id])
  expect(
    (await store.decisions(first.id)).filter((decision) => decision.kind !== 'twin' && decision.kind !== 'typography'),
  ).toEqual([decided])
})

it('divides the header width of a retina export by the stated scale and diffs it through alignment', async () => {
  expect(await call('design_target', {image: target('u1-2560'), scale: 2})).toMatchObject({
    width: 1280,
    height: 720,
    scale: 2,
  })
  await goto('target')
  const report = await call('design_diff', {})
  expect([report.components, report.unmatched]).toEqual([[], []])
  expect(report.stop).toBe('done')
})

it('clear removes a target by id', async () => {
  const retina = await call('design_target', {image: target('u1-2560'), scale: 2})
  expect(await call('design_clear', {target: retina.id})).toEqual({removed: 1})
  expect([await store.record(retina.id), await runIds(retina.id)]).toEqual([null, []])
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

it('stays 1x when the device pixel ratio is 2, and captures the live page without a frame', async () => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setDeviceMetricsOverride', {width: 1280, height: 720, deviceScaleFactor: 2, mobile: false})
  const result = await call('design_capture', {height: 720})
  expect(decodePng(readFileSync(fileUnder(stateRoot, result.path))).width).toBe(1280)
  expect(await page.locator('[data-conciv-mirror]').count()).toBe(0)
  await cdp.send('Emulation.clearDeviceMetricsOverride')
})

it('the live capture paints a grid item placed through a display contents wrapper where the page lays it out', async () => {
  await goto('contents')
  await freshTarget('u1-1280')
  const report = await call('design_diff', {})
  expect(report.capturePath).toBe('snapdom-live')
  const png = decodePng(readFileSync(fileUnder(stateRoot, report.livePath)))
  const box = await page.locator('.contents-placed').boundingBox()
  if (box === null) throw new Error('the placed grid item has no box')
  const x = Math.round(box.x + box.width / 2)
  const y = Math.round(box.y + box.height / 2)
  const at = (y * png.width + x) * 4
  expect([...png.data.subarray(at, at + 3)]).toEqual([255, 0, 0])
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

it('a recolored toolbar is a background delta', async () => {
  await goto('recolor')
  const recolored = (await call('design_diff', {})).components[0]?.deltas
  expect(recolored).toContainEqual(expect.objectContaining({kind: 'background', live: '#f5f5f5', target: '#ffffff'}))
})

it('an identical page yields no components and no unmatched', async () => {
  await goto('target')
  const report = await call('design_diff', {})
  expect([report.components, report.unmatched]).toEqual([[], []])
  expect(report.mismatch).toBeLessThan(0.005)
})

it('a page diffed against its own capture has similarity 1', async () => {
  await goto('target')
  const captured = await call('design_capture', {height: 720})
  await call('design_clear', {all: true})
  await call('design_target', {image: (await readFile(captured.path)).toString('base64')})
  const report = await call('design_diff', {})
  expect(report.similarity).toBe(1)
  expect((await call('design_status', {})).similarity).toBe(1)
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

it('a blind diff returns its brief without the live and diff images', async () => {
  const other = await boot({config: {blind: true}})
  try {
    await other.goto('/')
    await other.call('design_target', {image: target('u1-1280')})
    const report = z
      .object({brief: z.array(z.string())})
      .loose()
      .parse(await other.rpc.registry.call({name: 'design_diff', input: {}}))
    expect(report.brief.length).toBeGreaterThan(0)
    expect(report).not.toHaveProperty('livePath')
    expect(report).not.toHaveProperty('diffImage')
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
  const [runZero] = await runIds(current.id)
  const styles = await readFile(HOST_STYLES, 'utf8')
  try {
    for (const round of Array.from({length: 21}, (_, index) => index)) {
      await repaint({id: current.id, styles, round})
      await call('design_diff', {})
    }
  } finally {
    await writeFile(HOST_STYLES, styles)
  }
  const runs = await runIds(current.id)
  const images = await Promise.all(
    runs.flatMap((run) => (['live', 'diff'] as const).map((kind) => store.image({id: current.id, run, kind}))),
  )
  expect([
    images.filter((image, index) => index % 2 === 0 && image !== null).length,
    images.filter((image, index) => index % 2 === 1 && image !== null).length,
    runs.length,
  ]).toEqual([21, 21, 21])
  expect(runs).toContain(runZero)
}, 360_000)

it('diffs a 390 target from a 1280 tab in the mirror and leaves the tab untouched', async () => {
  await goto('/')
  await page.fill('#field', 'typed')
  await call('design_target', {image: target('u1-390')})
  const report = await call('design_diff', {})
  expect(report).toMatchObject({target: {width: 390}, capturePath: 'snapdom-mirror', sources: ['mirror']})
  expect(report.components.find((c) => c.source?.file === 'src/Cards.tsx')).toBeDefined()
  const deltas = report.components.flatMap((c) => c.deltas)
  expect(deltas.length).toBeGreaterThan(0)
  expect(deltas.every((d) => d.source === 'mirror' && d.width === 390)).toBe(true)
  expect(await page.inputValue('#field')).toBe('typed')
  expect(page.viewportSize()).toEqual({width: 1280, height: 720})
})

it('a delta measured at 390 in the mirror names its declaration from the mirror snapshot', async () => {
  await goto('mobile-gap')
  await call('design_target', {image: target('u1-390')})
  const mobile = await call('design_diff', {})
  const gap = mobile.components.flatMap((c) => c.deltas).find((d) => d.kind === 'gap-before')
  expect(gap).toMatchObject({width: 390, source: 'mirror', file: 'src/card.module.css'})
  expect(gap?.declaration).toBe('gap: 16px')
})

it('design_winner with width 390 reads the mirror and names src/card.module.css', async () => {
  await goto('mobile-gap')
  const winners = await call('design_winner', {selector: 'section', properties: ['gap'], width: 390})
  expect(winners['gap']).toMatchObject({
    value: '16px',
    conditions: ['@media (max-width: 600px)'],
    sheet: expect.objectContaining({viteDevId: expect.stringContaining('src/card.module.css')}),
  })
  const live = await call('design_winner', {selector: 'section', properties: ['gap']})
  expect(live['gap']).toMatchObject({value: '8px'})
})

it('the unchanged fixture against u1-1280 from a 1392 tab has nothing above tolerance', async () => {
  await page.setViewportSize({width: 1392, height: 720})
  try {
    await goto('target')
    await call('design_target', {image: target('u1-1280')})
    const report = await call('design_diff', {})
    expect(report).toMatchObject({capturePath: 'snapdom-mirror', sources: ['mirror']})
    expect([report.components, report.unmatched]).toEqual([[], []])
    expect((await call('design_status', {})).done).toBe(true)
  } finally {
    await page.setViewportSize({width: 1280, height: 720})
  }
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
    await goto('/plain.html')
    const unrun = await call('design_target', {image: target('u1-390'), name: 'unrun', route: '/'})
    await goto('/')
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
    const kind = region.label ?? `${region.kind} region`
    const box = region.target
    const name =
      box === undefined || kind.startsWith('text "')
        ? kind
        : `${kind} at ${Math.round(box.x)},${Math.round(box.y)} (${Math.round(box.w)}×${Math.round(box.h)})`
    const xray = await browser.newPage()
    await xray.goto(report.xray)
    await xray.getByRole('button', {name}).first().click()
    const card = xray.getByRole('region', {name})
    await expectLocator(card.getByRole('button', {name: 'Open source'})).toBeDisabled()
    await xray.close()
  })

  it('a source change runs the diff again, so the stale badge clears', async () => {
    await goto('/')
    const report = await call('design_diff', {})
    const before = (await call('design_status', {})).targets[0]?.lastAt ?? 0
    const xray = await browser.newPage()
    await xray.goto(report.xray)
    await expectLocator(xray.getByRole('listitem').first()).toBeVisible()
    await writeFile(HOST_STYLES, await readFile(HOST_STYLES))
    await expect
      .poll(async () => (await call('design_status', {})).targets[0]?.lastAt ?? 0, {timeout: 15_000})
      .toBeGreaterThan(before)
    await xray.reload()
    await expectLocator(xray.getByRole('listitem').first()).toBeVisible()
    await expectLocator(xray.getByText('stale: source changed')).toHaveCount(0)
    await xray.close()
    const pane = await openPane()
    await expectLocator(pane.getByRole('listitem').first()).toBeVisible()
    await expectLocator(pane.getByText('stale: source changed')).toHaveCount(0)
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

  it('a confusable or lone chevron beside a button label is the same text as the design reads', async ({annotate}) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    await call('design_diff', {})
    const before = await buttonTextItems(id)
    const source = await readFile(STRIPE_SOURCE, 'utf8')
    try {
      await rewrite({
        id,
        file: STRIPE_SOURCE,
        text: source.replace('>Contact sales<', '>Contact sales ›<').replace('>Get started ›<', '>Get started<'),
      })
      await call('design_diff', {})
      const after = await buttonTextItems(id)
      await annotate(`content items before ${JSON.stringify(before)} after ${JSON.stringify(after)}`)
      expect([before, after]).toEqual([[], []])
    } finally {
      await writeFile(STRIPE_SOURCE, source)
    }
  }, 240_000)
})

const BUTTON_LABELS = ['Contact sales', 'Get started']

async function buttonTextItems(id: string): Promise<string[]> {
  const ledger = await storedLedger(id)
  return Object.values(ledger.nodes).flatMap((entry) =>
    entry.item !== null &&
    entry.item.stage === 'content' &&
    BUTTON_LABELS.some((label) => entry.item?.sentence.includes(label))
      ? [entry.item.sentence]
      : [],
  )
}

function intersects(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
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

  it('the layout pass records the u1-1280 cards as a row of two that fill it', async () => {
    await goto('target')
    const captured = await call('design_capture', {height: 720})
    const registered = await call('design_target', {image: target('u1-1280')})
    const design = await store.design(registered.id)
    const nodes = await storedNodes(registered.id)
    const articles = captured.components
      .filter((c) => c.source?.file === 'src/Cards.tsx')
      .flatMap((c) => c.children.filter((child) => child.tag === 'article'))
    const cards = nodes
      .filter((node) => node.kind === 'box' && articles.some((article) => near({a: node.box, b: article.box})))
      .toSorted((a, b) => a.box.x - b.box.x)
    const holder = [...walk(design.root)].find(({node}) => node.id === cards[0]?.within)?.node ?? design.root
    expect(cards.map((card) => card.layout?.size)).toEqual(['fill', 'fill'])
    expect(holder.layout?.runs).toContainEqual({
      direction: 'row',
      children: cards.map((card) => card.id),
      gap: {px: 8, uniform: true},
      align: 'stretch',
      wrap: false,
    })
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

describe('twins', () => {
  it('two sibling boxes with the same rect register as one node that keeps the twin children', async () => {
    await goto('target')
    const captured = await call('design_capture', {height: 720})
    const toolbar = captured.components.find((c) => c.source?.file === 'src/Toolbar.tsx')
    if (toolbar === undefined) throw new Error('the target page has no toolbar')
    const {id, route} = await freshTarget('u1-1280')
    const png = await targetPng(id)
    const paint = {background: '#ffffff'}
    await putDesign({
      id: 'twins',
      png,
      route,
      children: [
        boxNode({
          id: 'twin-kept',
          box: toolbar.box,
          paint,
          children: [imageNode({id: 'twin-child', box: {x: toolbar.box.x + 8, y: toolbar.box.y + 8, w: 16, h: 16}})],
        }),
      ],
    })
    const report = await call('design_diff', {full: true})
    expect(report.target.id).toBe('twins')
    expect(report.unmatched.flatMap((entry) => (entry.node === undefined ? [] : [entry.node]))).not.toContain(
      'twin-dropped',
    )
  })

  it('two identical text nodes at one box paired to one heading from a design source yield no content row', async () => {
    await goto('target')
    const captured = await call('design_capture', {height: 720})
    const heading = everyComponent(captured.components).find(
      (component) => component.tag === 'h2' && headingText(component) !== '',
    )
    if (heading === undefined) throw new Error('the target page has no heading with text')
    const words = headingText(heading)
    const {id, route} = await freshTarget('u1-1280')
    const png = await targetPng(id)
    await putDesign({
      id: 'doubled',
      png,
      route,
      children: [
        textNode({id: 'doubled-first', box: heading.box, words}),
        textNode({id: 'doubled-second', box: heading.box, words}),
      ],
    })
    const report = await call('design_diff', {full: true})
    expect(report.target.id).toBe('doubled')
    expect(
      report.components
        .filter((component) => component.path === heading.path)
        .flatMap((component) => component.deltas)
        .filter((delta) => delta.kind === 'text'),
    ).toEqual([])
    expect(
      report.unmatched.filter(
        (entry) => entry.kind === 'unbuilt' && (entry.node === 'doubled-first' || entry.node === 'doubled-second'),
      ),
    ).toHaveLength(1)
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
    expect(next).toBe(designWords.guide({blind: false}))
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

describe('type estimate', () => {
  it('on type against type-1280 every text node is estimated at its live font size with confidence 1', async () => {
    await goto('type')
    const registered = await call('design_target', {image: target('type-1280')})
    await call('design_diff', {})
    const live = await page.evaluate(() =>
      [...document.querySelectorAll('main.type p')].map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          box: {x: rect.x, y: rect.y, w: rect.width, h: rect.height},
          size: Number.parseFloat(getComputedStyle(element).fontSize),
        }
      }),
    )
    const texts = (await runNodes(registered.id)).filter((node) => node.kind === 'text')
    expect(texts.length).toBe(live.length)
    const misses = texts.flatMap((node) => {
      const centre = {x: node.box.x + node.box.w / 2, y: node.box.y + node.box.h / 2, w: 0, h: 0}
      const element = live.find((candidate) => inside({inner: centre, outer: candidate.box}))
      const typography = node.typography
      if (element !== undefined && typography !== undefined) {
        if (
          Math.abs(typography.size - element.size) <= 0.5 &&
          typography.confidence === 1 &&
          typography.weight === 400
        ) {
          return []
        }
      }
      return [{text: node.text, live: element?.size, typography}]
    })
    expect(misses).toEqual([])
  })

  it('typography stored with confidence 1 is kept, and the fontSize delta names its size', async () => {
    await goto('type')
    const {id} = await freshTarget('type-1280')
    const first = (await storedNodes(id)).find((node) => node.kind === 'text')
    if (first === undefined) throw new Error('type-1280 has no text node')
    const exact = {size: 20, lineHeight: 25, weight: 400, confidence: 1, font: 'Source Sans 3', family: null}
    await store.decide({id, kind: 'typography', anchor: first.id, value: exact})
    const report = await call('design_diff', {})
    const kept = (await runNodes(id)).find((node) => node.id === first.id)?.typography
    expect(
      kept === undefined ? undefined : {size: kept.size, weight: kept.weight, confidence: kept.confidence},
    ).toEqual({
      size: exact.size,
      weight: exact.weight,
      confidence: exact.confidence,
    })
    expect(report.components.flatMap((component) => component.deltas)).toContainEqual(
      expect.objectContaining({kind: 'fontSize', target: exact.size}),
    )
  })

  it('a design family the live page does not use is a font row naming both families, and the outline names it', async () => {
    await goto('type')
    const {id} = await freshTarget('type-1280')
    const first = (await storedNodes(id)).find((node) => node.kind === 'text')
    if (first === undefined) throw new Error('type-1280 has no text node')
    const live = await liveFamily()
    const typography = {size: 20, lineHeight: 25, weight: 400, confidence: 1, font: 'Poppins', family: 'Poppins'}
    await store.decide({id, kind: 'typography', anchor: first.id, value: typography})
    const report = await call('design_diff', {})
    expect(report.components.flatMap((component) => component.deltas)).toContainEqual(
      expect.objectContaining({kind: 'font', live, target: 'Poppins'}),
    )
    expect(report.design).toContain('fonts: Poppins')
    const status = await call('design_status', {})
    expect(status.next ?? '').toContain('Poppins')
  })

  it('a design family the live page already uses is no font row', async () => {
    await goto('type')
    const {id} = await freshTarget('type-1280')
    const first = (await storedNodes(id)).find((node) => node.kind === 'text')
    if (first === undefined) throw new Error('type-1280 has no text node')
    const live = await liveFamily()
    const typography = {size: 20, lineHeight: 25, weight: 400, confidence: 1, font: live, family: live.toUpperCase()}
    await store.decide({id, kind: 'typography', anchor: first.id, value: typography})
    const report = await call('design_diff', {})
    expect(report.components.flatMap((component) => component.deltas).filter((delta) => delta.kind === 'font')).toEqual(
      [],
    )
  })
})

async function liveFamily(): Promise<string> {
  const stack = await page.evaluate(() => {
    const element = document.querySelector('main.type p')
    return element === null ? '' : getComputedStyle(element).fontFamily
  })
  return (stack.split(',')[0] ?? '').replaceAll('"', '').replaceAll("'", '').trim()
}

const MOVED_WRAPPER = 20

describe('deltas', () => {
  it('a paired box is compared with its stored radius, width and padding, and a second diff names them again', async () => {
    await goto('target')
    const captured = await call('design_capture', {height: 720})
    const toolbar = captured.components.find((c) => c.source?.file === 'src/Toolbar.tsx')
    if (toolbar === undefined) throw new Error('the target page has no toolbar')
    const {id} = await freshTarget('u1-1280')
    const model = {nodes: await storedNodes(id)}
    const header = model.nodes.find((node) => node.kind === 'box' && near({a: node.box, b: toolbar.box}))
    const padding = header?.layout?.padding
    if (header === undefined || padding === undefined) throw new Error('u1-1280 has no laid out toolbar box')
    const stored = {radius: 3, width: toolbar.box.w - 40, right: 16}
    await editDesign({
      id,
      map: (node) =>
        node.id === header.id && node.kind === 'box'
          ? {
              ...node,
              radius: stored.radius,
              box: {...node.box, w: stored.width},
              layout: {...node.layout, padding: {...padding, right: stored.right}},
            }
          : node,
    })
    const named = (report: DiffReport) =>
      report.components
        .filter((component) => sameSource({a: component.source, b: toolbar.source}))
        .flatMap((component) => component.deltas)
        .filter((delta) => ['radius', 'width', 'inset-right'].includes(delta.kind))
        .map((delta) => ({kind: delta.kind, live: delta.live, target: delta.target}))
        .toSorted((a, b) => a.kind.localeCompare(b.kind))
    const expected = [
      {kind: 'inset-right', live: 0, target: stored.right},
      {kind: 'radius', live: 8, target: stored.radius},
      {kind: 'width', live: toolbar.box.w, target: stored.width},
    ]
    expect(named(await call('design_diff', {}))).toEqual(expected)
    expect(named(await call('design_diff', {}))).toEqual(expected)
  })

  it('a text pair from a design source is never sized, even when its node is narrower than the element', async () => {
    await goto('target')
    const {id} = await freshTarget('u1-1280')
    await call('design_diff', {})
    const model = {nodes: await storedNodes(id)}
    const texts = new Set(model.nodes.filter((node) => node.kind === 'text').map((node) => node.id))
    const paired = (await latestPairs(id)).find((pair) => texts.has(pair.node))
    if (paired === undefined) throw new Error('u1-1280 pairs no element with a text node alone')
    await editDesign({
      id,
      figma: true,
      map: (node) => (node.id === paired.node ? {...node, box: {...node.box, w: node.box.w - 40}} : node),
    })
    const report = await call('design_diff', {full: true})
    const kept = await latestPairs(id)
    expect(kept).toContainEqual(paired)
    expect(
      report.components
        .filter((component) => component.path === paired.path)
        .flatMap((component) => component.deltas)
        .filter((delta) => delta.kind === 'width' || delta.kind === 'height'),
    ).toEqual([])
  })

  it('a text pair from a design source that overflows its live parent and is 192 px wider than its node has one width row', async () => {
    await goto('target')
    const {id} = await freshTarget('u1-1280')
    await call('design_diff', {})
    const model = {nodes: await storedNodes(id)}
    const texts = new Set(model.nodes.filter((node) => node.kind === 'text').map((node) => node.id))
    const paired = (await latestPairs(id)).find((pair) => texts.has(pair.node))
    if (paired === undefined) throw new Error('u1-1280 pairs no element with a text node alone')
    const element = componentAt({
      components: (await call('design_capture', {height: 720})).components,
      path: paired.path,
    })
    const source = element?.source
    if (source === undefined || source === null) throw new Error('the text element has no source')
    const styles = await readFile(HOST_STYLES, 'utf8')
    const pushed = `${styles}\n[data-conciv-source="${source.file}:${source.line}:${source.column}"] { position: relative; left: ${OVERFLOW_PX}px; }\n`
    try {
      const runs = (await runIds(id)).length
      await writeFile(HOST_STYLES, pushed)
      await expect.poll(async () => (await runIds(id)).length, {timeout: 15_000}).toBeGreaterThan(runs)
      await editDesign({
        id,
        figma: true,
        map: (node) =>
          node.id === paired.node
            ? {...node, box: {...node.box, x: node.box.x + OVERFLOW_PX, w: node.box.w - OVERFLOW_PX}}
            : node,
      })
      const report = await call('design_diff', {full: true})
      expect(
        report.components
          .filter((component) => component.path === paired.path)
          .flatMap((component) => component.deltas)
          .filter((delta) => delta.kind === 'width' || delta.kind === 'height')
          .map((delta) => delta.kind),
      ).toEqual(['width'])
    } finally {
      await writeFile(HOST_STYLES, styles)
    }
  })

  it('a nowrap text narrower than its words keeps glyph boxes wider than its element, and against a design source node at its element box has one width row', async () => {
    await goto('target')
    const {id} = await freshTarget('u1-1280')
    await call('design_diff', {})
    const model = {nodes: await storedNodes(id)}
    const texts = new Set(model.nodes.filter((node) => node.kind === 'text').map((node) => node.id))
    const paired = (await latestPairs(id)).find((pair) => texts.has(pair.node))
    if (paired === undefined) throw new Error('u1-1280 pairs no element with a text node alone')
    const components = (await call('design_capture', {height: 720})).components
    const element = componentAt({components, path: paired.path})
    const holder = parentAt({components, path: paired.path, parent: undefined})
    const source = element?.source
    const holderSource = holder?.source
    if (source === undefined || source === null || holderSource === undefined || holderSource === null)
      throw new Error('the text element or its parent has no source')
    const selector = (at: {file: string; line: number; column: number}) =>
      `[data-conciv-source="${at.file}:${at.line}:${at.column}"]`
    const styles = await readFile(HOST_STYLES, 'utf8')
    const narrow = `${styles}\n${selector(holderSource)} { width: ${NOWRAP_PX}px; max-width: none; }\n${selector(source)} { width: ${NOWRAP_PX}px; max-width: none; white-space: nowrap; overflow: visible; }\n`
    try {
      const runs = (await runIds(id)).length
      await writeFile(HOST_STYLES, narrow)
      await expect.poll(async () => (await runIds(id)).length, {timeout: 15_000}).toBeGreaterThan(runs)
      const squeezed = componentAt({
        components: (await call('design_capture', {height: 720})).components,
        path: paired.path,
      })
      const glyphs = squeezed?.glyphs.flatMap((glyph) => glyph.boxes) ?? []
      if (squeezed === undefined || glyphs.length === 0) throw new Error(`no glyphs captured at ${paired.path}`)
      expect(boxUnion(glyphs).w).toBeGreaterThan(squeezed.box.w + GEOMETRY_PX)
      await editDesign({
        id,
        figma: true,
        map: (node) => (node.id === paired.node ? {...node, box: squeezed.box} : node),
      })
      const report = await call('design_diff', {full: true})
      expect(
        report.components
          .filter((component) => component.path === paired.path)
          .flatMap((component) => component.deltas)
          .filter((delta) => delta.kind === 'width' || delta.kind === 'height')
          .map((delta) => delta.kind),
      ).toEqual(['width'])
    } finally {
      await writeFile(HOST_STYLES, styles)
    }
  })

  it('a text pair from a design source that wraps to 2 lines where its node has 3 line boxes has one lines row, and none against 2', async () => {
    await goto('target')
    const {id} = await freshTarget('u1-1280')
    await call('design_diff', {})
    const model = {nodes: await storedNodes(id)}
    const texts = new Set(model.nodes.filter((node) => node.kind === 'text').map((node) => node.id))
    const paired = (await latestPairs(id)).find((pair) => texts.has(pair.node))
    if (paired === undefined) throw new Error('u1-1280 pairs no element with a text node alone')
    const element = componentAt({
      components: (await call('design_capture', {height: 720})).components,
      path: paired.path,
    })
    const source = element?.source
    if (element === undefined || source === undefined || source === null)
      throw new Error('the text element has no source')
    const ink = boxUnion(element.glyphs.flatMap((glyph) => glyph.boxes))
    const styles = await readFile(HOST_STYLES, 'utf8')
    const wrapped = `${styles}\n[data-conciv-source="${source.file}:${source.line}:${source.column}"] { width: ${Math.ceil(ink.w * TWO_LINE_SHARE)}px; word-break: break-all; }\n`
    const withLines = (count: number) =>
      editDesign({
        id,
        figma: true,
        map: (node) =>
          node.kind === 'text' && node.id === paired.node
            ? {
                ...node,
                lines: Array.from({length: count}, (_, index) => ({
                  box: {
                    x: node.box.x,
                    y: node.box.y + (node.box.h / count) * index,
                    w: node.box.w,
                    h: node.box.h / count,
                  },
                  text: node.text,
                  confidence: 1,
                })),
              }
            : node,
      })
    const linesRows = (report: DiffReport) =>
      report.components
        .filter((component) => component.path === paired.path)
        .flatMap((component) => component.deltas)
        .filter((delta) => delta.kind === 'lines')
        .map((delta) => ({kind: delta.kind, live: delta.live, target: delta.target}))
    try {
      const runs = (await runIds(id)).length
      await writeFile(HOST_STYLES, wrapped)
      await expect.poll(async () => (await runIds(id)).length, {timeout: 15_000}).toBeGreaterThan(runs)
      await withLines(3)
      expect(linesRows(await call('design_diff', {full: true}))).toEqual([{kind: 'lines', live: 2, target: 3}])
      await withLines(2)
      expect(linesRows(await call('design_diff', {full: true}))).toEqual([])
    } finally {
      await writeFile(HOST_STYLES, styles)
    }
  })

  it('a text pair from a design source whose node is 6 px shorter than its element but whose ink matches has no move row', async () => {
    await goto('target')
    const {id} = await freshTarget('u1-1280')
    await call('design_diff', {})
    const model = {nodes: await storedNodes(id)}
    const texts = new Set(model.nodes.filter((node) => node.kind === 'text').map((node) => node.id))
    const paired = (await latestPairs(id)).find((pair) => texts.has(pair.node))
    if (paired === undefined) throw new Error('u1-1280 pairs no element with a text node alone')
    const captured = await call('design_capture', {height: 720})
    const element = componentAt({components: captured.components, path: paired.path})
    const glyphs = element?.glyphs.flatMap((glyph) => glyph.boxes) ?? []
    if (element === undefined || glyphs.length === 0) throw new Error(`no glyphs captured at ${paired.path}`)
    const ink = boxUnion(glyphs)
    await editDesign({
      id,
      figma: true,
      map: (node) =>
        node.kind === 'text' && node.id === paired.node
          ? {
              ...node,
              box: {...element.box, y: element.box.y + TALLER_ELEMENT, h: element.box.h - TALLER_ELEMENT},
              lines: [{box: ink, text: node.text, confidence: 1}],
            }
          : node,
    })
    const report = await call('design_diff', {full: true})
    expect(report.unmatched.filter((entry) => entry.kind === 'offset' && entry.node === paired.node)).toEqual([])
  })

  it('a centred text from a design source whose node box is its element box but wider than its ink has no move row', async () => {
    const aligned = await alignedText({align: 'center', inset: 0})
    expect(aligned.slack).toBeGreaterThan(INSET_INK)
    expect(aligned.shifts).toEqual([])
  })

  it('a left-aligned text from a design source whose ink starts 7 px right of the node left edge has a move row of -7', async () => {
    const aligned = await alignedText({align: 'left', inset: INSET_INK})
    expect(aligned.shifts).toHaveLength(1)
    expect(aligned.shifts[0]?.dx).toBeCloseTo(-INSET_INK, 0)
    expect(aligned.shifts[0]?.dy).toBeCloseTo(0, 0)
  })

  it('a wrapper 20 px off around a child placed where the design puts it has a move row on the wrapper only, and none once it lands', async () => {
    await goto('target')
    const captured = await call('design_capture', {height: 720})
    const toolbar = captured.components.find((c) => c.source?.file === 'src/Toolbar.tsx')
    const [child] = toolbar?.children ?? []
    if (toolbar === undefined || child === undefined) throw new Error('the target page has no toolbar with a child')
    const {id, route} = await freshTarget('u1-1280')
    const png = await targetPng(id)
    const put = (input: {id: string; wrapper: Box}): Promise<void> =>
      putDesign({
        id: input.id,
        png,
        route,
        children: [boxNode({id: 'wrapper', box: input.wrapper, children: [boxNode({id: 'child', box: child.box})]})],
      })
    const offsets = (report: DiffReport): {node: string | undefined; shift: unknown}[] =>
      report.unmatched
        .filter((entry) => entry.kind === 'offset')
        .map((entry) => ({node: entry.node, shift: entry.shift}))
    await put({id: 'wrapper-off', wrapper: {...toolbar.box, x: toolbar.box.x + MOVED_WRAPPER}})
    const off = await call('design_diff', {full: true})
    expect(off.target.id).toBe('wrapper-off')
    expect(offsets(off)).toEqual([{node: 'wrapper', shift: {dx: MOVED_WRAPPER, dy: 0}}])
    const row = off.unmatched.find((entry) => entry.kind === 'offset' && entry.node === 'wrapper')
    const x = Math.round(toolbar.box.x)
    const y = Math.round(toolbar.box.y)
    const sentence = `move the element (${row?.source?.file}:${row?.source?.line}) to ${x + MOVED_WRAPPER},${y} (now at ${x},${y})`
    expect(off.brief.filter((line) => line.endsWith(sentence))).toHaveLength(1)
    await put({id: 'wrapper-landed', wrapper: toolbar.box})
    const landed = await call('design_diff', {full: true})
    expect(landed.target.id).toBe('wrapper-landed')
    expect(offsets(landed)).toEqual([])
  })

  it('a page whose boxes sit exactly on a design source but whose texts use another family has no offset on any box pair', async () => {
    await goto('target')
    const {id} = await freshTarget('u1-1280')
    await call('design_diff', {})
    const styles = await readFile(HOST_STYLES, 'utf8')
    const substituted = `${styles}\n* { font-family: 'Courier New', monospace !important; }\n`
    try {
      const runs = (await runIds(id)).length
      await writeFile(HOST_STYLES, substituted)
      await expect.poll(async () => (await runIds(id)).length, {timeout: 15_000}).toBeGreaterThan(runs)
      const model = {nodes: await storedNodes(id)}
      const pairs = await latestPairs(id)
      const captured = await call('design_capture', {height: 720})
      const placed = new Map(
        pairs.flatMap((pair): [string, Box][] => {
          const element = componentAt({components: captured.components, path: pair.path})
          return element === undefined ? [] : [[pair.node, element.box]]
        }),
      )
      const boxes = new Set(
        model.nodes.filter((node) => node.kind === 'box' && placed.has(node.id)).map((node) => node.id),
      )
      if (boxes.size < 3) throw new Error(`u1-1280 pairs ${boxes.size} box nodes, the page shift needs 3`)
      await editDesign({
        id,
        figma: true,
        map: (node) => (boxes.has(node.id) ? {...node, box: placed.get(node.id) ?? node.box} : node),
      })
      await repaint({id, styles: substituted, round: 1})
      const report = await call('design_diff', {full: true})
      expect(
        report.unmatched.filter(
          (entry) => entry.kind === 'offset' && (entry.node === undefined || boxes.has(entry.node)),
        ),
      ).toEqual([])
    } finally {
      await writeFile(HOST_STYLES, styles)
    }
  })

  it('a design box wider than the page on both sides paired to a full-width element is sized and inset as the page', async () => {
    await goto('target')
    const {id} = await freshTarget('u1-1280')
    await call('design_diff', {})
    const styles = await readFile(HOST_STYLES, 'utf8')
    const widened = `${styles}\n.toolbar { margin: 0 -24px; max-width: none; }\n`
    try {
      const runs = (await runIds(id)).length
      await writeFile(HOST_STYLES, widened)
      await expect.poll(async () => (await runIds(id)).length, {timeout: 15_000}).toBeGreaterThan(runs)
      const width = await page.evaluate(() => document.documentElement.clientWidth)
      const captured = await call('design_capture', {height: 720})
      const toolbar = captured.components.find((component) => component.source?.file === 'src/Toolbar.tsx')
      if (toolbar === undefined) throw new Error('the target page has no toolbar')
      expect(toolbar.box).toEqual(expect.objectContaining({x: 0, w: width}))
      const model = {nodes: await storedNodes(id)}
      const paired = (await latestPairs(id)).find((pair) => pair.path === toolbar.path)
      const node = model.nodes.find((entry) => entry.id === paired?.node && entry.kind === 'box')
      if (node === undefined) throw new Error('u1-1280 pairs no box node with the full-width toolbar')
      const padding = node.layout?.padding
      const placed = (input: {box: Box; beyond: number}) => {
        const {box, beyond} = input
        const layout =
          padding === undefined
            ? node.layout
            : {...node.layout, padding: {...padding, left: padding.left + beyond, right: padding.right + beyond}}
        return editDesign({
          id,
          figma: true,
          map: (entry) =>
            entry.id === node.id ? {...entry, box: {...box, x: box.x - beyond, w: box.w + beyond * 2}, layout} : entry,
        })
      }
      const sized = (report: DiffReport) =>
        report.components
          .filter((component) => component.path === toolbar.path)
          .flatMap((component) => component.deltas)
          .filter((delta) => delta.kind === 'width' || delta.kind.startsWith('inset-'))
          .map((delta) => ({kind: delta.kind, live: delta.live, target: delta.target}))
      await placed({box: toolbar.box, beyond: 0})
      await repaint({id, styles: widened, round: 1})
      const exact = sized(await call('design_diff', {full: true}))
      await placed({box: toolbar.box, beyond: PAST_PAGE})
      await repaint({id, styles: widened, round: 2})
      const wider = sized(await call('design_diff', {full: true}))
      expect(wider.filter((delta) => delta.kind === 'width')).toEqual([])
      expect(wider).toEqual(exact)
    } finally {
      await writeFile(HOST_STYLES, styles)
    }
  })
})

const PAST_PAGE = 6
const OVERFLOW_PX = 192
const TWO_LINE_SHARE = 0.6
const NOWRAP_PX = 40

const TALLER_ELEMENT = 6

type CapturedComponent = CaptureResult['components'][number]

function everyComponent(components: CapturedComponent[]): CapturedComponent[] {
  return components.flatMap((component) => [component, ...everyComponent(component.children)])
}

function headingText(component: CapturedComponent): string {
  return component.glyphs
    .map((glyph) => glyph.text.trim())
    .filter((text) => text !== '')
    .join(' ')
}

function componentAt(input: {components: CapturedComponent[]; path: string}): CapturedComponent | undefined {
  const {components, path} = input
  return components.reduce<CapturedComponent | undefined>(
    (found, component) =>
      found ?? (component.path === path ? component : componentAt({components: component.children, path})),
    undefined,
  )
}

function cardGap(captured: CaptureResult): number | null {
  const [left, right] = everyComponent(captured.components).filter(
    (component) => component.tag === 'article' && component.source?.file === 'src/Cards.tsx',
  )
  if (left === undefined || right === undefined) return null
  return Math.round(right.box.x - left.box.x - left.box.w)
}

function parentAt(input: {
  components: CapturedComponent[]
  path: string
  parent: CapturedComponent | undefined
}): CapturedComponent | undefined {
  const {components, path, parent} = input
  return components.reduce<CapturedComponent | undefined>(
    (found, component) =>
      found ?? (component.path === path ? parent : parentAt({components: component.children, path, parent: component})),
    undefined,
  )
}

function boxUnion(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  return {
    x,
    y,
    w: Math.max(...boxes.map((box) => box.x + box.w)) - x,
    h: Math.max(...boxes.map((box) => box.y + box.h)) - y,
  }
}

const INSET_INK = 7

async function alignedText(input: {
  align: 'center' | 'left'
  inset: number
}): Promise<{slack: number; shifts: {dx: number; dy: number}[]}> {
  const {align, inset} = input
  await goto('target')
  const {id} = await freshTarget('u1-1280')
  await call('design_diff', {})
  const styles = await readFile(HOST_STYLES, 'utf8')
  const aligned = `${styles}\n* { text-align: ${align} !important; }\n`
  try {
    const runs = (await runIds(id)).length
    await writeFile(HOST_STYLES, aligned)
    await expect.poll(async () => (await runIds(id)).length, {timeout: 15_000}).toBeGreaterThan(runs)
    const model = {nodes: await storedNodes(id)}
    const texts = new Set(model.nodes.filter((node) => node.kind === 'text').map((node) => node.id))
    const pairs = await latestPairs(id)
    const captured = await call('design_capture', {height: 720})
    const found = pairs
      .filter((pair) => texts.has(pair.node))
      .map((pair) => ({pair, element: componentAt({components: captured.components, path: pair.path})}))
      .find(({element}) => {
        const glyphs = element?.glyphs.flatMap((glyph) => glyph.boxes) ?? []
        return element !== undefined && glyphs.length > 0 && element.box.w - boxUnion(glyphs).w > INSET_INK * 2
      })
    const pair = found?.pair
    const element = found?.element
    if (pair === undefined || element === undefined) throw new Error('u1-1280 pairs no text element wider than its ink')
    const ink = boxUnion(element.glyphs.flatMap((glyph) => glyph.boxes))
    const box = {...element.box, x: align === 'left' ? ink.x - inset : element.box.x}
    await editDesign({
      id,
      figma: true,
      map: (node) =>
        node.id === pair.node && node.kind === 'text'
          ? {
              ...node,
              box,
              lines: [
                {
                  box: {x: box.x, y: ink.y, w: box.w, h: ink.h},
                  text: node.text,
                  confidence: 1,
                },
              ],
            }
          : node,
    })
    const report = await call('design_diff', {full: true})
    return {
      slack: element.box.w - ink.w,
      shifts: report.unmatched.flatMap((entry) =>
        entry.kind === 'offset' && entry.node === pair.node && entry.shift !== undefined ? [entry.shift] : [],
      ),
    }
  } finally {
    await writeFile(HOST_STYLES, styles)
  }
}

async function freshTarget(name: string): Promise<TargetResult> {
  await call('design_clear', {all: true})
  return call('design_target', {image: target(name)})
}

async function repaint(input: {id: string; styles: string; round: number}): Promise<void> {
  const {id, styles, round} = input
  const before = (await runIds(id)).at(-1)
  const dot = `body::after { content: ''; position: fixed; right: 0; bottom: 0; width: 1px; height: 1px; background: rgb(238 241 ${200 + round}); }`
  await writeFile(HOST_STYLES, `${styles}\n${dot}\n`)
  await expect.poll(async () => (await runIds(id)).at(-1), {timeout: 15_000}).not.toBe(before)
}

const STRIPE_REBUILT = ['bb458f09', 'da931653', '2332a289', 'ed1ee3d9']
const CONTACT_LABELS = ['Your Email', 'Message', 'Send']

const STACKED_PICTURE = 'stacked-picture'
const PICTURE_GAP = 24
const SECTION_FIT = 'section-fit'
const SAVED_TOOLBAR = '#fde68a'
const SAVED_TOOLBAR_RGB = 'rgb(253, 230, 138)'

describe('pixels', () => {
  it('a paired box whose captured pixels differ in 60% of its box while the measure reads its paint right has one pixels row and no residual-only stop', async () => {
    const {report} = await repaintedPanel(0.6)
    const rows = report.components.flatMap((component) => component.deltas).filter((delta) => delta.kind === 'pixels')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.live).toBeGreaterThanOrEqual(0.5)
    expect(report.stop).not.toBe('residual-only')
  })

  it('the same box differing in 30% of its box has no pixels row', async () => {
    const {report, path} = await repaintedPanel(0.3)
    const panel = report.components.find((component) => component.path === path)
    expect(panel?.mismatch).toBeGreaterThanOrEqual(0.25)
    expect(panel?.deltas).toEqual([])
    expect(
      report.components.flatMap((component) => component.deltas).filter((delta) => delta.kind === 'pixels'),
    ).toEqual([])
  })
})

const PANEL_BACKGROUND = '#426bf2'
const PANEL_REPAINT = [242, 161, 66, 255]

async function repaintedPanel(share: number): Promise<{report: DiffReport; path: string}> {
  await goto('pixels')
  const captured = await call('design_capture', {height: 720})
  const panel = everyComponent(captured.components).find(
    (component) => component.tag === 'div' && component.styles.background === PANEL_BACKGROUND,
  )
  if (panel === undefined) throw new Error('the pixels page has no panel')
  const png = decodePng(await readFile(captured.path))
  const left = Math.round(panel.box.x)
  const top = Math.round(panel.box.y)
  const width = Math.round(panel.box.w)
  const grown = (width + TILE_MARGIN * 2) * (Math.round(panel.box.h) + TILE_MARGIN * 2)
  const rows = Math.ceil((share * grown) / width)
  Array.from(
    {length: rows * width},
    (_, index) => ((top + Math.floor(index / width)) * png.width + left + (index % width)) * 4,
  ).forEach((offset) => png.data.set(PANEL_REPAINT, offset))
  await call('design_clear', {all: true})
  await putDesign({
    id: `pixels-${share}`,
    png,
    route: captured.route,
    children: [boxNode({id: 'panel', box: panel.box, paint: {background: PANEL_BACKGROUND}})],
  })
  return {report: await call('design_diff', {full: true}), path: panel.path}
}

describe('pairing', () => {
  it('stripe against stripe-1280 pairs the rebuilt headings and no single glyph', async ({annotate}) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const compact = compactReport(await rpc.registry.call({name: 'design_diff', input: {}}))
    await annotate(`counts ${JSON.stringify(compact.counts)}`)
    const pairs = await latestPairs(id)
    const paired = new Set(pairs.map((pair) => pair.node))
    const glyphs = (await storedNodes(id)).filter(
      (node) => paired.has(node.id) && node.kind === 'text' && (node.text ?? '').trim().length === 1,
    )
    expect(compact.counts.paired).toBeGreaterThanOrEqual(92)
    expect(STRIPE_REBUILT.filter((node) => !paired.has(node))).toEqual([])
    expect(glyphs).toEqual([])
  })

  it('the fields and the button of a contact form pair with the boxes drawn for them', async ({annotate}) => {
    await goto('contact')
    const {id} = await freshTarget('contact-1280')
    const report = await call('design_diff', {})
    const controls = await page.locator('.contact-form > *').evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect()
        return {tag: element.tagName.toLowerCase(), box: {x: rect.x, y: rect.y, w: rect.width, h: rect.height}}
      }),
    )
    const pairs = await latestPairs(id)
    const boxes = new Map(
      (await storedNodes(id)).filter((node) => node.kind === 'box').map((node) => [node.id, node.box]),
    )
    await annotate(`controls ${JSON.stringify(controls)} brief ${JSON.stringify(report.brief)}`)
    expect(controls.map((control) => control.tag)).toEqual(['input', 'textarea', 'button'])
    expect(
      controls.filter(
        (control) =>
          !pairs.some((pair) => {
            const box = boxes.get(pair.node)
            return pair.fingerprint?.tag === control.tag && box !== undefined && near({a: box, b: control.box})
          }),
      ),
    ).toEqual([])
    expect(
      report.unmatched.filter((entry) =>
        controls.some((control) => entry.target !== undefined && near({a: entry.target, b: control.box})),
      ),
    ).toEqual([])
    expect(
      report.brief.filter(
        (line) => line.includes('build') && CONTACT_LABELS.some((label) => line.includes(`"${label}"`)),
      ),
    ).toEqual([])
  })

  it('a contact form shifted right still pairs its controls with their boxes and is briefed to move', async ({
    annotate,
  }) => {
    await goto('contact')
    const {id} = await freshTarget('contact-1280')
    const controls = await page.locator('.contact-form > *').evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect()
        return {tag: element.tagName.toLowerCase(), box: {x: rect.x, y: rect.y, w: rect.width, h: rect.height}}
      }),
    )
    const styles = await readFile(HOST_STYLES, 'utf8')
    try {
      const runs = (await runIds(id)).length
      await writeFile(HOST_STYLES, `${styles}\n.contact-form { margin-left: 400px; }\n`)
      await expect.poll(async () => (await runIds(id)).length, {timeout: 15_000}).toBeGreaterThan(runs)
      const report = await call('design_diff', {})
      const pairs = await latestPairs(id)
      const boxes = new Map(
        (await storedNodes(id)).filter((node) => node.kind === 'box').map((node) => [node.id, node.box]),
      )
      await annotate(`controls ${JSON.stringify(controls)} brief ${JSON.stringify(report.brief)}`)
      expect(controls.map((control) => control.tag)).toEqual(['input', 'textarea', 'button'])
      expect(
        controls.filter(
          (control) =>
            !pairs.some((pair) => {
              const box = boxes.get(pair.node)
              return pair.fingerprint?.tag === control.tag && box !== undefined && near({a: box, b: control.box})
            }),
        ),
      ).toEqual([])
      const about = report.brief.filter(
        (line) =>
          controls.some((control) => line.includes(`${control.tag} (`)) ||
          CONTACT_LABELS.some((label) => line.includes(`"${label}"`)),
      )
      expect(about[0]?.startsWith('move ')).toBe(true)
      expect(about.filter((line) => line.startsWith('build'))).toEqual([])
    } finally {
      await writeFile(HOST_STYLES, styles)
    }
  })

  it('a live paragraph whose words match a design text node 175 px below an image node of its own size pairs to the text node, never the image', async ({
    annotate,
  }) => {
    await goto('target')
    const {id} = await freshTarget('u1-1280')
    const first = await call('design_diff', {})
    const nodes = await storedNodes(id)
    const texts = new Set(nodes.filter((node) => node.kind === 'text').map((node) => node.id))
    const paragraph = [...(await runPairs({id, run: reportRun(first)})).values()].find(
      (pair) => texts.has(pair.node) && pair.fingerprint.tag === 'p',
    )
    if (paragraph === undefined) throw new Error('u1-1280 pairs no paragraph with a text node')
    const text = nodes.find((node) => node.id === paragraph.node)
    const element = componentAt({
      components: (await call('design_capture', {height: 720})).components,
      path: paragraph.path,
    })
    if (text === undefined || element === undefined) throw new Error(`no paragraph captured at ${paragraph.path}`)
    const icon = (y: number) =>
      editDesign({
        id,
        map: (node) =>
          node.children.some((child) => child.id === paragraph.node)
            ? {
                ...node,
                children: [
                  ...node.children.filter((child) => child.id !== PARAGRAPH_ICON),
                  imageNode({id: PARAGRAPH_ICON, box: {...element.box, y}}),
                ],
              }
            : node,
      })
    await icon(element.box.y)
    const covered = [...(await runPairs({id, run: reportRun(await call('design_diff', {}))})).values()]
    await icon(text.box.y - ICON_ABOVE_TEXT)
    const moved = [...(await runPairs({id, run: reportRun(await call('design_diff', {}))})).values()]
    await annotate(`covered ${JSON.stringify(covered.filter((pair) => pair.path === paragraph.path))}`)
    await annotate(`moved ${JSON.stringify(moved.filter((pair) => pair.path === paragraph.path))}`)
    expect(covered.filter((pair) => pair.node === PARAGRAPH_ICON && pair.path === paragraph.path)).toEqual([])
    expect(moved.filter((pair) => pair.path === paragraph.path).map((pair) => pair.node)).toEqual([paragraph.node])
  })

  it('a top-level section whose live box equals its design box pairs with that element, not a wider wrapper around it', async () => {
    await goto('target')
    const captured = await call('design_capture', {height: 720})
    const toolbar = captured.components.find((c) => c.source?.file === 'src/Toolbar.tsx')
    const [child] = toolbar?.children ?? []
    if (toolbar === undefined || child === undefined) throw new Error('the target page has no toolbar with a child')
    const {id, route} = await freshTarget('u1-1280')
    const png = await targetPng(id)
    await putDesign({
      id: SECTION_FIT,
      png,
      route,
      children: [boxNode({id: 'section', box: toolbar.box, children: [boxNode({id: 'inner', box: child.box})]})],
    })
    const report = await call('design_diff', {full: true})
    const pairs = await latestPairs(SECTION_FIT)
    expect(report.target.id).toBe(SECTION_FIT)
    expect(pairs.filter((pair) => pair.node === 'section').map((pair) => pair.path)).toEqual([toolbar.path])
    expect(report.unmatched.filter((entry) => entry.kind === 'unbuilt' && entry.node === 'section')).toEqual([])
  })

  it('two paired cards 24 px apart where the design has 32 have one gap row, gap-before on the second card', async () => {
    await goto('target')
    const cards = (await call('design_capture', {height: 720})).components
    const first = everyComponent(cards).find(
      (component) => component.tag === 'article' && component.source?.file === 'src/Cards.tsx',
    )
    const holder = first === undefined ? undefined : parentAt({components: cards, path: first.path, parent: undefined})
    const source = holder?.source
    if (holder === undefined || source === undefined || source === null)
      throw new Error('the target page has no cards row')
    const styles = await readFile(HOST_STYLES, 'utf8')
    const spaced = `${styles}\nsection[data-conciv-source="${source.file}:${source.line}:${source.column}"] { gap: ${LIVE_CARD_GAP}px; }\n`
    try {
      await writeFile(HOST_STYLES, spaced)
      await expect
        .poll(async () => cardGap(await call('design_capture', {height: 720})), {timeout: 15_000})
        .toBe(LIVE_CARD_GAP)
      const captured = await call('design_capture', {height: 720})
      const row = everyComponent(captured.components).find((component) => component.path === holder.path)
      const [left, right] = row?.children.filter((child) => child.tag === 'article') ?? []
      if (row === undefined || left === undefined || right === undefined)
        throw new Error('the cards row has no two cards')
      const {id, route} = await freshTarget('u1-1280')
      const png = await targetPng(id)
      const shift = DESIGN_CARD_GAP - LIVE_CARD_GAP
      await putDesign({
        id: GAP_CARDS,
        png,
        route,
        children: [
          boxNode({
            id: 'row',
            box: {...row.box, w: row.box.w + shift},
            children: [
              boxNode({id: 'left', box: left.box}),
              boxNode({id: 'right', box: {...right.box, x: right.box.x + shift}}),
            ],
          }),
        ],
      })
      const report = await call('design_diff', {full: true})
      expect(report.target.id).toBe(GAP_CARDS)
      expect(
        report.components.flatMap((component) =>
          component.deltas
            .filter((delta) => delta.kind === 'gap-before' || delta.kind === 'gap-after')
            .map((delta) => ({path: component.path, kind: delta.kind, live: delta.live, target: delta.target})),
        ),
      ).toEqual([{path: right.path, kind: 'gap-before', live: LIVE_CARD_GAP, target: DESIGN_CARD_GAP}])
    } finally {
      await writeFile(HOST_STYLES, styles)
    }
  })

  it('a card heading pairs with the design text that carries its words, though the design draws it where the number sits, and keeps it after the two swap places', async ({
    annotate,
  }) => {
    await goto('target')
    const captured = await call('design_capture', {height: 720})
    const card = everyComponent(captured.components).find(
      (component) => component.tag === 'article' && component.source?.file === 'src/Cards.tsx',
    )
    const heading = card?.children.find((child) => child.tag === 'h2')
    const number = card?.children.find((child) => child.tag === 'p')
    if (card === undefined || heading === undefined || number === undefined) {
      throw new Error('the target page has no card with a heading and a number')
    }
    const {id, route} = await freshTarget('u1-1280')
    const png = await targetPng(id)
    await putDesign({
      id: WORDS_FIRST,
      png,
      route,
      children: [
        boxNode({
          id: WORDS_CARD,
          box: card.box,
          children: [
            textNode({id: WORDS_HEADING, words: headingText(heading), box: number.box}),
            textNode({id: WORDS_NUMBER, words: headingText(number), box: heading.box}),
          ],
        }),
      ],
    })
    const keys = (pairs: Map<string, Pair>): (string | null | undefined)[] => [
      pairs.get(WORDS_HEADING)?.fingerprint.key,
      pairs.get(WORDS_NUMBER)?.fingerprint.key,
    ]
    const first = await runPairs({id: WORDS_FIRST, run: reportRun(await call('design_diff', {}))})
    const source = await readFile(CARDS_SOURCE, 'utf8')
    try {
      await rewrite({
        id: WORDS_FIRST,
        file: CARDS_SOURCE,
        text: source.replace(`${CARD_HEADING_LINE}\n${CARD_NUMBER_LINE}`, `${CARD_NUMBER_LINE}\n${CARD_HEADING_LINE}`),
      })
      const swapped = await runPairs({id: WORDS_FIRST, run: reportRun(await call('design_diff', {}))})
      await annotate(`first ${JSON.stringify(keys(first))} swapped ${JSON.stringify(keys(swapped))}`)
      expect(keys(first)).toEqual([heading.key, number.key])
      expect(keys(swapped)).toEqual([heading.key, number.key])
    } finally {
      await writeFile(CARDS_SOURCE, source)
    }
  }, 300_000)
})

const GAP_CARDS = 'gap-cards'
const LIVE_CARD_GAP = 24
const DESIGN_CARD_GAP = 32
const WORDS_FIRST = 'words-first'
const WORDS_CARD = 'words-card'
const WORDS_HEADING = 'words-heading'
const WORDS_NUMBER = 'words-number'
const CARD_HEADING_LINE = '        <h2 data-conciv-key="_DB2qQ">{title}</h2>'
const CARD_NUMBER_LINE = '        <p data-conciv-key="hJdrHg">{title.length * 1000}</p>'

const PARAGRAPH_ICON = 'paragraph-icon'
const ICON_ABOVE_TEXT = 175

describe('loop', () => {
  it('stripe is briefed against named anchors, never the box, a high ordinal or a hard-coded sample', async ({
    annotate,
  }) => {
    await goto('stripe')
    await freshTarget('stripe-1280')
    const report = await call('design_diff', {})
    await annotate(`brief ${JSON.stringify(report.brief.slice(0, 5))}`)
    expect(
      report.brief.filter(
        (line) => line.includes('the box:') || line.includes('the box (') || highOrdinals(line).length > 0,
      ),
    ).toEqual([])
    expect(
      report.warnings.filter((warning) => warning.warning === 'sample-data').map((warning) => warning.live),
      'only the counter beside the chips the page maps from an array',
    ).toEqual(['0/500'])
  })

  it('stripe against stripe-1280 reports a similarity between 0 and 1, on the page and on each section', async () => {
    await goto('stripe')
    await freshTarget('stripe-1280')
    const report = await call('design_diff', {})
    expect(report.similarity).toBeGreaterThan(0)
    expect(report.similarity).toBeLessThan(1)
    const status = await call('design_status', {})
    expect(status.similarity).toBe(report.similarity)
    expect(status.sections?.length).toBeGreaterThan(0)
    expect(status.sections?.map((section) => typeof section.similarity)).toEqual(status.sections?.map(() => 'number'))
  })

  it('stripe shifted down by 1 px keeps its similarity within 0.05', async () => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const styles = await readFile(STRIPE_STYLES, 'utf8')
    const before = await call('design_diff', {})
    try {
      await rewrite({id, file: STRIPE_STYLES, text: `${styles}\n#root { margin-top: 1px; }\n`})
      const shifted = await call('design_diff', {})
      expect(Math.abs((shifted.similarity ?? 0) - (before.similarity ?? 1))).toBeLessThan(0.05)
    } finally {
      await writeFile(STRIPE_STYLES, styles)
    }
  }, 120_000)

  it('bordered reports a border delta in the paint stage with a short brief at round 1', async () => {
    await goto('bordered')
    await freshTarget('u1-1280')
    const report = await call('design_diff', {})
    expect(report.components.flatMap((c) => c.deltas.map((d) => d.kind))).toContain('border')
    expect(report).toMatchObject({stage: 'paint', round: 1})
    expect(report.brief.length).toBeGreaterThan(0)
    expect(report.brief.length).toBeLessThanOrEqual(5)
  })

  it('column reports an axis delta in the structure stage', async () => {
    await goto('column')
    await freshTarget('u1-1280')
    const report = await call('design_diff', {})
    expect(report.components.flatMap((c) => c.deltas.map((d) => d.kind))).toContain('axis')
    expect(report.stage).toBe('structure')
  })

  it('a column container against a design row carries the one axis delta at its line, and a row container none', async () => {
    await goto('column')
    await freshTarget('u1-1280')
    const column = await call('design_diff', {limit: 50, depth: 6})
    const turned = column.components.filter((component) => component.deltas.some((delta) => delta.kind === 'axis'))
    expect(turned.map((component) => component.source)).toEqual([
      expect.objectContaining({file: 'src/Cards.tsx', line: 17}),
    ])
    expect(column.rows.filter((row) => row.sentence.includes('axis is'))).toEqual([
      expect.objectContaining({
        sentence: expect.stringContaining('axis is column where the design has row'),
        source: expect.objectContaining({file: 'src/Cards.tsx', line: 17}),
      }),
    ])
    await goto('target')
    const row = await call('design_diff', {limit: 50, depth: 6})
    expect(row.components.flatMap((component) => component.deltas.filter((delta) => delta.kind === 'axis'))).toEqual([])
  })

  it('a container whose design node keeps one child has no axis row', async () => {
    await goto('column')
    const {id} = await freshTarget('u1-1280')
    const column = await call('design_diff', {limit: 50, depth: 6})
    const turned = column.components.find((component) => component.deltas.some((delta) => delta.kind === 'axis'))
    const [holder] = turned?.nodes ?? []
    if (turned === undefined || holder === undefined) throw new Error('the column page has no axis row to remove')
    const [, ...dropped] = (await storedNodes(id)).filter((node) => node.within === holder)
    expect(dropped.length).toBeGreaterThan(0)
    await editDesign({id, map: (node) => (node.id === holder ? {...node, children: node.children.slice(0, 1)} : node)})
    const single = await call('design_diff', {limit: 50, depth: 6})
    const pairs = await latestPairs(id)
    expect(pairs.map((pair) => pair.node)).toContain(holder)
    expect(
      single.components
        .filter((component) => sameSource({a: component.source, b: turned.source}))
        .flatMap((component) => component.deltas.filter((delta) => delta.kind === 'axis')),
    ).toEqual([])
  })

  it('a design row whose picture overlaps a child has no axis row, and the same picture beside the children keeps it', async () => {
    await goto('column')
    const {id} = await freshTarget('u1-1280')
    const column = await call('design_diff', {limit: 50, depth: 6})
    const turned = column.components.find((component) => component.deltas.some((delta) => delta.kind === 'axis'))
    const [holder] = turned?.nodes ?? []
    if (turned === undefined || holder === undefined) throw new Error('the column page has no axis row')
    const boxes = (await storedNodes(id))
      .filter((node) => node.within === holder)
      .map((node) => node.box)
      .toSorted((a, b) => a.x - b.x)
    const first = boxes.at(0)
    const last = boxes.at(-1)
    if (first === undefined || last === undefined) throw new Error('the design row holds no children')
    const axisWith = async (box: Box): Promise<DiffReport['components'][number]['deltas']> => {
      await editDesign({
        id,
        map: (node) =>
          node.id === holder
            ? {
                ...node,
                children: [
                  ...node.children.filter((child) => child.id !== STACKED_PICTURE),
                  imageNode({id: STACKED_PICTURE, box}),
                ],
              }
            : node,
      })
      const report = await call('design_diff', {limit: 50, depth: 6})
      return report.components
        .filter((component) => sameSource({a: component.source, b: turned.source}))
        .flatMap((component) => component.deltas.filter((delta) => delta.kind === 'axis'))
    }
    const stacked = await axisWith({x: first.x + first.w / 4, y: first.y + first.h / 4, w: first.w / 2, h: first.h / 2})
    const beside = await axisWith({x: last.x + last.w + PICTURE_GAP, y: last.y, w: PICTURE_GAP, h: last.h})
    expect(stacked).toEqual([])
    expect(beside).toEqual([expect.objectContaining({kind: 'axis', live: 'column', target: 'row'})])
  })

  it('grid reports a columns delta', async () => {
    await goto('grid')
    await freshTarget('u1-1280')
    const report = await call('design_diff', {})
    expect(report.components.flatMap((c) => c.deltas)).toContainEqual(
      expect.objectContaining({kind: 'columns', live: 4, target: 3}),
    )
  })

  it('nine diffs of a bordered page with a non-improving edit before each stop stalled before the budget', async () => {
    await goto('bordered')
    const {id} = await freshTarget('u1-1280')
    const styles = await readFile(HOST_STYLES, 'utf8')
    const stops: (string | null)[] = []
    try {
      for (const round of Array.from({length: 9}, (_, index) => index)) {
        if (round > 0) await repaint({id, styles, round})
        stops.push((await call('design_diff', {})).stop)
      }
    } finally {
      await writeFile(HOST_STYLES, styles)
    }
    expect(stops.at(-1)).toBe('stalled')
    expect(stops.indexOf('stalled')).toBeLessThan(7)
    expect(stops).not.toContain('budget')
  }, 300_000)

  it('saves between two diffs leave the round where design_diff left it', async () => {
    await goto('bordered')
    const {id} = await freshTarget('u1-1280')
    await call('design_diff', {})
    const styles = await readFile(HOST_STYLES)
    const runs = (await runIds(id)).length
    for (const _ of Array.from({length: 5})) await writeFile(HOST_STYLES, styles)
    await expect.poll(async () => (await runIds(id)).length, {timeout: 15_000}).toBeGreaterThan(runs)
    expect(await call('design_status', {})).toMatchObject({round: 1})
  })

  it('an empty page leaves every non-image node unbuilt in the structure stage', async () => {
    await goto('empty')
    const {id} = await freshTarget('u1-1280')
    const report = await call('design_diff', {})
    const nodes = (await storedNodes(id)).filter((node) => node.kind !== 'image')
    const unbuilt = report.unmatched.filter((entry) => entry.kind === 'unbuilt')
    expect(
      nodes.filter(
        (node) => !unbuilt.some((entry) => entry.target !== undefined && near({a: entry.target, b: node.box})),
      ),
    ).toEqual([])
    expect(report.stage).toBe('structure')
  })

  it('shifted pairs the first button and reports a text delta and nothing unbuilt', async () => {
    await goto('shifted')
    await freshTarget('u1-1280')
    const report = await call('design_diff', {})
    expect(report.components.flatMap((c) => c.deltas)).toContainEqual(
      expect.objectContaining({kind: 'text', live: 'Make', target: 'Export', file: 'src/Toolbar.tsx'}),
    )
    expect(report.unmatched.filter((entry) => entry.kind === 'unbuilt')).toEqual([])
  })

  it('registering u1-390 then u1-1280 links twins on both and reports a responsive section', async () => {
    await goto('target')
    await call('design_clear', {all: true})
    const narrow = await call('design_target', {image: target('u1-390')})
    const wide = await call('design_target', {image: target('u1-1280')})
    const twins = async (input: {id: string; other: string}) =>
      (await store.decisions(input.id)).filter(
        (decision) =>
          decision.kind === 'twin' &&
          typeof decision.value === 'object' &&
          decision.value !== null &&
          'target' in decision.value &&
          decision.value.target === input.other,
      )
    expect((await twins({id: wide.id, other: narrow.id})).length).toBeGreaterThan(0)
    expect((await twins({id: narrow.id, other: wide.id})).length).toBeGreaterThan(0)
    const report = await call('design_diff', {})
    expect(report.responsive).toContainEqual(expect.objectContaining({target: narrow.id, width: 390}))
  })

  it('a run after a source edit carries a diff image that differs from the run before', async () => {
    await goto('target')
    const {id} = await freshTarget('u1-1280')
    const first = await call('design_diff', {})
    const styles = await readFile(HOST_STYLES, 'utf8')
    const before = (await runIds(id)).length
    try {
      await writeFile(HOST_STYLES, `${styles}\n.toolbar { background-color: #fde68a !important; }\n`)
      await expect.poll(async () => (await runIds(id)).length, {timeout: 15_000}).toBeGreaterThan(before)
      const latest = (await runIds(id)).at(-1) ?? ''
      const after = Buffer.from((await store.image({id, run: latest, kind: 'diff'})) ?? [])
      expect(after.equals(await readFile(fileUnder(stateRoot, first.diffImage)))).toBe(false)
    } finally {
      await writeFile(HOST_STYLES, styles)
    }
  })

  it('two diffs of an unchanged page report the same round and say the page has not changed', async () => {
    await goto('bordered')
    await freshTarget('u1-1280')
    const first = await call('design_diff', {})
    const second = await call('design_diff', {})
    expect([second.round, second.hint]).toEqual([first.round, 'the page has not changed since the last diff'])
  })

  it('a diff called once the page shows a save returns a new round that reflects it, even when the save paints nothing', async () => {
    await goto('target')
    await freshTarget('u1-1280')
    const first = await call('design_diff', {})
    const styles = await readFile(HOST_STYLES, 'utf8')
    const shown = (input: {property: string; value: string}): Promise<unknown> =>
      page.waitForFunction(
        ({property, value}) => {
          const toolbar = document.querySelector('.toolbar')
          return toolbar !== null && getComputedStyle(toolbar).getPropertyValue(property) === value
        },
        input,
        {timeout: 10_000},
      )
    try {
      await writeFile(HOST_STYLES, `${styles}\n.toolbar { background-color: ${SAVED_TOOLBAR} !important; }\n`)
      await shown({property: 'background-color', value: SAVED_TOOLBAR_RGB})
      const recolored = await call('design_diff', {})
      await writeFile(
        HOST_STYLES,
        `${styles}\n.toolbar { background-color: ${SAVED_TOOLBAR} !important; cursor: pointer; }\n`,
      )
      await shown({property: 'cursor', value: 'pointer'})
      const unpainted = await call('design_diff', {})
      const again = await call('design_diff', {})
      expect(recolored.round).toBe(first.round + 1)
      expect(recolored.components.flatMap((component) => component.deltas)).toContainEqual(
        expect.objectContaining({kind: 'background', live: SAVED_TOOLBAR}),
      )
      expect([unpainted.round, unpainted.hint]).toEqual([recolored.round + 1, undefined])
      expect([again.round, again.hint]).toEqual([unpainted.round, 'the page has not changed since the last diff'])
    } finally {
      await writeFile(HOST_STYLES, styles)
    }
  })

  it('pairs the finished fixture within the run budget and reports no partial run', async () => {
    await goto('target')
    await freshTarget('u1-1280')
    const report = await call('design_diff', {})
    expect(report.partial).toBe(false)
    expect([report.components, report.unmatched]).toEqual([[], []])
  })
  it('two diffs after registration with a non-improving edit between have no stop and the third is stalled', async () => {
    await goto('bordered')
    const {id} = await freshTarget('u1-1280')
    const styles = await readFile(HOST_STYLES, 'utf8')
    const reports: DiffReport[] = []
    try {
      for (const round of Array.from({length: 3}, (_, index) => index)) {
        if (round > 0) await repaint({id, styles, round})
        reports.push(await call('design_diff', {}))
      }
    } finally {
      await writeFile(HOST_STYLES, styles)
    }
    expect(reports.map((report) => report.stop)).toEqual([null, null, 'stalled'])
    const first = reports.at(-1)?.brief[0] ?? ''
    expect([first.startsWith('stalled: the paint total held at '), first.includes(' for 2 rounds')]).toEqual([
      true,
      true,
    ])
  })

  it('three css edits that each move the structure total of stripe are never stalled', async ({annotate}) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const styles = await readFile(STRIPE_STYLES, 'utf8')
    const reports: DiffReport[] = []
    try {
      for (const move of STRUCTURE_MOVES) {
        const css = move === null ? styles : `${styles}\n.grid { margin-top: ${move}px; }\n`
        if (reports.length > 0) await rewrite({id, file: STRIPE_STYLES, text: css})
        reports.push(await call('design_diff', {}))
      }
    } finally {
      await writeFile(STRIPE_STYLES, styles)
    }
    await annotate(
      `rounds ${JSON.stringify(reports.map((report) => [report.stop, report.stage, report.score[1], report.brief[0]]))}`,
    )
    const totals = reports.map((report) => report.score[1] ?? 0)
    expect(reports.map((report) => report.stage)).toEqual(STRUCTURE_MOVES.map(() => 'structure'))
    expect(totals.slice(1).map((total, index) => Math.abs(total - (totals[index] ?? total)) >= 1)).toEqual([
      true,
      true,
      true,
    ])
    expect(reports.map((report) => report.stop)).toEqual([null, null, null, null])
  }, 300_000)

  it('a diff on bordered times each phase within its own clock and is not partial', async ({annotate}) => {
    await goto('bordered')
    await freshTarget('u1-1280')
    const report = await call('design_diff', {})
    await annotate(`timings ${JSON.stringify(report.timings)}`)
    expect(report.partial).toBe(false)
    expect(report.timings.pair).toBeLessThan(PAIR_BUDGET_MS)
    expect(report.timings.measure).toBeLessThan(MEASURE_TIMEOUT_MS)
    expect(report.timings.total).toBeGreaterThanOrEqual(
      report.timings.measure + report.timings.mask + report.timings.regions + report.timings.pair,
    )
  })

  it('a diff on roles, the fixture with the most text runs, renders its type samples without a skip', async ({
    annotate,
  }) => {
    await goto('roles')
    const registered = await freshTarget('roles-1280')
    const report = await call('design_diff', {})
    await annotate(`text runs ${registered.text?.runs ?? 0}, timings ${JSON.stringify(report.timings)}`)
    expect(report.partial).toBe(false)
    expect(report.warnings.filter((warning) => warning.warning === 'typography-skipped')).toEqual([])
    expect(report.timings.measure).toBeLessThan(MEASURE_TIMEOUT_MS)
  })

  it('the default diff output is compact with rows and counts, and full: true holds every component', async ({
    annotate,
  }) => {
    await goto('bordered')
    await freshTarget('u1-1280')
    const compact = await rpc.registry.call({name: 'design_diff', input: {}})
    expect(compact).toHaveProperty('counts.components')
    expect(compact).not.toHaveProperty('segmentation')
    expect(compact).not.toHaveProperty('pinsLost')
    await annotate(`compact output ${JSON.stringify(compact).length} characters`)
    expect(
      ['components', 'unmatched', 'warnings', 'responsive', 'route'].filter((field) =>
        Object.hasOwn(Object(compact), field),
      ),
    ).toEqual([])
    const {rows, brief} = z
      .object({rows: z.array(z.object({sentence: z.string(), stage: z.string()})), brief: z.array(z.string())})
      .parse(compact)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(10)
    expect(rows[0]?.sentence).toBe(brief[0])
    const full = await call('design_diff', {full: true, limit: 60})
    expect(full.components.flatMap((c) => c.deltas.map((d) => d.kind))).toContain('border')
  })

  it('a full stripe report with limit 60 is cut to 60 entries a list and answers under 256 KiB', async ({annotate}) => {
    await goto('stripe')
    await freshTarget('stripe-1280')
    const report = await call('design_diff', {full: true, limit: 60})
    const size = JSON.stringify(report).length
    await annotate(`full stripe report ${size} characters, truncated ${JSON.stringify(report.truncated)}`)
    expect(report.components.length).toBeLessThanOrEqual(60)
    expect(report.unmatched.length).toBeLessThanOrEqual(60)
    expect(size).toBeLessThan(262144)
  })

  it('an empty page against u1-1280 is briefed as a row of cards, never as boxes at coordinates', async () => {
    await goto('empty')
    await freshTarget('u1-1280')
    const report = await call('design_diff', {})
    expect(report.brief[0]).toContain('a row of 2 cards')
    expect(report.brief.filter((line) => line.includes('×') || line.includes('at 0,'))).toEqual([])
  })

  it('painted cards report the painted warning first and a sizing delta on each paired card', async () => {
    await goto('painted')
    await freshTarget('u1-1280')
    const report = await call('design_diff', {limit: 50, depth: 6})
    expect(report.painted).toMatchObject({count: 3})
    expect(report.painted?.sources.map((source) => source.file)).toEqual(['src/App.tsx', 'src/App.tsx', 'src/App.tsx'])
    expect(report.brief[0]?.startsWith('painted: 3 elements are absolutely positioned')).toBe(true)
    const cards = report.components.filter((c) => c.tag === 'article' && (c.nodes?.length ?? 0) > 0)
    expect(cards.length).toBeGreaterThanOrEqual(2)
    expect(
      cards.filter((c) => !c.deltas.some((d) => d.kind === 'sizing' && d.live === 'fixed' && d.target === 'fill')),
    ).toEqual([])
  })

  it('the default fixture against u1-1280 reports no painted warning and no sizing delta', async () => {
    await goto('/')
    await freshTarget('u1-1280')
    const report = await call('design_diff', {limit: 50, depth: 6})
    expect(report.painted).toBeNull()
    expect(report.components.flatMap((c) => c.deltas.filter((d) => d.kind === 'sizing'))).toEqual([])
  })

  it('hiding a button after two diffs on missing ranks the new unbuilt items before the demoted ones', async () => {
    await goto('missing')
    const {id} = await freshTarget('u1-1280')
    await call('design_diff', {})
    const styles = await readFile(HOST_STYLES, 'utf8')
    try {
      await repaint({id, styles, round: 1})
      const second = await call('design_diff', {full: true})
      const unchanged = new Set(second.rows.flatMap((row) => (row.node === undefined ? [] : [row.node])))
      const runs = (await runIds(id)).length
      await writeFile(HOST_STYLES, `${styles}\n.toolbar button:first-child { display: none !important; }\n`)
      await expect.poll(async () => (await runIds(id)).length, {timeout: 15_000}).toBeGreaterThan(runs)
      const third = await call('design_diff', {full: true})
      const demoted = third.rows
        .filter((row) => row.stage === third.stage)
        .map((row) => row.node !== undefined && unchanged.has(row.node))
      expect(third.stage).toBe('structure')
      expect(demoted[0]).toBe(false)
      expect(demoted).toContain(true)
      expect(demoted).toEqual(demoted.toSorted((a, b) => Number(a) - Number(b)))
    } finally {
      await writeFile(HOST_STYLES, styles)
    }
  })

  it('a page with structure and geometry rows briefs the top two geometry rows after the structure rows', async ({
    annotate,
  }) => {
    const styles = await readFile(HOST_STYLES, 'utf8')
    try {
      await writeFile(
        HOST_STYLES,
        `${styles}\n.toolbar button:first-child { display: none !important; }\n.field { width: 200px !important; }\n.table { width: 90% !important; }\n`,
      )
      await goto('target')
      await freshTarget('u1-1280')
      const report = await call('design_diff', {})
      await annotate(
        `brief ${JSON.stringify(report.brief)} rows ${JSON.stringify(report.rows.map((row) => row.stage))}`,
      )
      expect(report.stage).toBe('structure')
      expect(report.brief.slice(-2).map((line) => line.startsWith('geometry next: '))).toEqual([true, true])
      expect(report.rows.slice(-2).map((row) => row.stage)).toEqual(['geometry', 'geometry'])
      expect(report.rows.filter((row) => row.stage === 'geometry')).toHaveLength(2)
    } finally {
      await writeFile(HOST_STYLES, styles)
    }
  })

  it('an unbuilt box with no children is briefed by its size and background', async ({annotate}) => {
    await goto('empty')
    const {id} = await freshTarget('stripe-1280')
    const box = (await storedNodes(id)).find((node) => node.id === STRIPE_BANK_BOX)
    const report = await call('design_diff', {section: STRIPE_BANK_BOX})
    await annotate(`box ${JSON.stringify(box)} brief ${JSON.stringify(report.brief)}`)
    const sentence = `build a box ${Math.round(box?.box.w ?? 0)}x${Math.round(box?.box.h ?? 0)} ${box?.paint?.background ?? ''} `
    expect(report.brief.filter((line) => line.startsWith(sentence))).toHaveLength(1)
    expect(report.brief.filter((line) => line.includes('(fixed)'))).toEqual([])
  })
})

const STRIPE_BANK_BOX = 'd9b175e8'

const STRIPE_STYLES = join(HOST_ROOT, 'src', 'stripe.css')
const EDITED_INK = '#c2410c'
const LIVE_LOOP_MS = 8000
const STRIPE_RUN_MS = 10_000
const STRIPE_SOURCE = join(HOST_ROOT, 'src', 'Stripe.tsx')
const EDITED_HEADING = 'Get Stripe product recommendations'
const ORDINAL_SUFFIXES = ['st', 'nd', 'rd', 'th']
const ORDINAL_LIMIT = 9
const CARD_ROW_MOVES = [null, 40, null, 40, 20]
const STRUCTURE_MOVES = [null, 40, 80, 120]
const TIMED_PHASES = [
  'capture',
  'decode',
  'measure',
  'mask',
  'regions',
  'pair',
  'typography',
  'deltas',
  'judge',
  'encode',
  'write',
  'total',
]

async function editStripe(input: {id: string; styles: string}): Promise<void> {
  const {id, styles} = input
  await rewrite({id, file: STRIPE_STYLES, text: `${styles}\n.g-lilac .card-head h3 { color: ${EDITED_INK}; }\n`})
}

async function rewrite(input: {id: string; file: string; text: string}): Promise<void> {
  const {id, file, text} = input
  const before = (await runIds(id)).at(-1)
  await writeFile(file, text)
  await expect.poll(async () => (await runIds(id)).at(-1), {timeout: 60_000}).not.toBe(before)
}

function highOrdinals(line: string): string[] {
  return line.split(' ').filter((word) => {
    const bare = word.split(':')[0] ?? ''
    const suffixed = ORDINAL_SUFFIXES.some((suffix) => bare.endsWith(suffix))
    return suffixed && Number(bare.slice(0, -2)) > ORDINAL_LIMIT
  })
}

async function tileCount(id: string): Promise<number> {
  const live = await store.image({id, run: (await runIds(id)).at(-1) ?? '', kind: 'live'})
  if (live === null) throw new Error(`target ${id} has no live image`)
  const {width, height} = decodePng(Buffer.from(live))
  const side = designConfig.tolerances.tileSide
  return Math.ceil(width / side) * Math.ceil(height / side)
}

function componentMismatch(report: DiffReport): Record<string, number> {
  return Object.fromEntries(report.components.map((component) => [component.path ?? '', component.mismatch]))
}

describe('live loop', () => {
  it('one stripe.css edit re-pairs and recompares only what it touched and reports the edited colour', async ({
    annotate,
  }) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const full = await call('design_diff', {})
    const styles = await readFile(STRIPE_STYLES, 'utf8')
    try {
      await editStripe({id, styles})
      const carried = await call('design_diff', {})
      const tiles = await tileCount(id)
      await annotate(
        `full ${JSON.stringify(full.timings)} paired ${full.paired}; carried ${JSON.stringify(carried.timings)} paired ${carried.paired}; tiles ${tiles}`,
      )
      expect(carried.timings.total).toBeLessThan(LIVE_LOOP_MS)
      expect(carried.timings.carried.pairs).toBeGreaterThanOrEqual(80)
      expect(carried.timings.carried.tiles).toBeGreaterThanOrEqual(0.9 * tiles)
      expect(carried.paired).toBe(full.paired)
      const edited = carried.components.flatMap((component) =>
        component.deltas.filter(
          (delta) =>
            delta.kind === 'foreground' && typeof delta.live === 'string' && colorDistance(delta.live, EDITED_INK) < 10,
        ),
      )
      expect(edited.length).toBeGreaterThan(0)
    } finally {
      await writeFile(STRIPE_STYLES, styles)
    }
  }, 240_000)

  it('a one-line text edit in Stripe.tsx carries the pairs it did not touch', async ({annotate}) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    await call('design_diff', {})
    const source = await readFile(STRIPE_SOURCE, 'utf8')
    try {
      await rewrite({id, file: STRIPE_SOURCE, text: source.replace(EDITED_HEADING, 'Get Stripe product picks')})
      const report = await call('design_diff', {})
      await annotate(`carried ${JSON.stringify(report.timings.carried)} paired ${report.paired}`)
      expect(report.timings.carried.pairs).toBeGreaterThanOrEqual(80)
    } finally {
      await writeFile(STRIPE_SOURCE, source)
    }
  }, 240_000)

  it('moving the card row down and back is two reversals and stops oscillating at the second; a return to the best total is not a new best', async ({
    annotate,
  }) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const styles = await readFile(STRIPE_STYLES, 'utf8')
    const reports: DiffReport[] = []
    try {
      for (const move of CARD_ROW_MOVES) {
        const css = move === null ? styles : `${styles}\n.grid { margin-top: ${move}px; }\n`
        if (reports.length > 0) await rewrite({id, file: STRIPE_STYLES, text: css})
        reports.push(await call('design_diff', {}))
      }
    } finally {
      await writeFile(STRIPE_STYLES, styles)
    }
    await annotate(
      `stops ${JSON.stringify(reports.map((report) => report.stop))} scores ${JSON.stringify(reports.map((report) => [report.stage, report.score]))}`,
    )
    expect(reports.map((report) => report.stop)).toEqual([null, null, null, 'oscillating', 'oscillating'])
  }, 300_000)

  it('a stripe run after a css edit times every phase and finishes under 10 s', async ({annotate}) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    await call('design_diff', {})
    const styles = await readFile(STRIPE_STYLES, 'utf8')
    try {
      await editStripe({id, styles})
      const report = await call('design_diff', {})
      const timings: Record<string, unknown> = report.timings
      await annotate(`timings ${JSON.stringify(timings)}`)
      expect(TIMED_PHASES.filter((phase) => typeof timings[phase] !== 'number')).toEqual([])
      expect(report.timings.total).toBeLessThan(STRIPE_RUN_MS)
    } finally {
      await writeFile(STRIPE_STYLES, styles)
    }
  }, 240_000)

  it('a diff with no edit since the carried run carries its pairs and tiles and gives the same answer', async () => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const styles = await readFile(STRIPE_STYLES, 'utf8')
    try {
      await editStripe({id, styles})
      const carried = await call('design_diff', {})
      const [node] = await storedNodes(id)
      if (node === undefined) throw new Error('the stripe target has no nodes')
      await xrayRpc.xray.mark({id, kind: 'tolerance', node: node.id, value: 1, session: kit.session})
      const full = await call('design_diff', {})
      expect(carried.timings.carried.pairs).toBeGreaterThan(0)
      expect(full.timings.carried.pairs).toBeGreaterThan(0)
      expect(full.timings.carried.tiles).toBeGreaterThan(0)
      expect([full.score, full.mismatch, full.paired]).toEqual([carried.score, carried.mismatch, carried.paired])
      expect(componentMismatch(full)).toEqual(componentMismatch(carried))
    } finally {
      await writeFile(STRIPE_STYLES, styles)
    }
  }, 240_000)

  it('an edit that imports a missing file is a page error: no round, no result file, the brief says the page did not render', async () => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const first = await call('design_diff', {})
    const source = await readFile(STRIPE_SOURCE, 'utf8')
    try {
      await writeFile(STRIPE_SOURCE, `import './missing-design-fixture'\n${source}`)
      await expect
        .poll(() => page.evaluate(() => document.querySelector('vite-error-overlay') !== null), {timeout: 30_000})
        .toBe(true)
      const results = await runIds(id)
      const report = await call('design_diff', {})
      expect(report.warnings.map((warning) => warning.warning)).toEqual(['page-error'])
      expect(report.brief[0]?.startsWith('the page did not render: ')).toBe(true)
      expect([report.round]).toEqual([first.round])
      expect(await runIds(id)).toEqual(results)
    } finally {
      await writeFile(STRIPE_SOURCE, source)
    }
  }, 240_000)

  it('a run started right after a full reload waits for the widget to register and measures', async () => {
    await goto('stripe')
    await freshTarget('stripe-1280')
    await page.reload({waitUntil: 'domcontentloaded'})
    const pending = call('design_diff', {})
    await injectWidget(page, kit.apiBase)
    const report = await pending
    expect(report.partial).toBe(false)
    expect(report.paired).toBeGreaterThan(0)
  }, 240_000)
})

const LILAC_CLASS = 'g-lilac'
const CARD_END = '</Card>'
const CROP_GAP = 4
const PNG_WIDTH_AT = 16
const CSS_INKS = ['#c2410c', '#15803d', '#1d4ed8']

const SHIFTED_KEY = 'xw-hJQ'
const SHIFTED_OPENING = `<p className="hero-gdp" data-conciv-key="${SHIFTED_KEY}">`
const SHIFTED_EDIT = `<p className="hero-gdp-before" /><p className="hero-gdp hero-gdp-moved" style={{position: 'relative', top: 40}} data-conciv-key="${SHIFTED_KEY}">`
const CARD_SECTION = 'className={`card '
const INSERTED_LINES = 'const insertedFirst = 1\nconst insertedSecond = 2\nconst insertedThird = 3\n'
function lilacCardPairs(input: {pairs: Map<string, Pair>; source: string}): Pair[] {
  const sectionAt = input.source.split('\n').findIndex((line) => line.includes(CARD_SECTION)) + 1
  const {first, last} = lilacLines(input.source)
  const pairs = [...input.pairs.values()]
  const child = pairs.find((pair) => {
    const line = pair.fingerprint.source?.line ?? 0
    return pair.fingerprint.source?.file.endsWith('Stripe.tsx') === true && line >= first && line <= last
  })
  const section = pairs.find(
    (pair) =>
      pair.fingerprint.source?.file.endsWith('Stripe.tsx') === true &&
      pair.fingerprint.source.line === sectionAt &&
      child?.path.startsWith(`${pair.path}/`) === true,
  )
  if (section === undefined) throw new Error('the lilac card section has no pair')
  return pairs.filter((pair) => pair.path === section.path || pair.path.startsWith(`${section.path}/`))
}

function lilacLines(source: string): {first: number; last: number} {
  const lines = source.split('\n')
  const start = lines.findIndex((line) => line.includes(LILAC_CLASS))
  const end = lines.findIndex((line, index) => index > start && line.includes(CARD_END))
  return {first: start + 1, last: end + 1}
}

function lilacNodes(input: {ledger: StoredLedger; source: string; status: string}): string[] {
  const {first, last} = lilacLines(input.source)
  return Object.entries(input.ledger.nodes).flatMap(([node, entry]) => {
    const at = entry.pair?.fingerprint.source
    if (entry.status !== input.status || at === null || at === undefined) return []
    return at.file.endsWith('Stripe.tsx') && at.line >= first && at.line <= last ? [node] : []
  })
}

function withoutLilac(source: string): string {
  const {first, last} = lilacLines(source)
  return source
    .split('\n')
    .filter((_, index) => index + 1 < first || index + 1 > last)
    .join('\n')
}

function pngWidth(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(PNG_WIDTH_AT)
}

describe('ledger', () => {
  it('a full run fills the ledger, hiding the lilac card regresses its nodes and restoring it makes them done', async ({
    annotate,
  }) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const compact = compactReport(await rpc.registry.call({name: 'design_diff', input: {}}))
    const status = await call('design_status', {})
    const ledger = status.ledger ?? {unbuilt: -1, paired: -1, done: -1, regressed: -1, accepted: -1}
    await annotate(`ledger ${JSON.stringify(status.ledger)} counts ${JSON.stringify(compact.counts)}`)
    expect(ledger.done + ledger.paired).toBe(compact.counts.paired)
    expect(ledger.unbuilt).toBe(compact.counts.unbuilt)
    const first = await storedLedger(id)
    const source = await readFile(STRIPE_SOURCE, 'utf8')
    const card = lilacNodes({ledger: first, source, status: 'done'})
    expect(card.length).toBeGreaterThan(0)
    const [cropped] = card
    const box = (await storedNodes(id)).find((node) => node.id === cropped)?.box
    if (cropped === undefined || box === undefined) throw new Error('the lilac card has no done node')
    const response = await fetch(`${compact.xray.replace('/xray/list?', '/xray/node?')}&node=${cropped}`)
    expect(response.headers.get('content-type')).toBe('image/png')
    const width = pngWidth(new Uint8Array(await response.arrayBuffer()))
    expect(width).toBe(2 * (Math.round(box.w) + 2 * TILE_MARGIN) + CROP_GAP)
    const styles = await readFile(STRIPE_STYLES, 'utf8')
    try {
      await rewrite({id, file: STRIPE_STYLES, text: `${styles}\n.${LILAC_CLASS} { display: none; }\n`})
      const hidden = await call('design_diff', {})
      const regressed = hidden.changes.regressed.map((change) => change.node)
      await annotate(
        `hidden changes ${JSON.stringify(hidden.changes).slice(0, 3000)} brief ${JSON.stringify(hidden.brief.slice(0, 3))}`,
      )
      expect(card.filter((node) => !regressed.includes(node))).toEqual([])
      expect(
        hidden.changes.regressed.filter((change) => change.sentence === '' || !change.crop.includes('/xray/node?')),
      ).toEqual([])
      expect(hidden.brief[0]?.startsWith('since round')).toBe(true)
      await rewrite({id, file: STRIPE_STYLES, text: styles})
      const restored = await call('design_diff', {})
      const done = restored.changes.done.map((change) => change.node)
      const after = await storedLedger(id)
      await annotate(
        `restored changes ${JSON.stringify(restored.changes).slice(0, 3000)} carried ${JSON.stringify(restored.timings.carried)} ledger ${JSON.stringify((await call('design_status', {})).ledger)}`,
      )
      expect(card.filter((node) => !done.includes(node))).toEqual([])
      expect(
        card.filter((node) => after.nodes[node]?.status !== 'done' || after.nodes[node]?.since !== reportRun(restored)),
      ).toEqual([])
    } finally {
      await writeFile(STRIPE_STYLES, styles)
    }
  }, 300_000)

  it('two saves between rounds write no ledger; the next round reports changes since the last round', async ({
    annotate,
  }) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    await call('design_diff', {})
    const source = await readFile(STRIPE_SOURCE, 'utf8')
    const card = lilacNodes({ledger: await storedLedger(id), source, status: 'done'})
    expect(card.length).toBeGreaterThan(0)
    const styles = await readFile(STRIPE_STYLES, 'utf8')
    try {
      await rewrite({id, file: STRIPE_STYLES, text: `${styles}\n.${LILAC_CLASS} { display: none; }\n`})
      await rewrite({id, file: STRIPE_STYLES, text: styles})
      const round = await call('design_diff', {})
      const ledger = await storedLedger(id)
      const listed = (changes: {node: string}[]): string[] =>
        changes.flatMap((change) => (card.includes(change.node) ? [change.node] : []))
      await annotate(
        `ledger run ${ledger.run} report ${reportRun(round)} changes ${JSON.stringify(round.changes).slice(0, 3000)} brief ${JSON.stringify(round.brief.slice(0, 2))}`,
      )
      expect(ledger.run).toBe(reportRun(round))
      expect(listed(round.changes.regressed)).toEqual([])
      expect(listed(round.changes.lost)).toEqual([])
      expect(listed(round.changes.done)).toEqual([])
      expect(round.brief[0]?.startsWith('since round 1')).toBe(true)
    } finally {
      await writeFile(STRIPE_STYLES, styles)
    }
  }, 300_000)

  it('registration writes the design outline, one line per node plus the root, and the full report carries it', async () => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const status = await call('design_status', {})
    const designPath = status.designPath ?? ''
    expect(designPath.endsWith(`${id}/design.txt`)).toBe(true)
    expect(status.next).toBe(
      `read ${designPath} for the whole design before building; the brief lists what to fix first; copy ${status.placeholderPath} into the page's source and use <Placeholder kind=…> for every image and icon line`,
    )
    const lines = (await readFile(fileUnder(stateRoot, designPath), 'utf8')).split('\n')
    expect(lines.length).toBe((await storedNodes(id)).length + 1)
    const access = lines.find((line) => line.includes('"Access borderless'))
    expect(
      access
        ?.trim()
        .split(' ')
        .some(
          (word) => word.includes('/') && word.split('/').every((part) => part !== '' && Number.isFinite(Number(part))),
        ),
    ).toBe(true)
    const report = await call('design_diff', {})
    expect(report.design).toEqual(lines)
    expect(report.designPath).toBe(designPath)
  }, 240_000)

  it('the outline sizes every text by its ink from registration and the first diff replaces the estimate', async ({
    annotate,
  }) => {
    await goto('empty')
    const {id, scale} = await freshTarget('stripe-1280')
    const status = await call('design_status', {})
    const designPath = fileUnder(stateRoot, status.designPath ?? '')
    const registered = (await readFile(designPath, 'utf8')).split('\n')
    const texts = (await storedNodes(id)).filter((node) => node.kind === 'text')
    await goto('stripe')
    const declared = await declaredSizes()
    const table = texts.flatMap((node) => {
      const size = declaredSize({box: node.box, scale, declared})
      const line = outlineLine({lines: registered, text: node.text ?? ''})
      const estimate = line === undefined ? null : outlineSize(line)
      if (size === undefined) return []
      return [{text: node.text ?? '', ink: node.box.h / scale, size, ratio: node.box.h / scale / size, estimate}]
    })
    const ratios = table.map((row) => row.ratio).toSorted((a, b) => a - b)
    await annotate(
      `median ink/declared ${ratios[Math.floor(ratios.length / 2)]} table ${JSON.stringify(table.map((row) => [row.text.slice(0, 32), row.ink, row.size, Number(row.ratio.toFixed(3)), row.estimate?.size]))}`,
    )
    const textLines = registered.filter((line) => line.trim().startsWith('text "'))
    expect(textLines.length).toBe(texts.length)
    expect(textLines.filter((line) => outlineSize(line)?.estimate !== true)).toEqual([])
    const sampled = [HERO_TITLE, BODY_LINE].map((start) => table.find((row) => row.text.startsWith(start)))
    expect(
      sampled.map(
        (row) =>
          row?.estimate !== null &&
          row?.estimate !== undefined &&
          Math.abs(row.estimate.size - row.size) <= row.size * ESTIMATE_SHARE,
      ),
    ).toEqual([true, true])
    await call('design_diff', {})
    const measured = (await readFile(designPath, 'utf8')).split('\n')
    const typed = (await storedNodes(id)).filter((node) => node.kind === 'text' && node.typography !== undefined)
    const sizes = measured.flatMap((line) => {
      const size = line.trim().startsWith('text "') ? outlineSize(line) : null
      return size === null ? [] : [size]
    })
    const samples = [HERO_TITLE, BODY_LINE].map((start) =>
      outlineSize(measured.find((line) => line.trim().startsWith(`text "${start}`)) ?? ''),
    )
    await annotate(`typed ${typed.length} of ${texts.length} samples ${JSON.stringify(samples)}`)
    expect(sizes).toHaveLength(texts.length)
    expect(sizes.filter((size) => !size.estimate)).toHaveLength(typed.length)
    expect(samples.map((size) => size?.estimate)).toEqual([false, false])
  }, 240_000)

  it('three css edits keep the element of every done node and lose nothing; removing the card loses its elements', async ({
    annotate,
  }) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const full = await call('design_diff', {})
    const greedy = await storedPairs({id, run: reportRun(full)})
    const styles = await readFile(STRIPE_STYLES, 'utf8')
    const source = await readFile(STRIPE_SOURCE, 'utf8')
    try {
      const edits: {report: DiffReport; pairs: Map<string, string>}[] = []
      for (const ink of CSS_INKS) {
        await rewrite({id, file: STRIPE_STYLES, text: `${styles}\n.${LILAC_CLASS} .card-head h3 { color: ${ink}; }\n`})
        const report = await call('design_diff', {})
        edits.push({report, pairs: await storedPairs({id, run: reportRun(report)})})
      }
      const [firstEdit] = edits
      if (firstEdit === undefined) throw new Error('no css edit ran')
      const ledger = await storedLedger(id)
      const done = Object.entries(ledger.nodes).flatMap(([node, entry]) => (entry.status === 'done' ? [node] : []))
      const moved = done.filter((node) => edits.some((edit) => edit.pairs.get(node) !== firstEdit.pairs.get(node)))
      const differed = done.filter((node) => greedy.has(node) && greedy.get(node) !== firstEdit.pairs.get(node))
      await annotate(
        `done ${done.length} moved ${JSON.stringify(moved)} ledger against greedy ${JSON.stringify(differed)}`,
      )
      expect(done.length).toBeGreaterThan(0)
      expect(moved).toEqual([])
      expect(edits.flatMap((edit) => edit.report.changes.lost)).toEqual([])
      await rewrite({id, file: STRIPE_SOURCE, text: withoutLilac(source)})
      const removed = await call('design_diff', {})
      await annotate(`removed lost ${removed.changes.lost.length}`)
      expect(removed.changes.lost.length).toBeGreaterThan(0)
    } finally {
      await writeFile(STRIPE_STYLES, styles)
      await writeFile(STRIPE_SOURCE, source)
    }
  }, 300_000)

  it('three lines inserted at the top of Stripe.tsx keep every key, lose nothing and keep the element of every done node', async ({
    annotate,
  }) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const full = await call('design_diff', {})
    const before = await runPairs({id, run: reportRun(full)})
    const source = await readFile(STRIPE_SOURCE, 'utf8')
    try {
      await rewrite({id, file: STRIPE_SOURCE, text: `${INSERTED_LINES}${source}`})
      const shifted = await call('design_diff', {})
      const after = await runPairs({id, run: reportRun(shifted)})
      const ledger = await storedLedger(id)
      const done = Object.entries(ledger.nodes).flatMap(([node, entry]) => (entry.status === 'done' ? [node] : []))
      const sample = [...before.values()].find(
        (pair) =>
          pair.fingerprint.key !== null && pair.fingerprint.source?.file.endsWith('Stripe.tsx') && after.has(pair.node),
      )
      const shiftedPair = sample === undefined ? undefined : after.get(sample.node)
      const changedPath = done.filter((node) => before.has(node) && before.get(node)?.path !== after.get(node)?.path)
      await annotate(
        `sample ${JSON.stringify(sample)} after ${JSON.stringify(shiftedPair)} changes ${JSON.stringify(shifted.changes).slice(0, 3000)} carried ${JSON.stringify(shifted.timings.carried)} done ${done.length}`,
      )
      if (sample === undefined) throw new Error('no keyed pair in Stripe.tsx')
      expect(shiftedPair?.fingerprint.key).toBe(sample.fingerprint.key)
      expect(shiftedPair?.fingerprint.source?.line).toBe((sample.fingerprint.source?.line ?? 0) + 3)
      expect(shifted.changes.lost).toEqual([])
      expect(shifted.changes.regressed).toEqual([])
      expect(done.length).toBeGreaterThan(0)
      expect(shifted.timings.carried.pairs).toBeGreaterThanOrEqual(done.length)
      expect(changedPath).toEqual([])
    } finally {
      await writeFile(STRIPE_SOURCE, source)
    }
  }, 300_000)

  it('a class added to a paired element, a new sibling of its tag before it and a 40 px move carry every pair and lose nothing', async ({
    annotate,
  }) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const full = await call('design_diff', {})
    const earlier = await runPairs({id, run: reportRun(full)})
    const sample = [...earlier.values()].find((pair) => pair.fingerprint.key === SHIFTED_KEY)
    if (sample === undefined) throw new Error('the hero gdp paragraph has no pair')
    const source = await readFile(STRIPE_SOURCE, 'utf8')
    try {
      await rewrite({id, file: STRIPE_SOURCE, text: source.replace(SHIFTED_OPENING, SHIFTED_EDIT)})
      const carried = await call('design_diff', {})
      const after = await runPairs({id, run: reportRun(carried)})
      await annotate(
        `paired ${full.paired} carried ${JSON.stringify(carried.timings.carried)} lost ${JSON.stringify(carried.changes.lost)} sample ${JSON.stringify(sample)} after ${JSON.stringify(after.get(sample.node))}`,
      )
      expect(after.get(sample.node)?.fingerprint.key).toBe(SHIFTED_KEY)
      expect(carried.timings.carried.pairs).toBe(full.paired)
      expect(carried.changes.lost).toEqual([])
    } finally {
      await writeFile(STRIPE_SOURCE, source)
    }
  }, 300_000)

  it('deleting the lilac card loses its elements and leaves every other pair on its element', async ({annotate}) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const full = await call('design_diff', {})
    const earlier = await runPairs({id, run: reportRun(full)})
    const source = await readFile(STRIPE_SOURCE, 'utf8')
    const deleted = lilacCardPairs({pairs: earlier, source}).map((pair) => pair.node)
    expect(deleted.length).toBeGreaterThan(0)
    try {
      await rewrite({id, file: STRIPE_SOURCE, text: withoutLilac(source)})
      const removed = await call('design_diff', {})
      const after = await runPairs({id, run: reportRun(removed)})
      const lost = removed.changes.lost.map((change) => change.node)
      const surviving = [...earlier.values()].filter((pair) => !deleted.includes(pair.node) && after.has(pair.node))
      const element = (pair: Pair | undefined): [string | null | undefined, string | undefined] => [
        pair?.fingerprint.key,
        pair?.path,
      ]
      await annotate(
        `deleted ${JSON.stringify(deleted)} lost ${JSON.stringify(lost)} surviving ${surviving.length} carried ${JSON.stringify(removed.timings.carried)}`,
      )
      expect(deleted.filter((node) => !lost.includes(node))).toEqual([])
      expect(surviving.map((pair) => element(after.get(pair.node)))).toEqual(surviving.map(element))
    } finally {
      await writeFile(STRIPE_SOURCE, source)
    }
  }, 300_000)

  it('a wholesale rewrite of Cards.tsx with a decision after it keeps every pair whose element is still there and loses nothing', async ({
    annotate,
  }) => {
    await goto('/')
    const {id} = await freshTarget('u1-1280')
    const first = await call('design_diff', {})
    const before = await runPairs({id, run: reportRun(first)})
    const kept = [...before.values()]
      .filter((pair) => pair.fingerprint.source?.file.endsWith('Cards.tsx') === true)
      .slice(0, KEPT_PAIRS)
    expect(kept).toHaveLength(KEPT_PAIRS)
    const source = await readFile(CARDS_SOURCE, 'utf8')
    try {
      await rewrite({id, file: CARDS_SOURCE, text: CARDS_REWRITTEN})
      const marked = (await storedNodes(id)).find((node) => !kept.some((pair) => pair.node === node.id))
      if (marked === undefined) throw new Error('the u1-1280 target has no node outside the kept pairs')
      await xrayRpc.xray.mark({id, kind: 'tolerance', node: marked.id, value: 1, session: kit.session})
      const second = await call('design_diff', {})
      const after = await runPairs({id, run: reportRun(second)})
      const site = (pair: Pair | undefined): [string | undefined, string | undefined] => [
        pair?.fingerprint.source?.file,
        pair?.fingerprint.tag,
      ]
      await annotate(
        `paired ${first.paired} then ${second.paired} carried ${JSON.stringify(second.timings.carried)} lost ${JSON.stringify(second.changes.lost)}`,
      )
      expect(second.paired).toBeGreaterThanOrEqual(first.paired)
      expect(second.timings.carried.pairs).toBeGreaterThanOrEqual(KEPT_PAIRS)
      expect(kept.map((pair) => site(after.get(pair.node)))).toEqual(kept.map(site))
      expect(second.changes.lost).toEqual([])
    } finally {
      await writeFile(CARDS_SOURCE, source)
    }
  }, 300_000)

  it('a box node whose element moves off it pairs the element that now matches it, and the moved one is not lost', async ({
    annotate,
  }) => {
    await goto('target')
    const {id} = await freshTarget('u1-1280')
    const first = await call('design_diff', {})
    const wrapper = [...(await runPairs({id, run: reportRun(first)})).values()].find(
      (pair) => pair.fingerprint.key === TOOLBAR_KEY,
    )
    const node = (await storedNodes(id)).find((entry) => entry.id === wrapper?.node && entry.kind === 'box')
    if (node === undefined) throw new Error('u1-1280 pairs no box node with the toolbar header')
    const source = await readFile(APP_SOURCE, 'utf8')
    try {
      await rewrite({id, file: APP_SOURCE, text: source.replace(TOOLBAR_OPENING, `${TOOLBAR_COPY}${TOOLBAR_OPENING}`)})
      const second = await call('design_diff', {})
      const after = await runPairs({id, run: reportRun(second)})
      const headers = (await call('design_capture', {height: 720})).components.filter(
        (component) => component.key === TOOLBAR_KEY,
      )
      const copy = headers.find((header) => near({a: header.box, b: node.box}))
      const moved = headers.find((header) => header !== copy)
      await annotate(
        `node ${JSON.stringify(node.box)} headers ${JSON.stringify(headers.map((header) => [header.path, header.box]))} after ${JSON.stringify(after.get(node.id))} lost ${JSON.stringify(second.changes.lost)}`,
      )
      if (copy === undefined || moved === undefined) throw new Error('the page does not render both toolbars')
      expect(intersects({a: moved.box, b: node.box})).toBe(false)
      expect(after.get(node.id)?.path).toBe(copy.path)
      expect(second.changes.lost.map((change) => change.node)).not.toContain(node.id)
    } finally {
      await writeFile(APP_SOURCE, source)
    }
  }, 300_000)
})

const KEPT_PAIRS = 3
const APP_SOURCE = join(HOST_ROOT, 'src', 'App.tsx')
const TOOLBAR_KEY = 'ngTm1A'
const TOOLBAR_OPENING = '<Toolbar\n'
const TOOLBAR_COPY = '<Toolbar variant={variant} label={label} data-conciv-key="Cp7ToA" />\n      '
const CARDS_SOURCE = join(HOST_ROOT, 'src', 'Cards.tsx')
const CARDS_REWRITTEN = `import styles from './card.module.css'

const TITLES = [
  'Revenue',
  'Invoices',
  'Customers',
]
const TARGET_TITLES = TITLES.filter(
  (title) => title !== 'Invoices',
)

export function Cards(props: {variant: string | null; column?: boolean}) {
  const titles =
    props.variant === 'target' || props.variant === 'mobile-gap'
      ? TARGET_TITLES
      : TITLES

  function card(title: string) {
    return (
      <article
        key={title}
        className={styles.card}
        data-conciv-key="54EGTw"
      >
        <div style={{display: 'contents'}}>
          <h2 data-conciv-key="_DB2qQ">
            {title}
          </h2>
          <p data-conciv-key="hJdrHg">
            {title.length * 1000}
          </p>
        </div>
      </article>
    )
  }

  const gap = props.variant === 'mobile-gap' ? styles.mobileGap : ''
  const column = props.column ? styles.column : ''

  return (
    <section className={\`\${styles.cards} \${gap} \${column}\`} data-conciv-key="ytrNww">
      {titles.map(card)}
    </section>
  )
}
`
const ICON_SIDE = 24
const ICON_SLOT_SIDE = 48
const GLYPH_NOISE = 12
const PAINTED_OVER = ['Guide me']
const GEOMETRY_PX = 2
const LATIN_END = 0x24f
const DAYBREAK = 'Daybreak Yoga'
const DAYBREAK_TAG = `<b data-conciv-key="xwJwFg">${DAYBREAK}</b>`
const AGENT_ICON_SIDE = 20
const PUNCTUATION_START = 0x2000
const PUNCTUATION_END = 0x206f

function foreign(character: string): boolean {
  const point = character.codePointAt(0) ?? 0
  return point > LATIN_END && (point < PUNCTUATION_START || point > PUNCTUATION_END)
}

function daybreakSlot(nodes: StoredNode[]): Box {
  const texts = nodes.filter((node) => node.kind === 'text' && node.text === DAYBREAK)
  const slot = nodes.find(
    (node) =>
      node.kind === 'image' &&
      under({box: node.box, side: ICON_SLOT_SIDE}) &&
      texts.some(
        (text) =>
          node.box.x + node.box.w <= text.box.x + 2 &&
          text.box.x - node.box.x - node.box.w <= ICON_SIDE &&
          Math.abs(node.box.y + node.box.h / 2 - text.box.y - text.box.h / 2) <= text.box.h,
      ),
  )
  if (slot === undefined) throw new Error('the design has no icon slot beside Daybreak Yoga')
  return slot.box
}

function agentIcon(slot: Box): string {
  const left = Math.round(slot.x + slot.w / 2 - AGENT_ICON_SIDE / 2)
  const top = Math.round(slot.y + slot.h / 2 - AGENT_ICON_SIDE / 2)
  return `<span className="icon" aria-hidden="true" style={{position: 'absolute', left: ${left}, top: ${top}, width: ${AGENT_ICON_SIDE}, height: ${AGENT_ICON_SIDE}, borderRadius: '50%', background: '#7a73ff'}} />${DAYBREAK_TAG}`
}

function enclosedIn(input: {inner: Box; outer: Box}): boolean {
  const {inner, outer} = input
  return (
    inner.x >= outer.x - GEOMETRY_PX &&
    inner.y >= outer.y - GEOMETRY_PX &&
    inner.x + inner.w <= outer.x + outer.w + GEOMETRY_PX &&
    inner.y + inner.h <= outer.y + outer.h + GEOMETRY_PX
  )
}

function under(input: {box: Box; side: number}): boolean {
  return input.box.w < input.side && input.box.h < input.side
}

function quotesOneCharacter(line: string): boolean {
  return line.split('"').some((part, index) => index % 2 === 1 && Array.from(part).length === 1)
}

const PLACEHOLDER_SOURCE = join(HOST_ROOT, 'src', 'Placeholder.tsx')
const PLACEHOLDER_IMPORT = "import {Placeholder} from './Placeholder'"
const PLACEHOLDER_TAG = '<Placeholder kind="icon" />'
const DRAWN_SVG =
  '<svg width="20" height="20" viewBox="0 0 20 20"><path d="M2 10 L10 2 L18 10 L10 18 Z" fill="#7a73ff" /></svg>'
const HERO_TITLE = 'Financial infrastructure'
const BODY_LINE = 'By messaging, you understand'
const ESTIMATE_SHARE = 0.15

type Declared = {box: Box; size: number}

function declaredSizes(): Promise<Declared[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.stripe *')].map((element) => {
      const rect = element.getBoundingClientRect()
      return {
        box: {x: rect.x + scrollX, y: rect.y + scrollY, w: rect.width, h: rect.height},
        size: Number.parseFloat(getComputedStyle(element).fontSize),
      }
    }),
  )
}

function declaredSize(input: {box: Box; scale: number; declared: Declared[]}): number | undefined {
  const {box, scale} = input
  const centre = {x: (box.x + box.w / 2) / scale, y: (box.y + box.h / 2) / scale, w: 0, h: 0}
  return input.declared
    .filter((element) => contains({outer: element.box, inner: centre}))
    .toSorted((a, b) => a.box.w * a.box.h - b.box.w * b.box.h)[0]?.size
}

function outlineLine(input: {lines: string[]; text: string}): string | undefined {
  const folded = input.text
    .split(' ')
    .filter((word) => word !== '')
    .join(' ')
  return input.lines.find((line) => line.trim().startsWith(`text "${folded}"`))
}

function outlineSize(line: string): {size: number; estimate: boolean} | null {
  const words = line
    .slice(line.lastIndexOf('"') + 1)
    .trim()
    .split(' ')
  const word = words[words.indexOf('size') + 1]
  if (!words.includes('size') || word === undefined) return null
  const estimate = word.startsWith('~')
  const size = Number((estimate ? word.slice(1) : word).split('/')[0])
  return Number.isFinite(size) ? {size, estimate} : null
}

function slotPicture(input: {source: string; slot: Box; picture: string}): string {
  const {source, slot, picture} = input
  const left = Math.round(slot.x + slot.w / 2 - AGENT_ICON_SIDE / 2)
  const top = Math.round(slot.y + slot.h / 2 - AGENT_ICON_SIDE / 2)
  const wrapped = `<span style={{position: 'absolute', left: ${left}, top: ${top}, width: ${AGENT_ICON_SIDE}, height: ${AGENT_ICON_SIDE}}}>${picture}</span>${DAYBREAK_TAG}`
  return `${PLACEHOLDER_IMPORT}\n${source.replace(DAYBREAK_TAG, wrapped)}`
}

async function drawnDiff(): Promise<{
  drawn: number
  paired: number
  unbuilt: Box[]
  warnings: DiffReport['warnings']
  mismatch: number
  brief: string[]
}> {
  const raw = await rpc.registry.call({name: 'design_diff', input: {full: true}})
  const report = FullReportSchema.parse(raw)
  const {counts} = compactReport(raw)
  return {
    drawn: counts.drawn,
    paired: counts.paired,
    unbuilt: report.unmatched.flatMap((entry) =>
      entry.kind === 'unbuilt' && entry.target !== undefined ? [entry.target] : [],
    ),
    warnings: report.warnings.filter((warning) => warning.warning === 'svg-drawn'),
    mismatch: report.mismatch,
    brief: report.brief,
  }
}

function contains(input: {outer: Box; inner: Box}): boolean {
  const {outer, inner} = input
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}

const GRADIENT_DESIGN = 'gradients-640'
const GRADIENT_SIZE = {width: 640, height: 420}
const VERTICAL_BOX = {x: 40, y: 40, w: 280, h: 140}
const HORIZONTAL_BOX = {x: 360, y: 40, w: 240, h: 140}
const PICTURE_BOX = {x: 40, y: 230, w: 200, h: 140}
const CHECKER = 20

type Channels = [number, number, number]

function blend(input: {from: Channels; to: Channels; at: number}): Channels {
  const {from, to, at} = input
  const mixed = (channel: 0 | 1 | 2): number => Math.round(from[channel] + (to[channel] - from[channel]) * at)
  return [mixed(0), mixed(1), mixed(2)]
}

function paintBox(input: {png: PNG; box: Box; paint: (dx: number, dy: number) => Channels}): void {
  const {png, box, paint} = input
  Array.from({length: box.h * box.w}, (_, index) => index).forEach((index) => {
    const dx = index % box.w
    const dy = Math.floor(index / box.w)
    png.data.set(paint(dx, dy), ((box.y + dy) * png.width + box.x + dx) * 4)
  })
}

async function writeGradientDesign(): Promise<void> {
  const png = new PNG(GRADIENT_SIZE)
  png.data.fill(255)
  paintBox({
    png,
    box: VERTICAL_BOX,
    paint: (_, dy) => blend({from: [0x63, 0x5b, 0xff], to: [0x00, 0xd4, 0xff], at: dy / (VERTICAL_BOX.h - 1)}),
  })
  paintBox({
    png,
    box: HORIZONTAL_BOX,
    paint: (dx) => blend({from: [0xff, 0xd9, 0xbd], to: [0xa7, 0x8b, 0xfa], at: dx / (HORIZONTAL_BOX.w - 1)}),
  })
  paintBox({
    png,
    box: PICTURE_BOX,
    paint: (dx, dy) =>
      (Math.floor(dx / CHECKER) + Math.floor(dy / CHECKER)) % 2 === 0 ? [30, 60, 200] : [240, 160, 40],
  })
  await writeFile(target(GRADIENT_DESIGN), PNG.sync.write(png))
}

const GRADIENT_PAGE = `export function Stripe() {
  return (
    <main style={{margin: -24, height: 420, display: 'grid', gridTemplateColumns: '280px 240px', gridTemplateRows: '140px', columnGap: 40, padding: 40, background: '#ffffff'}}>
      <div style={{background: '#635bff'}} />
      <div style={{backgroundImage: 'linear-gradient(to right, #f6d1c3, #b093f4)'}} />
    </main>
  )
}
`
const PICTURE_PAGE = `export function Stripe() {
  return (
    <main style={{margin: -24, height: 420, position: 'relative', background: '#ffffff'}}>
      <div style={{position: 'absolute', left: ${PICTURE_BOX.x}, top: ${PICTURE_BOX.y}, width: ${PICTURE_BOX.w}, height: ${PICTURE_BOX.h}, background: '#8a2be2'}} />
    </main>
  )
}
`
const DECOR_DESIGN = 'decor-grid-800'
const DECOR_SIZE = {width: 800, height: 480}
const DECOR_PANEL = {x: 40, y: 40, w: 704, h: 400}
const DECOR_PADDING = 20
const DECOR_CARD = {w: 192, h: 168}
const DECOR_GAP = 24
const DECOR_BLOCK = {inset: 16, w: 100, h: 24}
const DECOR_PICTURE = {x: 660, y: 76, w: 56, h: 56}

function decorCards(): Box[] {
  return Array.from({length: 6}, (_, index) => ({
    x: DECOR_PANEL.x + DECOR_PADDING + (index % 3) * (DECOR_CARD.w + DECOR_GAP),
    y: DECOR_PANEL.y + DECOR_PADDING + Math.floor(index / 3) * (DECOR_CARD.h + DECOR_GAP),
    ...DECOR_CARD,
  }))
}

async function writeDecorDesign(): Promise<void> {
  const png = new PNG(DECOR_SIZE)
  png.data.fill(255)
  paintBox({png, box: DECOR_PANEL, paint: () => [0xee, 0xf2, 0xf7]})
  decorCards().forEach((card) => {
    paintBox({png, box: card, paint: () => [0xc7, 0xd2, 0xfe]})
    paintBox({
      png,
      box: {x: card.x + DECOR_BLOCK.inset, y: card.y + DECOR_BLOCK.inset, w: DECOR_BLOCK.w, h: DECOR_BLOCK.h},
      paint: () => [0x37, 0x30, 0xa3],
    })
  })
  paintBox({
    png,
    box: DECOR_PICTURE,
    paint: (dx, dy) =>
      (Math.floor(dx / CHECKER) + Math.floor(dy / CHECKER)) % 2 === 0 ? [30, 60, 200] : [240, 160, 40],
  })
  await writeFile(target(DECOR_DESIGN), PNG.sync.write(png))
}

const DECOR_PAGE = `export function Stripe() {
  return (
    <main style={{margin: -24, height: ${DECOR_SIZE.height}, position: 'relative', background: '#ffffff'}}>
      <div style={{position: 'absolute', left: ${DECOR_PANEL.x}, top: ${DECOR_PANEL.y}, width: ${DECOR_PANEL.w}, height: ${DECOR_PANEL.h}, boxSizing: 'border-box', padding: ${DECOR_PADDING}, display: 'grid', gridTemplateColumns: 'repeat(3, ${DECOR_CARD.w}px)', gridAutoRows: ${DECOR_CARD.h}, gap: ${DECOR_GAP}, background: '#eef2f7'}}>
        {[0, 1, 2, 3, 4, 5].map((card) => (
          <div key={card} style={{background: '#c7d2fe', paddingTop: ${DECOR_BLOCK.inset}, paddingLeft: ${DECOR_BLOCK.inset}}}>
            <div style={{width: ${DECOR_BLOCK.w}, height: ${DECOR_BLOCK.h}, background: '#3730a3'}} />
          </div>
        ))}
        <div style={{position: 'absolute', left: ${DECOR_PICTURE.x - DECOR_PANEL.x}, top: ${DECOR_PICTURE.y - DECOR_PANEL.y}, width: ${DECOR_PICTURE.w}, height: ${DECOR_PICTURE.h}, background: '#8a2be2'}} />
      </div>
    </main>
  )
}
`
const ROW_DESIGN = 'decor-row-800'
const ROW_PICTURES: Box[] = [
  {x: 200, y: 268, w: 56, h: 56},
  {x: 420, y: 268, w: 56, h: 56},
]

async function writeRowDesign(): Promise<void> {
  const png = new PNG(DECOR_SIZE)
  png.data.fill(255)
  paintBox({png, box: DECOR_PANEL, paint: () => [0xee, 0xf2, 0xf7]})
  decorCards()
    .slice(0, 3)
    .forEach((card) => {
      paintBox({png, box: card, paint: () => [0xc7, 0xd2, 0xfe]})
      paintBox({
        png,
        box: {x: card.x + DECOR_BLOCK.inset, y: card.y + DECOR_BLOCK.inset, w: DECOR_BLOCK.w, h: DECOR_BLOCK.h},
        paint: () => [0x37, 0x30, 0xa3],
      })
    })
  ROW_PICTURES.forEach((box) =>
    paintBox({
      png,
      box,
      paint: (dx, dy) =>
        (Math.floor(dx / CHECKER) + Math.floor(dy / CHECKER)) % 2 === 0 ? [30, 60, 200] : [240, 160, 40],
    }),
  )
  await writeFile(target(ROW_DESIGN), PNG.sync.write(png))
}

const ROW_PAGE = `export function Stripe() {
  return (
    <main style={{margin: -24, height: ${DECOR_SIZE.height}, position: 'relative', background: '#ffffff'}}>
      <div style={{position: 'absolute', left: ${DECOR_PANEL.x}, top: ${DECOR_PANEL.y}, width: ${DECOR_PANEL.w}, height: ${DECOR_PANEL.h}, boxSizing: 'border-box', padding: ${DECOR_PADDING}, display: 'grid', gridTemplateColumns: 'repeat(4, 150px)', gap: 16, alignItems: 'start', background: '#eef2f7'}}>
        {[0, 1, 2].map((card) => (
          <div key={card} style={{height: ${DECOR_CARD.h}, background: '#c7d2fe', paddingTop: ${DECOR_BLOCK.inset}, paddingLeft: ${DECOR_BLOCK.inset}}}>
            <div style={{width: ${DECOR_BLOCK.w}, height: ${DECOR_BLOCK.h}, background: '#3730a3'}} />
          </div>
        ))}
        {[0, 1].map((picture) => (
          <div key={picture} style={{width: 56, height: 56, background: '#8a2be2'}} />
        ))}
      </div>
    </main>
  )
}
`
const BANDS_DESIGNS = {stacked: 'bands-stacked-800', three: 'bands-three-800', two: 'bands-two-800'}

async function writeCardsDesign(input: {name: string; cards: Box[]}): Promise<void> {
  const png = new PNG(DECOR_SIZE)
  png.data.fill(255)
  paintBox({png, box: DECOR_PANEL, paint: () => [0xee, 0xf2, 0xf7]})
  input.cards.forEach((card) => {
    paintBox({png, box: card, paint: () => [0xc7, 0xd2, 0xfe]})
    paintBox({
      png,
      box: {x: card.x + DECOR_BLOCK.inset, y: card.y + DECOR_BLOCK.inset, w: DECOR_BLOCK.w, h: DECOR_BLOCK.h},
      paint: () => [0x37, 0x30, 0xa3],
    })
  })
  await writeFile(target(input.name), PNG.sync.write(png))
}

function gridPage(input: {columns: string; children: string}): string {
  return `export function Stripe() {
  return (
    <main style={{margin: -24, height: ${DECOR_SIZE.height}, position: 'relative', background: '#ffffff'}}>
      <div style={{position: 'absolute', left: ${DECOR_PANEL.x}, top: ${DECOR_PANEL.y}, width: ${DECOR_PANEL.w}, height: ${DECOR_PANEL.h}, boxSizing: 'border-box', padding: ${DECOR_PADDING}, display: 'grid', gridTemplateColumns: '${input.columns}', gap: ${DECOR_GAP}, alignItems: 'start', justifyItems: 'start', background: '#eef2f7'}}>
${input.children}
      </div>
    </main>
  )
}
`
}

function cardChild(area: string): string {
  return `        <div style={{gridArea: '${area}', width: ${DECOR_CARD.w}, height: ${DECOR_CARD.h}, boxSizing: 'border-box', paddingTop: ${DECOR_BLOCK.inset}, paddingLeft: ${DECOR_BLOCK.inset}, background: '#c7d2fe'}}>
          <div style={{width: ${DECOR_BLOCK.w}, height: ${DECOR_BLOCK.h}, background: '#3730a3'}} />
        </div>`
}

const STACKED_PAGE = gridPage({
  columns: '1fr',
  children: [
    cardChild('1 / 1'),
    `        <div style={{gridArea: '1 / 1', width: 56, height: 56, marginTop: 60, marginLeft: 100, background: '#8a2be2'}} />`,
    `        <p style={{gridArea: '1 / 1', margin: '96px 0 0 16px', width: 120, font: '16px/20px sans-serif'}}>Stacked copy</p>`,
    `        <div style={{gridArea: '1 / 1', width: 80, height: 24, marginTop: 128, marginLeft: 16, background: '#3730a3'}} />`,
  ].join('\n'),
})
const THREE_PAGE = gridPage({
  columns: `repeat(3, ${DECOR_CARD.w}px)`,
  children: ['auto', 'auto', 'auto'].map(cardChild).join('\n'),
})

async function panelColumns(input: {
  design: string
  cards: Box[]
  text: string
}): Promise<DiffReport['components'][number]['deltas']> {
  await writeCardsDesign({name: input.design, cards: input.cards})
  const {columns} = await designedPanel({design: input.design, text: input.text})
  return columns
}

async function designedPanel(input: {
  design: string
  text: string
}): Promise<{columns: DiffReport['components'][number]['deltas']; children: number}> {
  await goto('stripe')
  await page.setViewportSize(DECOR_SIZE)
  const {id} = await freshTarget(input.design)
  const nodes = await storedNodes(id)
  const panel = nodes.find((node) => node.kind === 'box' && near({a: node.box, b: DECOR_PANEL}))
  if (panel === undefined) throw new Error(`${input.design} has no panel`)
  const source = await readFile(STRIPE_SOURCE, 'utf8')
  try {
    await rewrite({id, file: STRIPE_SOURCE, text: input.text})
    const report = FullReportSchema.parse(await rpc.registry.call({name: 'design_diff', input: {full: true}}))
    const columns = report.components
      .filter((component) => component.nodes?.includes(panel.id) === true)
      .flatMap((component) => component.deltas.filter((delta) => delta.kind === 'columns'))
    return {columns, children: nodes.filter((node) => node.within === panel.id).length}
  } finally {
    await writeFile(STRIPE_SOURCE, source)
    await page.setViewportSize({width: 1280, height: 720})
  }
}

const GUIDE_DESIGN = 'guide-overlap-800'
const GUIDE_PHOTO = {x: 60, y: 60, w: 240, h: 240}
const GUIDE_DECORATIONS: {box: Box; rgb: Channels}[] = [
  {box: {x: 272, y: 120, w: 40, h: 40}, rgb: [0x10, 0xb9, 0x81]},
  {box: {x: 100, y: 280, w: 40, h: 40}, rgb: [0xe1, 0x1d, 0x48]},
]
const GUIDE_COPY: {box: Box; rgb: Channels}[] = [
  {box: {x: 324, y: 60, w: 300, h: 64}, rgb: [0x1e, 0x1b, 0x4b]},
  {box: {x: 324, y: 148, w: 260, h: 48}, rgb: [0x64, 0x74, 0x8b]},
  {box: {x: 324, y: 220, w: 120, h: 40}, rgb: [0x63, 0x5b, 0xff]},
]
const GUIDE_COPY_ORIGIN = {x: GUIDE_PHOTO.x + GUIDE_PHOTO.w + DECOR_GAP, y: GUIDE_PHOTO.y}

async function writeGuideDesign(): Promise<void> {
  const png = new PNG(DECOR_SIZE)
  png.data.fill(255)
  paintBox({png, box: DECOR_PANEL, paint: () => [0xee, 0xf2, 0xf7]})
  paintBox({
    png,
    box: GUIDE_PHOTO,
    paint: (dx, dy) =>
      (Math.floor(dx / CHECKER) + Math.floor(dy / CHECKER)) % 2 === 0 ? [30, 60, 200] : [240, 160, 40],
  })
  const solids = [...GUIDE_DECORATIONS, ...GUIDE_COPY]
  solids.forEach(({box, rgb}) => paintBox({png, box, paint: () => rgb}))
  await writeFile(target(GUIDE_DESIGN), PNG.sync.write(png))
}

function guideChild(input: {area: string; box: Box; rgb: Channels; origin: {x: number; y: number}}): string {
  const {area, box, rgb, origin} = input
  const color = `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
  return `        <div style={{gridArea: '${area}', width: ${box.w}, height: ${box.h}, marginLeft: ${box.x - origin.x}, marginTop: ${box.y - origin.y}, background: '${color}'}} />`
}

const GUIDE_PAGE = gridPage({
  columns: `${GUIDE_PHOTO.w}px 1fr`,
  children: [
    guideChild({area: '1 / 1', box: GUIDE_PHOTO, rgb: [0x8a, 0x2b, 0xe2], origin: GUIDE_PHOTO}),
    ...GUIDE_DECORATIONS.map(({box, rgb}) => guideChild({area: '1 / 1', box, rgb, origin: GUIDE_PHOTO})),
    ...GUIDE_COPY.map(({box, rgb}) => guideChild({area: '1 / 2', box, rgb, origin: GUIDE_COPY_ORIGIN})),
  ].join('\n'),
})

const PICTURE_PAINT_KINDS: string[] = ['background', 'foreground', 'border']
async function paintItems(id: string): Promise<{size: number; sentence: string}[]> {
  const ledger = await storedLedger(id)
  const watched = watchDef.outputSchema?.parse(await rpc.registry.call({name: watchDef.name, input: {limit: 2000}}))
  const said = new Map((watched?.rows ?? []).map((row) => [row.node, row.item ?? '']))
  return Object.entries(ledger.nodes).flatMap(([node, entry]) =>
    entry.item !== null && entry.item.stage === 'paint'
      ? [{size: entry.item.size, sentence: said.get(node) ?? ''}]
      : [],
  )
}

function placeholderRendered(): Promise<boolean> {
  return page.evaluate(() => document.querySelector('[data-conciv-source*="Placeholder.tsx"]') !== null)
}

const HERO_TEXT = '"Access borderless'
const UNKNOWN_SECTION = 'no-such-section'
const FIRST_SECTION_TEXT = 'Quarterly revenue'
const SECOND_SECTION_TEXT = 'Twelve invoices'
const ROUND_BUDGET = 8
const SHIFT_STEP = 24

type Section = NonNullable<StatusReport['sections']>[number]

async function outlineLines(status: StatusReport): Promise<string[]> {
  return (await readFile(fileUnder(stateRoot, status.designPath ?? ''), 'utf8')).split('\n')
}

function sectionLine(input: {lines: string[]; section: Section}): number {
  return input.lines.indexOf(`  section ${input.section.id} ${input.section.line}`)
}

function sectionHolding(input: {nodes: StoredNode[]; node: string}): string {
  const found = input.nodes.find((candidate) => candidate.id === input.node)
  if (found === undefined) return input.node
  if (found.within === undefined || !input.nodes.some((candidate) => candidate.id === found.within)) return found.id
  return sectionHolding({nodes: input.nodes, node: found.within})
}

function sectionWithText(input: {nodes: StoredNode[]; text: string}): string {
  const found = input.nodes.find((node) => node.text?.includes(input.text) === true)
  if (found === undefined) throw new Error(`no design node reads ${input.text}`)
  return sectionHolding({nodes: input.nodes, node: found.id})
}

function reportedNodes(report: DiffReport): string[] {
  const {done, regressed, paired, lost, moved} = report.changes
  return [
    ...report.rows.flatMap((row) => (row.node === undefined ? [] : [row.node])),
    ...report.unmatched.flatMap((entry) => (entry.node === undefined ? [] : [entry.node])),
    ...[...done, ...regressed, ...paired, ...lost, ...moved].map((change) => change.node),
  ]
}

async function heroSection(): Promise<{sections: Section[]; lines: string[]; hero: Section}> {
  const status = await call('design_status', {})
  const sections = status.sections ?? []
  const lines = await outlineLines(status)
  const title = lines.findIndex((line) => line.includes(HERO_TEXT))
  const hero = sections.findLast((section) => sectionLine({lines, section}) < title)
  if (hero === undefined) throw new Error('no section holds the hero title')
  return {sections, lines, hero}
}

describe('sections', () => {
  it('cuts the stripe page into regions and keeps the hero title and picture in the hero region', async ({
    annotate,
  }) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const {sections, hero} = await heroSection()
    const nodes = await storedNodes(id)
    const held = nodes.filter((node) => sectionHolding({nodes, node: node.id}) === hero.id)
    const loose = nodes.filter((node) => node.kind === 'text' && node.within === undefined)
    const widest = nodes
      .filter((node) => node.kind === 'image')
      .toSorted((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)
      .at(0)
    await annotate(
      `sections ${sections.length} ${JSON.stringify(sections.map((section) => section.line))}; loose texts ${JSON.stringify(loose.map((node) => node.text))}`,
    )
    expect(sections.length).toBeGreaterThanOrEqual(5)
    expect(sections.length).toBeLessThanOrEqual(15)
    expect(loose).toEqual([])
    expect(held.some((node) => node.text?.includes('Financial infrastructure') === true)).toBe(true)
    expect(held.some((node) => node.id === widest?.id)).toBe(true)
  }, 300_000)

  it('lists the top-level nodes as sections and scopes a diff to the hero section', async ({annotate}) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const {sections, lines, hero} = await heroSection()
    const at = sections.map((section) => sectionLine({lines, section}))
    await annotate(`sections ${JSON.stringify(sections.map((section) => ({id: section.id, line: section.line})))}`)
    expect(sections.length).toBeGreaterThanOrEqual(4)
    expect(at.filter((index) => index < 0)).toEqual([])
    expect(at).toEqual(at.toSorted((a, b) => a - b))
    const nodes = await storedNodes(id)
    const whole = await call('design_diff', {})
    const scoped = await call('design_diff', {section: hero.id})
    const strays = reportedNodes(scoped).filter((node) => sectionHolding({nodes, node}) !== hero.id)
    await annotate(
      `whole rows ${whole.rows.length} brief ${JSON.stringify(whole.brief)} stop ${whole.stop}; scoped rows ${scoped.rows.length} brief ${JSON.stringify(scoped.brief)} stop ${scoped.stop} page ${JSON.stringify(scoped.page)}`,
    )
    expect(scoped.section).toEqual({id: hero.id, line: hero.line})
    expect(strays).toEqual([])
    expect(scoped.brief.join('\n').length).toBeLessThan(whole.brief.join('\n').length)
    expect(scoped.page?.stop).toBe(whole.stop)
    const unknown = await call('design_diff', {section: UNKNOWN_SECTION}).then(
      () => '',
      (error: unknown) => String(error),
    )
    expect(unknown).toContain(UNKNOWN_SECTION)
    expect(sections.filter((section) => !unknown.includes(section.id))).toEqual([])
  }, 300_000)

  it('hiding the lilac card regresses its nodes in its own section and none in the hero section', async ({
    annotate,
  }) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    await call('design_diff', {})
    const {hero} = await heroSection()
    const nodes = await storedNodes(id)
    const source = await readFile(STRIPE_SOURCE, 'utf8')
    const card = lilacNodes({ledger: await storedLedger(id), source, status: 'done'})
    const [first] = card
    if (first === undefined) throw new Error('the lilac card has no done node')
    const holder = sectionHolding({nodes, node: first})
    const held = card.filter((node) => sectionHolding({nodes, node}) === holder)
    expect(holder).not.toBe(hero.id)
    const styles = await readFile(STRIPE_STYLES, 'utf8')
    try {
      await rewrite({id, file: STRIPE_STYLES, text: `${styles}\n.${LILAC_CLASS} { display: none; }\n`})
      const hidden = await call('design_diff', {section: holder})
      const regressed = hidden.changes.regressed.map((change) => change.node)
      const elsewhere = await call('design_diff', {section: hero.id})
      await annotate(
        `card section ${holder} regressed ${regressed.length} of ${held.length}; hero regressed ${elsewhere.changes.regressed.length}`,
      )
      expect(held.filter((node) => !regressed.includes(node))).toEqual([])
      expect(elsewhere.changes.regressed).toEqual([])
    } finally {
      await writeFile(STRIPE_STYLES, styles)
    }
  }, 300_000)

  it('spends the round budget per section: the finished section used one round, the edited one stops budget, and the page never does', async ({
    annotate,
  }) => {
    await goto('sections')
    const {id} = await freshTarget('sections-1280')
    const nodes = await storedNodes(id)
    const first = sectionWithText({nodes, text: FIRST_SECTION_TEXT})
    const second = sectionWithText({nodes, text: SECOND_SECTION_TEXT})
    const styles = await readFile(HOST_STYLES, 'utf8')
    const stops: (string | null)[] = []
    try {
      await rewrite({id, file: HOST_STYLES, text: `${styles}\n.section-first h2 { color: ${EDITED_INK}; }\n`})
      await call('design_diff', {section: first})
      await rewrite({id, file: HOST_STYLES, text: styles})
      await call('design_diff', {section: first})
      for (const step of Array.from({length: ROUND_BUDGET}, (_, index) => index + 1)) {
        const shifted = `${styles}\n.section-line { position: relative; left: ${step * SHIFT_STEP}px; }\n`
        await rewrite({id, file: HOST_STYLES, text: shifted})
        stops.push((await call('design_diff', {section: second})).stop)
      }
      const status = await call('design_status', {})
      const used = Object.fromEntries((status.sections ?? []).map((section) => [section.id, section.roundsUsed]))
      const scoped = await call('design_diff', {section: second})
      const finished = await call('design_diff', {section: first})
      await annotate(`stops ${JSON.stringify(stops)} rounds used ${JSON.stringify(used)}`)
      expect(first).not.toBe(second)
      expect(used).toEqual({[first]: 1, [second]: ROUND_BUDGET})
      expect(stops.slice(0, -1)).not.toContain('budget')
      expect(stops.at(-1)).toBe('budget')
      expect(scoped.stop).toBe('budget')
      expect(scoped.page?.stop).not.toBe('budget')
      expect(finished.stop).toBe('done')
    } finally {
      await writeFile(HOST_STYLES, styles)
    }
  }, 300_000)

  it('a whole-page loop past the round budget with an item still open and the score moving never stops budget', async ({
    annotate,
  }) => {
    await goto('sections')
    const {id} = await freshTarget('sections-1280')
    const styles = await readFile(HOST_STYLES, 'utf8')
    const reports: DiffReport[] = []
    try {
      for (const step of Array.from({length: ROUND_BUDGET + 1}, (_, index) => index + 1)) {
        const shifted = `${styles}\n.section-line { position: relative; left: ${step * SHIFT_STEP}px; }\n`
        await rewrite({id, file: HOST_STYLES, text: shifted})
        reports.push(await call('design_diff', {}))
      }
      const status = await call('design_status', {})
      const stops = reports.map((report) => report.stop)
      const scores = reports.map((report) => report.score.join(' '))
      await annotate(`stops ${JSON.stringify(stops)} scores ${JSON.stringify(scores)}`)
      expect(reports.at(-1)?.round).toBe(ROUND_BUDGET + 1)
      expect(reports.at(-1)?.stage).not.toBeNull()
      expect(new Set(scores).size).toBe(scores.length)
      expect(stops).not.toContain('budget')
      expect((status.sections ?? []).filter((section) => section.roundsUsed > 0)).toEqual([])
    } finally {
      await writeFile(HOST_STYLES, styles)
    }
  }, 300_000)

  it('the hero section holds the picture beside its text inside its box, and its diff on an empty page is not done', async ({
    annotate,
  }) => {
    await goto('empty')
    const {id} = await freshTarget('stripe-1280')
    const {hero} = await heroSection()
    const nodes = await storedNodes(id)
    const section = nodes.find((node) => node.id === hero.id)
    const picture = nodes
      .filter((node) => node.kind === 'image' && sectionHolding({nodes, node: node.id}) === hero.id)
      .toSorted((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)
      .at(0)
    if (section === undefined || picture === undefined) throw new Error('the hero section holds no picture')
    const report = await call('design_diff', {section: hero.id, full: true, limit: 60})
    await annotate(
      `section ${JSON.stringify(section.box)} picture ${JSON.stringify(picture.box)} stop ${report.stop} brief ${JSON.stringify(report.brief.slice(0, 3))}`,
    )
    expect(inside({inner: picture.box, outer: section.box})).toBe(true)
    expect(report.unmatched.some((entry) => entry.node === picture.id)).toBe(true)
    expect(report.stop).toBeNull()
    expect(report.brief[0]).toBe('nothing of this section is built yet')
  }, 300_000)
})

async function iconCount(): Promise<{icons: number; brief: string[]}> {
  const compact = compactReport(await rpc.registry.call({name: 'design_diff', input: {}}))
  return {icons: compact.counts.icons, brief: compact.brief}
}

describe('icons', () => {
  it('registration stores icon reads as image nodes, outlines them as icons and briefs none of them', async ({
    annotate,
  }) => {
    await goto('stripe')
    const {id, text} = await freshTarget('stripe-1280')
    const nodes = await storedNodes(id)
    const texts = nodes.flatMap((node) => (node.kind === 'text' ? [{text: node.text ?? '', box: node.box}] : []))
    const slots = nodes.filter((node) => node.kind === 'image' && under({box: node.box, side: ICON_SLOT_SIDE}))
    const status = await call('design_status', {})
    const outline = (await readFile(fileUnder(stateRoot, status.designPath ?? ''), 'utf8')).split('\n')
    const {icons, brief} = await iconCount()
    await annotate(
      `text nodes ${texts.length} (runs ${text?.runs ?? 0}) icon slots ${slots.length} ${JSON.stringify(slots.map((node) => node.box))} counts.icons ${icons} brief ${JSON.stringify(brief.slice(0, 5))}`,
    )
    expect(texts.filter((node) => Array.from(node.text).some(foreign))).toEqual([])
    expect(
      texts.filter((node) => Array.from(node.text.trim()).length === 1 && under({box: node.box, side: ICON_SIDE})),
    ).toEqual([])
    expect(slots.length).toBeGreaterThanOrEqual(3)
    expect(outline.some((line) => line.trim().startsWith('icon '))).toBe(true)
    expect(brief.filter((line) => line.includes('icon') || quotesOneCharacter(line))).toEqual([])
    expect(icons).toBeGreaterThanOrEqual(3)
  }, 240_000)

  it('a picture counts the text it paints around, the outline says how many lines it holds, and glyph noise is dropped', async ({
    annotate,
  }) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const nodes = await storedNodes(id)
    const pictures = nodes.filter(
      (node) => node.kind === 'image' && node.box.w >= ICON_SLOT_SIDE && node.box.h >= ICON_SLOT_SIDE,
    )
    const texts = nodes.filter((node) => node.kind === 'text')
    const noise = nodes.filter((node) => node.kind === 'image' && under({box: node.box, side: GLYPH_NOISE}))
    const [hero] = pictures.toSorted((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)
    const held = pictures.reduce((sum, node) => sum + (node.holds ?? 0), 0)
    const status = await call('design_status', {})
    const outline = await outlineLines(status)
    const compact = compactReport(await rpc.registry.call({name: 'design_diff', input: {}}))
    const nonImage = nodes.filter((node) => node.kind !== 'image').length
    await annotate(
      `texts ${texts.length} pictures ${JSON.stringify(pictures.map((node) => ({box: node.box, holds: node.holds})))} held ${held} hero ${JSON.stringify(hero?.box)} holds ${hero?.holds} noise ${noise.length} counts.unbuilt ${compact.counts.unbuilt} non-image nodes ${nonImage}`,
    )
    expect(noise).toEqual([])
    expect(hero?.holds ?? 0).toBeGreaterThan(0)
    expect(
      outline.filter((line) =>
        line.includes(`image ${hero?.box.w}x${hero?.box.h} placeholder (holds ${hero?.holds} text lines)`),
      ),
    ).toHaveLength(1)
    expect(outline.filter((line) => line.includes('(holds 0 text lines)'))).toEqual([])
    expect(compact.counts.unbuilt).toBeLessThanOrEqual(nonImage)
  }, 240_000)

  it('a picture owns only the text it paints around: the nav, the buttons and the logo row stay text', async ({
    annotate,
  }) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const nodes = await storedNodes(id)
    const [hero] = nodes
      .filter((node) => node.kind === 'image' && node.box.w >= ICON_SLOT_SIDE && node.box.h >= ICON_SLOT_SIDE)
      .toSorted((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)
    const texts = nodes.flatMap((node) => (node.kind === 'text' ? [node.text ?? ''] : []))
    const covered = nodes.flatMap((node) =>
      node.kind === 'text' && hero !== undefined && enclosedIn({inner: node.box, outer: hero.box})
        ? [node.text ?? '']
        : [],
    )
    await annotate(
      `texts ${texts.length} hero ${JSON.stringify(hero?.box)} holds ${hero?.holds} covered ${JSON.stringify(covered)}`,
    )
    expect(covered).toEqual(
      expect.arrayContaining([
        'Pricing',
        'Sign in',
        'Contact sales',
        'Ford',
        'coinbase',
        'shopify',
        '6 sales reps available',
      ]),
    )
    expect(texts.filter((text) => PAINTED_OVER.includes(text))).toEqual([])
    expect(hero?.holds ?? 0).toBeGreaterThanOrEqual(PAINTED_OVER.length)
    expect(texts.length).toBeGreaterThanOrEqual(150)
  }, 240_000)

  it('an icon the agent renders inside the lilac card fills an icon slot', async ({annotate}) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const registered = await iconCount()
    const slot = daybreakSlot(await storedNodes(id))
    const source = await readFile(STRIPE_SOURCE, 'utf8')
    try {
      await rewrite({id, file: STRIPE_SOURCE, text: source.replace(DAYBREAK_TAG, agentIcon(slot))})
      const built = await iconCount()
      await annotate(
        `slot ${JSON.stringify(slot)} counts.icons ${registered.icons} -> ${built.icons} brief ${JSON.stringify(built.brief.slice(0, 5))}`,
      )
      expect(registered.icons).toBeGreaterThanOrEqual(3)
      expect(built.icons).toBeLessThanOrEqual(registered.icons - 1)
    } finally {
      await writeFile(STRIPE_SOURCE, source)
    }
  }, 300_000)

  it('the Placeholder compiles into the lilac card and costs nothing; an svg drawn there warns once at the same mismatch', async ({
    annotate,
  }) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const status = await call('design_status', {})
    const placeholder = await readFile(fileUnder(stateRoot, status.placeholderPath ?? ''), 'utf8')
    const slot = daybreakSlot(await storedNodes(id))
    const source = await readFile(STRIPE_SOURCE, 'utf8')
    const registered = await drawnDiff()
    try {
      await writeFile(PLACEHOLDER_SOURCE, placeholder)
      await rewrite({id, file: STRIPE_SOURCE, text: slotPicture({source, slot, picture: PLACEHOLDER_TAG})})
      const rendered = await placeholderRendered()
      const placed = await drawnDiff()
      await rewrite({id, file: STRIPE_SOURCE, text: slotPicture({source, slot, picture: DRAWN_SVG})})
      const drawn = await drawnDiff()
      await annotate(
        `slot ${JSON.stringify(slot)} paired ${registered.paired} -> ${placed.paired} placeholder drawn ${placed.drawn} mismatch ${placed.mismatch}; svg drawn ${drawn.drawn} mismatch ${drawn.mismatch} warnings ${JSON.stringify(drawn.warnings)} brief ${JSON.stringify(drawn.brief.slice(0, 3))}`,
      )
      expect(status.next).toContain(`copy ${status.placeholderPath} into the page's source`)
      expect(rendered).toBe(true)
      expect([placed.drawn, placed.warnings]).toEqual([0, []])
      expect(registered.unbuilt).toContainEqual(slot)
      expect(placed.paired).toBe(registered.paired + 1)
      expect(placed.unbuilt).not.toContainEqual(slot)
      expect(drawn.drawn).toBe(1)
      expect(drawn.warnings.map((warning) => warning.file?.endsWith('Stripe.tsx'))).toEqual([true])
      expect(
        drawn.brief.filter((line) => line.includes('drawn svg; replace it with <Placeholder kind="icon" />')),
      ).toHaveLength(1)
      expect(drawn.mismatch).toBe(placed.mismatch)
    } finally {
      await writeFile(STRIPE_SOURCE, source)
      await rm(PLACEHOLDER_SOURCE, {force: true})
    }
  }, 300_000)

  it('a smooth fill along one axis is a gradient with two ends; an uneven fill is an image', async ({annotate}) => {
    await goto('stripe')
    await writeGradientDesign()
    const {id} = await freshTarget(GRADIENT_DESIGN)
    const nodes = await storedNodes(id)
    const status = await call('design_status', {})
    const outline = (await readFile(fileUnder(stateRoot, status.designPath ?? ''), 'utf8')).split('\n')
    const gradients = nodes.flatMap((node) => (node.paint?.gradient === undefined ? [] : [node.paint.gradient]))
    await annotate(`gradients ${JSON.stringify(gradients)} outline ${JSON.stringify(outline)}`)
    expect(gradients.map((gradient) => gradient.axis).toSorted()).toEqual(['horizontal', 'vertical'])
    expect(outline.filter((line) => line.includes('background gradient #') && line.includes(' vertical'))).toHaveLength(
      1,
    )
    expect(outline.filter((line) => line.trim().startsWith('image 200x140 placeholder'))).toHaveLength(1)
  }, 240_000)

  it('a solid live box against the vertical gradient is a background item sized by its ends', async ({annotate}) => {
    await goto('stripe')
    await page.setViewportSize(GRADIENT_SIZE)
    await writeGradientDesign()
    const {id} = await freshTarget(GRADIENT_DESIGN)
    const source = await readFile(STRIPE_SOURCE, 'utf8')
    try {
      await rewrite({id, file: STRIPE_SOURCE, text: GRADIENT_PAGE})
      const report = FullReportSchema.parse(await rpc.registry.call({name: 'design_diff', input: {full: true}}))
      const items = await paintItems(id)
      const solid = items.filter((item) => item.sentence.includes('gradient #') && item.sentence.includes('#635bff'))
      await annotate(
        `paint items ${JSON.stringify(items)} score ${JSON.stringify(report.score)} brief ${JSON.stringify(report.brief.slice(0, 5))}`,
      )
      expect(solid.map((item) => item.size > 1)).toEqual([true])
      expect(report.score[4]).toBeGreaterThan(0)
      expect(report.score[4]).toBeGreaterThanOrEqual(solid[0]?.size ?? Number.POSITIVE_INFINITY)
    } finally {
      await writeFile(STRIPE_SOURCE, source)
      await page.setViewportSize({width: 1280, height: 720})
    }
  }, 240_000)

  it('a solid live box over the picture pairs it and has no paint row, since the picture is no colour', async ({
    annotate,
  }) => {
    await goto('stripe')
    await page.setViewportSize(GRADIENT_SIZE)
    await writeGradientDesign()
    const {id} = await freshTarget(GRADIENT_DESIGN)
    const picture = (await storedNodes(id)).find((node) => node.kind === 'image' && near({a: node.box, b: PICTURE_BOX}))
    if (picture === undefined) throw new Error(`${GRADIENT_DESIGN} has no image node at the picture`)
    const source = await readFile(STRIPE_SOURCE, 'utf8')
    try {
      await rewrite({id, file: STRIPE_SOURCE, text: PICTURE_PAGE})
      const report = FullReportSchema.parse(await rpc.registry.call({name: 'design_diff', input: {full: true}}))
      const pairs = await latestPairs(id)
      const deltas = report.components
        .filter((component) => component.nodes?.includes(picture.id) === true)
        .flatMap((component) => component.deltas)
      await annotate(`picture ${JSON.stringify(picture.box)} deltas ${JSON.stringify(deltas)}`)
      expect(pairs.map((pair) => pair.node)).toContain(picture.id)
      expect(deltas.filter((delta) => PICTURE_PAINT_KINDS.includes(delta.kind))).toEqual([])
    } finally {
      await writeFile(STRIPE_SOURCE, source)
      await page.setViewportSize({width: 1280, height: 720})
    }
  }, 240_000)

  it('a 3 by 2 grid of cards with a picture over its right edge reads 3 columns, not 4', async ({annotate}) => {
    await goto('stripe')
    await page.setViewportSize(DECOR_SIZE)
    await writeDecorDesign()
    const {id} = await freshTarget(DECOR_DESIGN)
    const nodes = await storedNodes(id)
    const panel = nodes.find((node) => node.kind === 'box' && near({a: node.box, b: DECOR_PANEL}))
    const picture = nodes.find((node) => node.kind === 'image' && near({a: node.box, b: DECOR_PICTURE}))
    if (panel === undefined || picture === undefined) throw new Error(`${DECOR_DESIGN} has no grid panel or picture`)
    const source = await readFile(STRIPE_SOURCE, 'utf8')
    try {
      await rewrite({id, file: STRIPE_SOURCE, text: DECOR_PAGE})
      const report = FullReportSchema.parse(await rpc.registry.call({name: 'design_diff', input: {full: true}}))
      const pairs = await latestPairs(id)
      const columns = report.components
        .filter((component) => component.nodes?.includes(panel.id) === true)
        .flatMap((component) => component.deltas.filter((delta) => delta.kind === 'columns'))
      await annotate(`picture within ${picture.within ?? 'root'} columns ${JSON.stringify(columns)}`)
      expect(picture.within).toBe(panel.id)
      expect(pairs.map((pair) => pair.node)).toEqual(expect.arrayContaining([panel.id, picture.id]))
      expect(columns).toEqual([])
    } finally {
      await writeFile(STRIPE_SOURCE, source)
      await page.setViewportSize({width: 1280, height: 720})
    }
  }, 240_000)

  it('a design row of three cards with two pictures on the line below reads 3 columns', async ({annotate}) => {
    await goto('stripe')
    await page.setViewportSize(DECOR_SIZE)
    await writeRowDesign()
    const {id} = await freshTarget(ROW_DESIGN)
    const panel = (await storedNodes(id)).find((node) => node.kind === 'box' && near({a: node.box, b: DECOR_PANEL}))
    if (panel === undefined) throw new Error(`${ROW_DESIGN} has no panel`)
    const source = await readFile(STRIPE_SOURCE, 'utf8')
    try {
      await rewrite({id, file: STRIPE_SOURCE, text: ROW_PAGE})
      const report = FullReportSchema.parse(await rpc.registry.call({name: 'design_diff', input: {full: true}}))
      const columns = report.components
        .filter((component) => component.nodes?.includes(panel.id) === true)
        .flatMap((component) => component.deltas.filter((delta) => delta.kind === 'columns'))
      await annotate(`columns ${JSON.stringify(columns)}`)
      expect(columns).toEqual([expect.objectContaining({kind: 'columns', live: 4, target: 3})])
    } finally {
      await writeFile(STRIPE_SOURCE, source)
      await page.setViewportSize({width: 1280, height: 720})
    }
  }, 240_000)

  it('four live children stacked on one grid cell read one column, so a one-column design has no columns row', async ({
    annotate,
  }) => {
    const column = decorCards().filter((_, index) => index % 3 === 0)
    const columns = await panelColumns({design: BANDS_DESIGNS.stacked, cards: column, text: STACKED_PAGE})
    await annotate(`columns ${JSON.stringify(columns)}`)
    expect(columns).toEqual([])
  }, 240_000)

  it('three side by side cards read three columns: none against a design of three, one row against two', async ({
    annotate,
  }) => {
    const cards = decorCards()
    const three = await panelColumns({design: BANDS_DESIGNS.three, cards: cards.slice(0, 3), text: THREE_PAGE})
    const two = await panelColumns({design: BANDS_DESIGNS.two, cards: cards.slice(0, 2), text: THREE_PAGE})
    await annotate(`three ${JSON.stringify(three)} two ${JSON.stringify(two)}`)
    expect(three).toEqual([])
    expect(two).toEqual([expect.objectContaining({kind: 'columns', live: 3, target: 2})])
  }, 240_000)

  it('a photo overlapped by two decorations beside a copy column reads one column on both sides, so no columns row', async ({
    annotate,
  }) => {
    await writeGuideDesign()
    const {columns, children} = await designedPanel({design: GUIDE_DESIGN, text: GUIDE_PAGE})
    await annotate(`children ${children} columns ${JSON.stringify(columns)}`)
    expect(children).toBe(6)
    expect(columns).toEqual([])
  }, 240_000)

  it('a square gradient box reads radius 0 on both sides; the solid box rounded 23 is the only radius item', async ({
    annotate,
  }) => {
    await goto('stripe')
    await page.setViewportSize(GRADIENT_SIZE)
    await writeGradientDesign()
    const {id} = await freshTarget(GRADIENT_DESIGN)
    const source = await readFile(STRIPE_SOURCE, 'utf8')
    try {
      await rewrite({
        id,
        file: STRIPE_SOURCE,
        text: GRADIENT_PAGE.replace("background: '#635bff'", "background: '#635bff', borderRadius: 23"),
      })
      const report = FullReportSchema.parse(await rpc.registry.call({name: 'design_diff', input: {full: true}}))
      const radii = report.components.flatMap((component) =>
        component.deltas
          .filter((delta) => delta.kind === 'radius')
          .map((delta) => ({x: component.live.x, live: delta.live, target: delta.target})),
      )
      const boxes = (await storedNodes(id)).flatMap((node) =>
        node.kind === 'box' ? [{x: node.box.x, radius: node.radius}] : [],
      )
      await annotate(`radius deltas ${JSON.stringify(radii)} design boxes ${JSON.stringify(boxes)}`)
      expect(boxes.toSorted((a, b) => a.x - b.x)).toEqual([
        {x: VERTICAL_BOX.x, radius: 0},
        {x: HORIZONTAL_BOX.x, radius: 0},
      ])
      expect(radii).toEqual([{x: VERTICAL_BOX.x, live: 23, target: 0}])
    } finally {
      await writeFile(STRIPE_SOURCE, source)
      await page.setViewportSize({width: 1280, height: 720})
    }
  }, 240_000)

  it('the stripe design has no single-axis gradient box and its hero is not turned into an image', async ({
    annotate,
  }) => {
    await goto('stripe')
    const {id} = await freshTarget('stripe-1280')
    const nodes = await storedNodes(id)
    const status = await call('design_status', {})
    const outline = (await readFile(fileUnder(stateRoot, status.designPath ?? ''), 'utf8')).split('\n')
    const title = nodes.find((node) => node.kind === 'text' && (node.text ?? '').startsWith(HERO_TITLE))
    const gradients = nodes.flatMap((node) =>
      node.paint?.gradient === undefined ? [] : [{box: node.box, gradient: node.paint.gradient}],
    )
    const covering = nodes.filter(
      (node) => node.kind === 'image' && title !== undefined && contains({outer: node.box, inner: title.box}),
    )
    await annotate(
      `hero title ${JSON.stringify(title?.box)} within ${title?.within ?? 'the page'}; boxes ${JSON.stringify(nodes.filter((node) => node.kind === 'box').map((node) => node.paint))}; gradients ${JSON.stringify(gradients)}`,
    )
    expect(title).toBeDefined()
    expect(gradients).toEqual([])
    expect(outline.filter((line) => line.includes('background gradient'))).toEqual([])
    expect(covering).toEqual([])
  }, 240_000)
})

const HIDDEN_HINT = 'the page tab is hidden; bring it to the foreground and run design_diff again'
const UNANSWERED_MS = 2000

function hideTab(hidden: boolean): Promise<void> {
  return page.evaluate((hide) => {
    if (hide) Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'})
    if (!hide) Reflect.deleteProperty(document, 'visibilityState')
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
}

async function timedDiff(): Promise<{report: DiffReport; elapsed: number}> {
  const started = Date.now()
  const report = await call('design_diff', {})
  return {report, elapsed: Date.now() - started}
}

describe('page', () => {
  it('a hidden tab answers design_diff at once with the hidden hint and writes no result', async ({annotate}) => {
    await goto('/')
    const {id} = await freshTarget('u1-1280')
    const before = await runIds(id)
    await hideTab(true)
    try {
      const {report, elapsed} = await timedDiff()
      const status = await call('design_status', {})
      await annotate(`hidden: ${elapsed} ms, hint ${report.hint ?? ''}`)
      expect(elapsed).toBeLessThan(UNANSWERED_MS)
      expect(report.hint?.startsWith(HIDDEN_HINT)).toBe(true)
      expect(report.hint).toContain('1 hidden, 0 silent')
      expect([report.partial, report.stop, report.round]).toEqual([true, null, 0])
      expect(await runIds(id)).toEqual(before)
      expect(status.next).toBe(HIDDEN_HINT)
    } finally {
      await hideTab(false)
    }
  })

  it('a silent second widget on the session costs one ping budget, not the measure timeout', async ({annotate}) => {
    await goto('/')
    await freshTarget('u1-1280')
    await call('design_diff', {})
    const baseline = await timedDiff()
    const silent = await holdSilentSubscriber({apiBase: kit.apiBase, sessionId: kit.session})
    try {
      const {report, elapsed} = await timedDiff()
      await annotate(`baseline ${baseline.elapsed} ms, with a silent widget ${elapsed} ms`)
      expect(report.hint ?? '').not.toContain(HIDDEN_HINT)
      expect(report.partial).toBe(false)
      expect(elapsed).toBeLessThan(baseline.elapsed + UNANSWERED_MS)
      expect((await call('design_status', {})).next).not.toBe(HIDDEN_HINT)
    } finally {
      silent.close()
    }
  })
})

const PANE_NAME = 'Design x-ray'

async function openPane() {
  const chat = page
    .getByRole('button', {name: 'Open conciv chat'})
    .or(page.getByRole('button', {name: 'Minimize conciv chat'}))
  await expectLocator(chat).toBeVisible()
  if ((await chat.getAttribute('aria-label')) === 'Open conciv chat') await chat.click()
  await page.getByRole('button', {name: 'More composer actions'}).click()
  await page.getByRole('menuitem', {name: PANE_NAME}).click()
  await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
  const pane = page.getByRole('complementary', {name: PANE_NAME})
  await expectLocator(pane).toBeVisible()
  return pane
}

const UnbuiltSchema = z.object({kind: z.literal('unbuilt'), node: z.string(), target: ButtonBoxSchema})

describe('overlay', () => {
  it('the composer button opens the pane beside the page and the tab url stays', async () => {
    await goto('/')
    await freshTarget('u1-1280')
    await call('design_diff', {})
    const url = page.url()
    const pane = await openPane()
    await expectLocator(pane.getByRole('list', {name: 'Components'})).toBeVisible()
    await pane.getByText('Capture', {exact: true}).click()
    await expectLocator(pane.getByRole('figure').first()).toContainText('Live over design')
    expect(page.url()).toBe(url)
    await expectLocator(
      page.getByRole('button', {name: 'Make'}).or(page.getByRole('button', {name: 'Export'})),
    ).toBeVisible()
  })

  it('unbuilt rows on an empty page name their design node and show no source', async () => {
    await goto('empty')
    await freshTarget('u1-1280')
    await call('design_diff', {})
    const pane = await openPane()
    const rows = pane.getByRole('list', {name: 'Components'}).getByRole('listitem')
    await expectLocator(rows.filter({hasText: 'box at '}).first()).toContainText('box at ')
    await expectLocator(rows.filter({hasText: 'no source'})).toHaveCount(0)
  })

  it('clicking a row outlines its element in the page', async () => {
    await goto('/')
    const report = await call('design_diff', {})
    const second = report.components[1]
    expect(second?.source).toBeDefined()
    if (second?.source === undefined || second.source === null) return
    const pane = await openPane()
    const name = second.source.file.split('/').at(-1)?.split('.')[0] ?? second.source.file
    await pane.getByRole('button', {name, expanded: false}).first().click()
    await expectLocator(pane.getByRole('status').filter({hasText: 'Outlined'})).toContainText(`Outlined ${name}`)
  })

  it('pinning the toolbar text node to the toolbar on shifted removes its text row', async () => {
    await goto('shifted')
    const {id} = await freshTarget('u1-1280')
    await call('design_diff', {})
    const pane = await openPane()
    await expectLocator(pane.getByText('text Make → Export')).toBeVisible()
    const label = (await storedNodes(id)).find((node) => node.kind === 'text' && node.text === 'Export')
    const toolbar = (await call('design_capture', {height: 720})).components.find(
      (component) => component.source?.file === 'src/Toolbar.tsx',
    )
    expect([label, toolbar].every((found) => found !== undefined)).toBe(true)
    if (label === undefined || toolbar === undefined) return
    const pinned = await xrayRpc.xray.pin({id, node: label.id, path: toolbar.path, session: kit.session})
    const pinnedReport: DiffReport | null = pinned.report
    expect(pinnedReport?.components.flatMap((c) => c.deltas)).not.toContainEqual(
      expect.objectContaining({kind: 'text', live: 'Make', target: 'Export'}),
    )
    await expectLocator(pane.getByRole('button', {name: 'Unpin text "Export"'})).toBeVisible()
    await expectLocator(pane.getByText('text Make → Export')).toHaveCount(0)
  })

  it('excluding a region removes its rows next run', async () => {
    await goto('missing')
    const {id} = await freshTarget('u1-1280')
    const before = await call('design_diff', {})
    const regions = before.unmatched.flatMap((entry) => {
      const parsed = UnbuiltSchema.safeParse(entry)
      return parsed.success ? [parsed.data] : []
    })
    const region = regions.toSorted((a, b) => b.target.w * b.target.h - a.target.w * a.target.h)[0]
    expect(
      regions.filter((entry) => region !== undefined && inside({inner: entry.target, outer: region.target})).length,
    ).toBeGreaterThan(1)
    if (region === undefined) return
    const pane = await openPane()
    const marked = await xrayRpc.xray.mark({id, kind: 'excluded', node: region.node, session: kit.session})
    const markedReport: DiffReport | null = marked.report
    expect(
      markedReport?.unmatched.filter(
        (entry) => entry.target !== undefined && inside({inner: entry.target, outer: region.target}),
      ),
    ).toEqual([])
    await expectLocator(pane.getByRole('button', {name: 'Revoke excluded box'})).toBeVisible()
  })

  it('accepting a run from the pane turns design_status done', async () => {
    await goto('bordered')
    await freshTarget('u1-1280')
    await call('design_diff', {})
    expect((await call('design_status', {})).done).toBe(false)
    const pane = await openPane()
    await pane.getByRole('button', {name: 'Accept this run'}).click()
    await expectLocator(pane.getByText('Accepted', {exact: true})).toBeVisible()
    expect((await call('design_status', {})).done).toBe(true)
  })

  it('a run on another capture path is not compared for stalled', async () => {
    await goto('target')
    await freshTarget('u1-390')
    const mirrored = [await call('design_diff', {}), await call('design_diff', {})]
    expect(mirrored.map((report) => report.capturePath)).toEqual(['snapdom-mirror', 'snapdom-mirror'])
    await page.setViewportSize({width: 390, height: 720})
    try {
      const live = await call('design_diff', {})
      expect(live.capturePath).not.toBe('snapdom-mirror')
      expect(live.stop).not.toBe('stalled')
    } finally {
      await page.setViewportSize({width: 1280, height: 720})
    }
  })

  it('shows Capture pixels when Region Capture exists and a click without a stream keeps the capture path', async () => {
    await goto('/')
    await freshTarget('u1-1280')
    const before = await call('design_diff', {})
    await page.evaluate(() => {
      window.CropTarget ??= {fromElement: async () => ({})}
    })
    const pane = await openPane()
    await pane.getByRole('button', {name: 'Capture pixels'}).click()
    await expectLocator(page.getByText('Capture pixels needs a shared tab', {exact: false})).toBeVisible()
    expect((await call('design_diff', {})).capturePath).toBe(before.capturePath)
  })

  it('hides Capture pixels without Region Capture', async () => {
    await goto('/')
    await page.evaluate(() => {
      delete window.CropTarget
    })
    const pane = await openPane()
    await expectLocator(pane.getByRole('button', {name: 'Accept this run'})).toBeVisible()
    await expectLocator(pane.getByRole('button', {name: 'Capture pixels'})).toHaveCount(0)
  })
})

const OPINION_KINDS = ['inset-left', 'inset-right', 'inset-top', 'inset-bottom', 'gap-before', 'gap-after', 'align']
const TAKUMI_WASM = 'takumi_paint_wasm_bg.wasm'

describe('takumi', () => {
  it('webfont against u1-390 stores a takumi opinion beside the mirror value on geometry rows', async () => {
    await goto('webfont')
    await freshTarget('u1-390')
    const report = await call('design_diff', {limit: 50})
    expect(report.sources).toContain('takumi')
    const opinions = report.components
      .flatMap((c) => c.deltas)
      .filter((d) => OPINION_KINDS.includes(d.kind) && d.opinion !== undefined)
    expect(opinions.length).toBeGreaterThan(0)
    expect(opinions[0]?.opinion?.source).toBe('takumi')
    expect(opinions[0]?.opinion?.confidence).toBeGreaterThan(0.8)
    expect(opinions[0]?.opinion?.confidence).toBeLessThan(0.9)
  })

  it('container disables takumi and reports mirror only', async () => {
    await goto('container')
    await freshTarget('u1-390')
    const report = await call('design_diff', {})
    expect(report.sources).toEqual(['mirror'])
    expect(report.components.flatMap((c) => c.deltas).filter((d) => d.opinion !== undefined)).toEqual([])
  })

  it('a system font gives no opinion', async () => {
    await goto('target')
    await freshTarget('u1-390')
    const report = await call('design_diff', {})
    expect(report.sources).toEqual(['mirror'])
    expect(report.components.flatMap((c) => c.deltas).filter((d) => d.opinion !== undefined)).toEqual([])
  })

  it('the pane shows the takumi opinion on a webfont row', async () => {
    await goto('webfont')
    await freshTarget('u1-390')
    await call('design_diff', {limit: 50})
    const pane = await openPane()
    await expectLocator(pane.getByText(/^takumi /).first()).toBeVisible()
  })

  it('serves the takumi wasm and nothing else under its route', async () => {
    const wasm = await fetch(`${kit.apiBase}/api/ext/design/takumi/${TAKUMI_WASM}`)
    expect([wasm.status, wasm.headers.get('content-type')]).toEqual([200, 'application/wasm'])
    const script = await fetch(`${kit.apiBase}/api/ext/design/takumi/takumi.js`)
    const parent = await fetch(`${kit.apiBase}/api/ext/design/takumi/..%2Fpackage.json`)
    expect([script.status, parent.status]).toEqual([404, 404])
  })
})
