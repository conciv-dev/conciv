import {expect, test, type Page} from '@playwright/test'
import {makeCallTool, resolveSession} from '../packed/engine-client.js'
import {
  DEV_PORT,
  ENGINE_PORT,
  SECOND_SENTINEL,
  buildProd,
  killPort,
  packedServerModule,
  prodConcivChunkHits,
  readGeneratedEntry,
  removeSecondExtension,
  setupFixture,
  startNext,
  stopNext,
  teardownFixture,
  waitFor,
  waitReady,
  writeSecondExtension,
  type Fixture,
  type NextHandle,
} from '../packed/harness.js'

const CLIENT_SENTINEL_ID = 'CONCIV_TANSTACK_CLIENT_SENTINEL'
const SERVER_ONLY_SYMBOLS = ['makeTanstackAdapter', 'readRouteManifest']
const SETUP_TIMEOUT = 6 * 60_000
const CELL_TIMEOUT = 12 * 60_000

test.describe.serial('folder-installed extension on packed Next 16.2 (turbopack + webpack)', () => {
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
    removeSecondExtension(fixture.appDir)
  })

  test.afterAll(() => {
    if (fixture !== undefined) teardownFixture(fixture)
  })

  async function openWidget(page: Page): Promise<void> {
    const launcher = page.getByRole('button', {name: 'Open conciv chat'})
    await launcher.waitFor({state: 'visible', timeout: 60_000})
    await launcher.click()
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({timeout: 60_000})
  }

  function chip(page: Page) {
    return page.getByRole('dialog', {name: 'conciv chat agent'}).getByText('TanStack', {exact: true})
  }

  async function gotoAndOpen(page: Page): Promise<void> {
    try {
      await page.goto(`http://localhost:${DEV_PORT}/`, {waitUntil: 'domcontentloaded', timeout: 60_000})
    } catch (error) {
      if (!String(error).includes('interrupted by another navigation')) throw error
      await page.goto(`http://localhost:${DEV_PORT}/`, {waitUntil: 'domcontentloaded', timeout: 60_000})
    }
    await openWidget(page)
  }

  async function restartFresh(webpack: boolean): Promise<void> {
    if (handle !== undefined) await stopNext(handle, ENGINE_PORT)
    await killPort(ENGINE_PORT)
    handle = startNext(fixture.appDir, {webpack, devPort: DEV_PORT})
    await waitReady(handle, ENGINE_PORT)
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

  async function assertLiveAddRemove(page: Page, webpack: boolean): Promise<void> {
    expect(await page.getByText(SECOND_SENTINEL).count()).toBe(0)
    writeSecondExtension(fixture.appDir)
    await waitFor(async () => readGeneratedEntry(fixture.appDir).includes('second'), 30_000)
    await restartFresh(webpack)
    await gotoAndOpen(page)
    await expect(page.getByText(SECOND_SENTINEL).first()).toBeVisible({timeout: 60_000})
    removeSecondExtension(fixture.appDir)
    await waitFor(async () => !readGeneratedEntry(fixture.appDir).includes('second'), 30_000)
    await restartFresh(webpack)
    await gotoAndOpen(page)
    await expect(chip(page)).toBeVisible()
    expect(await page.getByText(SECOND_SENTINEL).count()).toBe(0)
  }

  test('turbopack: renders the chip, degrades gracefully router-less, and lives through add/remove', async ({page}) => {
    test.setTimeout(CELL_TIMEOUT)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    handle = startNext(fixture.appDir, {webpack: false, devPort: DEV_PORT})
    await waitReady(handle, ENGINE_PORT)

    await gotoAndOpen(page)
    await expect(chip(page)).toBeVisible()
    expect(pageErrors).toEqual([])
    await expect(page.getByText(/Unhandled Runtime Error|Build Error|Failed to compile/i)).toHaveCount(0)

    const apiBase = `http://127.0.0.1:${ENGINE_PORT}`
    const callTool = makeCallTool(apiBase, await resolveSession(apiBase))
    await expect(callTool('tanstack_router_state', {})).rejects.toThrow(/TanStack router not found on page/)
    await expect(chip(page)).toBeVisible()
    expect(pageErrors).toEqual([])

    await assertLiveAddRemove(page, false)
  })

  test('turbopack: the dev client graph excludes the extension server module', async ({page}) => {
    test.setTimeout(CELL_TIMEOUT)
    handle = startNext(fixture.appDir, {webpack: false, devPort: DEV_PORT})
    await waitReady(handle, ENGINE_PORT)
    assertServerModuleAbsent(await fetchClientScripts(page))
  })

  test('webpack: renders the chip, keeps the server module out of the client graph, and lives through add/remove', async ({
    page,
  }) => {
    test.setTimeout(CELL_TIMEOUT)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    handle = startNext(fixture.appDir, {webpack: true, devPort: DEV_PORT})
    await waitReady(handle, ENGINE_PORT)

    assertServerModuleAbsent(await fetchClientScripts(page))
    expect(pageErrors).toEqual([])

    await assertLiveAddRemove(page, true)
  })

  test('turbopack build: the production "/" client graph is free of the conciv widget set (4a)', async () => {
    test.setTimeout(CELL_TIMEOUT)
    await buildProd(fixture.appDir)
    const markers = [
      'conciv picked',
      '@conciv/embed',
      'dedupeExtensions',
      'mountConciv',
      'extensions-client.gen',
      CLIENT_SENTINEL_ID,
      '__CONCIV_API_BASE__',
      'makeTanstackAdapter',
    ]
    expect(prodConcivChunkHits(fixture.appDir, markers)).toEqual([])
  })
})
