import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots} from '@conciv/e2e-utils/widget'
import type {HarnessApp} from '@conciv/e2e-utils/ports'

const expected: Record<HarnessApp, {model: string} | null> = {
  claude: {model: 'Opus 5.5'},
  codex: {model: 'gpt-5.3-codex'},
  'gemini-cli': {model: 'gemini-3-pro-preview'},
  opencode: {model: 'opencode/claude-sonnet-4-5'},
  pi: null,
}

const isHarnessName = (name: string): name is HarnessApp => Object.hasOwn(expected, name)

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const outcomePattern: Record<HarnessApp, RegExp> = {
  claude: /^Agent process exited with code 1$/m,
  codex:
    /^Reconnecting\.\.\. \d+\/\d+ \(unexpected status 401 Unauthorized: .*url: wss:\/\/api\.openai\.com\/v1\/responses/m,
  'gemini-cli': /^Gemini API key is missing or not configured\.$/m,
  opencode: /^Unexpected server error\. Check server logs for details\.$/m,
  pi: /^pi is not installed or not yet supported$/m,
}

test('full app boots with the configured harness and exposes its real model catalog', async ({page}, testInfo) => {
  const projectName = testInfo.project.name
  if (!isHarnessName(projectName)) throw new Error(`unexpected harness project ${projectName}`)
  const harness = expected[projectName]

  const failures = collectFailures(page)
  await page.goto('/', {waitUntil: 'domcontentloaded'})
  await expectWidgetBoots(page, failures)

  const modelPrompt = page.getByRole('button', {name: /^Model: /})
  const composerTextbox = page.getByRole('textbox', {name: 'Message the conciv agent'})
  if (harness) {
    const prompt = page.getByRole('button', {name: new RegExp(`^Model: ${escapeRegex(harness.model)}(,|$)`)})
    await expect(prompt).toBeVisible()
    await prompt.click()
    await expect(page.getByRole('menuitemradio', {name: harness.model, exact: true, checked: true})).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(composerTextbox).toBeVisible()
  } else {
    await expect(composerTextbox).toBeVisible()
    await expect(modelPrompt).toHaveCount(0)
  }
  expect(failures.pageErrors).toEqual([])
  expect(failures.consoleErrors).toEqual([])
  expect(failures.requestFailures).toEqual([])

  const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
  await input.fill('Reply with a short greeting')
  await input.press('Enter')
  const stop = page.getByRole('button', {name: 'Stop generating'})
  await expect(stop).toBeVisible({timeout: 20_000})
  await expect(stop).toBeHidden({timeout: 90_000})
  const errorAlert = page.getByRole('alert').filter({has: page.getByRole('button', {name: 'Retry'})})
  const reply = page.locator('[data-role="assistant"]').last()
  const outcome = ((await errorAlert.count()) > 0 ? await errorAlert.innerText() : await reply.innerText()).trim()
  testInfo.annotations.push({type: 'turn-outcome', description: `${projectName}: ${outcome}`})
  expect(outcome).not.toBe('')
  expect(outcome).toMatch(outcomePattern[projectName])
})
