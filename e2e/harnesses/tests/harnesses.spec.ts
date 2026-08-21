import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots} from '@conciv/e2e-utils/widget'
import type {HarnessApp} from '@conciv/e2e-utils/ports'

const expected: Record<HarnessApp, {model: string; group: string} | null> = {
  claude: {model: 'Claude Sonnet 4.6', group: 'Claude'},
  codex: {model: 'gpt-5.5', group: 'Codex'},
  'gemini-cli': {model: 'gemini-3-pro-preview', group: 'Gemini'},
  opencode: {model: 'opencode/claude-sonnet-4-5', group: 'OpenCode'},
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

  const moreActions = page.getByRole('button', {name: 'More composer actions'})
  const modelMenuItems = page.getByRole('menuitem', {name: /^Model: /})
  const composerTextbox = page.getByRole('textbox', {name: 'Message the conciv agent'})
  if (harness) {
    await moreActions.click()
    const selectedModelMenuItem = page.getByRole('menuitem', {
      name: new RegExp(`^Model: ${escapeRegex(harness.model)}`),
    })
    await expect(selectedModelMenuItem).toBeVisible()
    await expect(modelMenuItems.first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(composerTextbox).toBeVisible()
  } else {
    await moreActions.click()
    await expect(modelMenuItems).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(composerTextbox).toBeVisible()
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
