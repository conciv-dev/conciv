import {readFileSync} from 'node:fs'
import {expect, type ConsoleMessage, type Page} from '@playwright/test'
import {loginThroughTerminal} from '@conciv/harness-testkit/login'
import {e2eServerLog} from './config.js'

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

const PRINTED_CODE = /#conciv_otp=(\d{6})/g

function printedCodes(logPath: string): string[] {
  const text = readFileSync(logPath, 'utf8')
  return [...text.matchAll(PRINTED_CODE)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
}

export async function trustedApiBase(origin: string, logPath: string): Promise<string> {
  return `${origin}/t/${await loginThroughTerminal(origin, () => readFileSync(logPath, 'utf8'))}`
}

export async function loginWidget(page: Page, path = '/', serverLog?: string): Promise<void> {
  await page.goto(path, {waitUntil: 'domcontentloaded', timeout: 60_000})
  const logPath = serverLog ?? e2eServerLog(Number(new URL(page.url()).port))
  const seen = printedCodes(logPath).length
  await page.getByRole('button', {name: 'Authorize conciv'}).click()
  const dialog = page.getByRole('dialog', {name: 'Authorize conciv'})
  await dialog.getByRole('button', {name: 'Send a new code'}).click()
  await expect(dialog.getByRole('status')).toHaveText('A new code was printed in your terminal.')
  await expect.poll(() => printedCodes(logPath).length).toBeGreaterThan(seen)
  const code = printedCodes(logPath).at(-1)
  if (code === undefined) throw new Error(`the dev server printed no login code into ${logPath}`)
  await dialog.getByRole('textbox', {name: 'Digit 1 of 6'}).pressSequentially(code)
  await expect(dialog).toBeHidden()
}
