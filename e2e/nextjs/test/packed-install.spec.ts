import {readdirSync} from 'node:fs'
import {join} from 'node:path'
import {expect, test, type Page} from '@playwright/test'
import {z} from 'zod'
import {loginWidget} from '@conciv/e2e-utils/widget'
import {
  DEV_PORT,
  agentApiBase,
  ENGINE_PORT,
  SECOND_PLUGIN_LINE,
  buildProd,
  killPort,
  packedServerModule,
  prodConcivChunkHits,
  removeSecondPlugin,
  setupFixture,
  startNext,
  stopNext,
  teardownFixture,
  waitReady,
  writeSecondPlugin,
  type Fixture,
  type NextHandle,
} from '../packed/harness.js'

const ReplySchema = z.object({
  content: z.array(z.object({text: z.string()}).loose()),
  isError: z.boolean().optional(),
})

type CallTool = (name: string, input: unknown) => Promise<unknown>

async function resolveSession(apiBase: string): Promise<string> {
  const {makeRpcClient} = await import('@conciv/contract')
  const client = makeRpcClient(apiBase)
  const {sessionId} = await client.sessions.resolve({})
  return sessionId
}

function makeCallTool(apiBase: string, session: string): CallTool {
  return async (name, input) => {
    const [{Client}, {StreamableHTTPClientTransport}, {CONCIV_SESSION_HEADER}] = await Promise.all([
      import('@modelcontextprotocol/sdk/client/index.js'),
      import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
      import('@conciv/protocol/chat-types'),
    ])
    const mcp = new Client({name: 'conciv-e2e', version: '0.0.0'})
    await mcp.connect(
      new StreamableHTTPClientTransport(new URL(`${apiBase}/api/mcp`), {
        requestInit: {headers: {[CONCIV_SESSION_HEADER]: session}},
      }),
    )
    try {
      const typescriptCode = `return await external_${name}(${JSON.stringify(input ?? {})})`
      const reply = ReplySchema.parse(await mcp.callTool({name: 'execute_typescript', arguments: {typescriptCode}}))
      const raw = reply.content.map((part) => part.text).join('\n')
      if (reply.isError === true) throw new Error(raw)
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null && 'result' in parsed) return parsed.result
      return parsed
    } finally {
      await mcp.close()
    }
  }
}

const CLIENT_SENTINEL_ID = 'TanStack inspector active'
const SERVER_ONLY_SYMBOLS = ['readRouteManifest', 'tanstack.routeManifest.read']
const SETUP_TIMEOUT = 6 * 60_000
const CELL_TIMEOUT = 12 * 60_000

test.describe
  .serial('installed TanStack plugin and a second project plugin on packed Next 16.2 (turbopack + webpack)', () => {
  let fixture: Fixture
  let handle: NextHandle | undefined

  test.beforeAll(async () => {
    test.setTimeout(SETUP_TIMEOUT)
    fixture = await setupFixture()
  })

  test.afterEach(async () => {
    if (handle !== undefined) await stopNext(handle, ENGINE_PORT)
    handle = undefined
    await killPort(ENGINE_PORT)
    removeSecondPlugin(fixture.appDir)
  })

  test.afterAll(() => {
    if (fixture !== undefined) teardownFixture(fixture)
  })

  function chip(page: Page) {
    return page
      .getByRole('dialog', {name: 'conciv chat agent'})
      .getByRole('status', {name: 'TanStack inspector active'})
  }

  async function gotoAndOpen(page: Page): Promise<void> {
    if (handle === undefined) throw new Error('next dev is not running')
    await loginWidget(page, `http://localhost:${DEV_PORT}/`, handle.appDir)
    await page.getByRole('button', {name: 'Open conciv chat'}).click()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({timeout: 60_000})
  }

  async function fetchClientScripts(page: Page): Promise<string> {
    const urls = new Set<string>()
    page.on('response', (response) => {
      const url = response.url()
      if (url.endsWith('.js') || url.includes('.js?')) urls.add(url)
    })
    await gotoAndOpen(page)
    await expect(chip(page)).toBeVisible()
    await page.waitForTimeout(2000)
    const bodies = await Promise.all([...urls].map(async (url) => (await page.request.get(url)).text()))
    return bodies.join('\n')
  }

  function assertServerModuleAbsent(clientScripts: string): void {
    const serverModule = packedServerModule(fixture)
    for (const symbol of SERVER_ONLY_SYMBOLS) {
      expect(serverModule).toContain(symbol)
      expect(clientScripts).not.toContain(symbol)
    }
  }

  async function assertLiveAddRemove(page: Page): Promise<void> {
    const loads: string[] = []
    page.on('load', () => loads.push(page.url()))
    const secondLine = page.getByText(SECOND_PLUGIN_LINE)
    await expect(secondLine).toHaveCount(0)
    writeSecondPlugin(fixture.appDir)
    await expect(secondLine).toBeVisible({timeout: 60_000})
    await expect(chip(page)).toBeVisible()
    removeSecondPlugin(fixture.appDir)
    await expect(secondLine).toHaveCount(0, {timeout: 60_000})
    await expect(chip(page)).toBeVisible()
    expect(loads).toEqual([])
  }

  test('the packed install resolves one @tanstack/ai-sandbox, so SandboxCapability stays single (#107)', () => {
    const copies = readdirSync(join(fixture.root, 'node_modules/.pnpm')).filter((entry) =>
      entry.startsWith('@tanstack+ai-sandbox@'),
    )
    expect(copies).toHaveLength(1)
  })

  test('turbopack: renders the chip, degrades gracefully without a TanStack app, and adds and removes a second plugin live', async ({
    page,
  }) => {
    test.setTimeout(CELL_TIMEOUT)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    handle = startNext(fixture.appDir, {webpack: false, devPort: DEV_PORT})
    await waitReady(handle, ENGINE_PORT)

    await gotoAndOpen(page)
    await expect(chip(page)).toBeVisible()
    expect(pageErrors).toEqual([])
    await expect(page.getByText(/Unhandled Runtime Error|Build Error|Failed to compile/i)).toHaveCount(0)

    const apiBase = agentApiBase(fixture.appDir)
    const callTool = makeCallTool(apiBase, await resolveSession(apiBase))
    await expect(callTool('tanstack_route_manifest', {})).rejects.toThrow(/routeTree\.gen\.ts/)
    await expect(chip(page)).toBeVisible()
    expect(pageErrors).toEqual([])

    await assertLiveAddRemove(page)
    expect(pageErrors).toEqual([])
  })

  test('turbopack: the dev client graph excludes the plugin engine module', async ({page}) => {
    test.setTimeout(CELL_TIMEOUT)
    handle = startNext(fixture.appDir, {webpack: false, devPort: DEV_PORT})
    await waitReady(handle, ENGINE_PORT)
    assertServerModuleAbsent(await fetchClientScripts(page))
  })

  test('webpack: renders the chip, keeps the server module out of the client graph, and adds and removes a second plugin live', async ({
    page,
  }) => {
    test.setTimeout(CELL_TIMEOUT)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    handle = startNext(fixture.appDir, {webpack: true, devPort: DEV_PORT})
    await waitReady(handle, ENGINE_PORT)

    assertServerModuleAbsent(await fetchClientScripts(page))
    expect(pageErrors).toEqual([])

    await assertLiveAddRemove(page)
    expect(pageErrors).toEqual([])
  })

  test('webpack: the engine boots when the dev watcher reports instrumentation.ts after the server prepared', async () => {
    test.setTimeout(CELL_TIMEOUT)
    handle = startNext(fixture.appDir, {webpack: true, devPort: DEV_PORT, instrumentationStatDelayMs: 1000})
    await waitReady(handle, ENGINE_PORT)
  })

  test('turbopack build: the production "/" client graph is free of the conciv widget set (4a)', async () => {
    test.setTimeout(CELL_TIMEOUT)
    await buildProd(fixture.appDir)
    const markers = [
      'conciv picked',
      '@conciv/embed',
      'mountConciv',
      '[conciv] widget failed to start',
      CLIENT_SENTINEL_ID,
      '__CONCIV_API_BASE__',
      'readRouteManifest',
    ]
    expect(prodConcivChunkHits(fixture.appDir, markers)).toEqual([])
  })
})
