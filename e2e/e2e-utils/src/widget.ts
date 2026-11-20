import {readFileSync, writeFileSync} from 'node:fs'
import {expect, test, type ConsoleMessage, type Page} from '@playwright/test'
import {magicLink, recordedEngineBase, trustedBrowserToken} from './login.js'
import {e2eConfigDir, e2eServerLog} from './config.js'

export type PageFailures = {
  pageErrors: string[]
  consoleErrors: string[]
  requestFailures: string[]
  thirdPartyRequests: string[]
}

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]']
const OUTDATED_OPTIMIZE_DEP = 'Outdated Optimize Dep'
const DUPLICATE_SOLID = 'You appear to have multiple instances of Solid'

function redactUrl(url: string): string {
  const parsed = URL.parse(url)
  if (parsed === null) return '<unparsable url>'
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return parsed.protocol
  return `${parsed.origin}${parsed.pathname}`
}

function describeConsoleMessage(message: ConsoleMessage): string {
  const {url} = message.location()
  return url === '' ? message.text() : `${message.text()} [${redactUrl(url)}]`
}

function isThirdPartyRequest(url: string): boolean {
  const parsed = URL.parse(url)
  if (parsed === null) return false
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  return !LOOPBACK_HOSTS.includes(parsed.hostname)
}

export function collectFailures(page: Page): PageFailures {
  const failures: PageFailures = {pageErrors: [], consoleErrors: [], requestFailures: [], thirdPartyRequests: []}
  page.on('pageerror', (error) => failures.pageErrors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error' || message.text().includes(DUPLICATE_SOLID)) {
      failures.consoleErrors.push(describeConsoleMessage(message))
    }
  })
  page.on('request', (request) => {
    if (isThirdPartyRequest(request.url())) failures.thirdPartyRequests.push(redactUrl(request.url()))
  })
  page.on('requestfailed', (request) => {
    failures.requestFailures.push(`${redactUrl(request.url())}: ${request.failure()?.errorText ?? 'unknown'}`)
  })
  page.on('response', (response) => {
    if (response.status() < 400) return
    const reason = response.statusText()
    if (response.status() === 504 && reason.includes(OUTDATED_OPTIMIZE_DEP)) return
    const described = reason === '' ? '' : ` ${reason}`
    failures.requestFailures.push(`${redactUrl(response.url())}: HTTP ${response.status()}${described}`)
  })
  return failures
}

function describeFailures(failures: PageFailures): string {
  return [
    ...failures.pageErrors.map((entry) => `pageerror: ${entry}`),
    ...failures.consoleErrors.map((entry) => `console: ${entry}`),
    ...failures.requestFailures.map((entry) => `request: ${entry}`),
    ...failures.thirdPartyRequests.map((entry) => `third-party request: ${entry}`),
  ].join('\n')
}

export async function expectWidgetBoots(page: Page, failures: PageFailures): Promise<void> {
  const launcher = page.getByRole('button', {name: /conciv chat$/})
  try {
    await expect(launcher).toBeVisible()
  } catch (error) {
    const detail = describeFailures(failures)
    throw detail === '' ? error : new Error(`widget did not boot\n${detail}`, {cause: error})
  }
  if ((await launcher.getAttribute('aria-expanded')) !== 'true') await launcher.click()
  await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
  const transientOptimizerReload = /Failed to fetch dynamically imported module|504 \(Outdated Optimize Dep\)/
  const detail = describeFailures(failures)
  expect(failures.thirdPartyRequests, detail).toEqual([])
  expect(
    failures.pageErrors.filter((entry) => !transientOptimizerReload.test(entry)),
    detail,
  ).toEqual([])
  expect(
    failures.consoleErrors.filter((entry) => !transientOptimizerReload.test(entry)),
    detail,
  ).toEqual([])
}

const RPC_SOCKET_PATH = '/rpc-ws'

async function engineOrigin(page: Page, path: string): Promise<string> {
  const rpcSocket = page.waitForEvent('websocket', (socket) => new URL(socket.url()).pathname === RPC_SOCKET_PATH)
  await page.goto(path, {waitUntil: 'domcontentloaded', timeout: 60_000})
  const url = new URL((await rpcSocket).url())
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
  return url.origin
}

async function pageEngine(page: Page, path: string, projectDir: string): Promise<{origin: string; base: string}> {
  const origin = await engineOrigin(page, path)
  return {origin, base: recordedEngineBase(projectDir, origin)}
}

export async function loginWidget(page: Page, path = '/', projectDir = process.cwd()): Promise<void> {
  const {base} = await pageEngine(page, path, projectDir)
  const link = await magicLink(base, page.url())
  await page.goto('about:blank')
  await page.goto(link, {waitUntil: 'domcontentloaded', timeout: 60_000})
  await expect(page.getByRole('button', {name: /conciv chat$/})).toBeVisible()
}

export async function trustedEngineBase(page: Page, path = '/', projectDir = process.cwd()): Promise<string> {
  const {origin, base} = await pageEngine(page, path, projectDir)
  return `${origin}/t/${await trustedBrowserToken(base)}`
}

const PRINTED_CODE = /#conciv_otp=(\d{6})/g

function printedCodes(logPath: string): string[] {
  return [...readFileSync(logPath, 'utf8').matchAll(PRINTED_CODE)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  )
}

export async function openLoginFromLockedLauncher(page: Page, path = '/'): Promise<string> {
  await engineOrigin(page, path)
  const logPath = e2eServerLog(e2eConfigDir(test.info().config.configFile), Number(new URL(page.url()).port))
  const seen = printedCodes(logPath).length
  await page.getByRole('button', {name: 'Unauthorized. Authorize conciv'}).click()
  await expect(page.getByRole('dialog', {name: 'Authorize conciv'})).toBeVisible()
  await expect.poll(() => printedCodes(logPath).length).toBeGreaterThan(seen)
  return printedCodes(logPath).at(-1) ?? ''
}

export async function expectPluginBundleReloadsInPlace(
  page: Page,
  failures: PageFailures,
  bundlePath: string,
): Promise<void> {
  const launcher = page.getByRole('button', {name: /conciv chat$/})
  await expect(launcher).toBeVisible()
  if ((await launcher.getAttribute('aria-expanded')) !== 'true') await launcher.click()
  await page.getByRole('tab', {name: 'Chat'}).click()
  await expectWidgetBoots(page, failures)
  const original = readFileSync(bundlePath, 'utf8')
  const draft = 'a draft the reload keeps'
  const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
  try {
    await expect(page.getByText('live line first')).toBeVisible()
    await composer.click()
    await composer.pressSequentially(draft)
    await expect(composer).toHaveText(draft)
    await page.evaluate(() => Reflect.set(globalThis, 'concivLiveEditMarker', 'kept'))
    writeFileSync(bundlePath, original.replace('live line first', 'live line second'))
    await expect(page.getByText('live line second')).toBeVisible()
    await expect(page.getByText('live line first')).toHaveCount(0)
    await expect(composer).toHaveText(draft)
    expect(await page.evaluate(() => Reflect.get(globalThis, 'concivLiveEditMarker'))).toBe('kept')
  } finally {
    writeFileSync(bundlePath, original)
  }
}
