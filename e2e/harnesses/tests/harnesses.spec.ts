import {expect, test} from '@playwright/test'
import {collectFailures, expectWidgetBoots} from '@conciv/e2e-utils/widget'

const expected = {
  claude: {model: 'Claude Sonnet 4.6', group: 'Claude'},
  codex: {model: 'gpt-5.5', group: 'Codex'},
  'gemini-cli': {model: 'gemini-3-pro-preview', group: 'Gemini'},
  opencode: {model: 'opencode/claude-sonnet-4-5', group: 'OpenCode'},
  pi: null,
} as const

test('full app boots with the configured harness and exposes its real model catalog', async ({page}, testInfo) => {
  const harness = expected[testInfo.project.name as keyof typeof expected]
  expect(testInfo.project.name in expected, `unexpected harness project ${testInfo.project.name}`).toBe(true)

  const failures = collectFailures(page)
  await page.goto('/', {waitUntil: 'domcontentloaded'})
  await expectWidgetBoots(page, failures)

  const modelSelector = page.getByRole('button', {name: 'Select model'})
  if (harness) {
    await expect(modelSelector).toContainText(harness.model)
    await modelSelector.click()
    await expect(page.getByText(harness.group, {exact: true})).toBeVisible()
    await expect(page.getByText(harness.model, {exact: true}).first()).toBeVisible()
  } else {
    await expect(modelSelector).toHaveCount(0)
  }
  expect(failures.requestFailures).toEqual([])
})
