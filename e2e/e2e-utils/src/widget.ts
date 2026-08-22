import {expect, type ConsoleMessage, type Page} from '@playwright/test'

export type PageFailures = {
  pageErrors: string[]
  consoleErrors: string[]
  requestFailures: string[]
  thirdPartyRequests: string[]
}

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]']
const OUTDATED_OPTIMIZE_DEP = 'Outdated Optimize Dep'

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
    if (message.type() === 'error') failures.consoleErrors.push(describeConsoleMessage(message))
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
