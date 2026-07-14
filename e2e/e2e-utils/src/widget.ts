import {expect, type Page} from '@playwright/test'

export type PageFailures = {pageErrors: string[]; consoleErrors: string[]; requestFailures: string[]}

export function collectFailures(page: Page): PageFailures {
  const failures: PageFailures = {pageErrors: [], consoleErrors: [], requestFailures: []}
  page.on('pageerror', (error) => failures.pageErrors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') failures.consoleErrors.push(message.text())
  })
  page.on('requestfailed', (request) => {
    failures.requestFailures.push(`${request.url()}: ${request.failure()?.errorText ?? 'unknown'}`)
  })
  return failures
}

function describeFailures(failures: PageFailures): string {
  return [
    ...failures.pageErrors.map((entry) => `pageerror: ${entry}`),
    ...failures.consoleErrors.map((entry) => `console: ${entry}`),
    ...failures.requestFailures.map((entry) => `request: ${entry}`),
  ].join('\n')
}

export async function expectWidgetBoots(page: Page, failures: PageFailures): Promise<void> {
  const launcher = page.getByRole('button', {name: 'Open conciv chat'})
  try {
    await expect(launcher).toBeVisible({timeout: 20_000})
  } catch (error) {
    const detail = describeFailures(failures)
    throw detail === '' ? error : new Error(`widget did not boot\n${detail}`, {cause: error})
  }
  await launcher.click()
  await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({timeout: 20_000})
  expect(failures.pageErrors).toEqual([])
  expect(failures.consoleErrors).toEqual([])
}
