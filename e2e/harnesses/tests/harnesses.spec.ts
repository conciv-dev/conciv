import {spawnSync} from 'node:child_process'
import {join} from 'node:path'
import {expect, test} from '@playwright/test'
import {harnessHome} from '@conciv/e2e-utils/config'
import {collectFailures, expectWidgetBoots, loginWidget, trustedEngineBase} from '@conciv/e2e-utils/widget'
import type {HarnessApp} from '@conciv/e2e-utils/ports'

type ExpectedModel = {model: string; usable?: false}

const expected: Record<HarnessApp, ExpectedModel | {harness: string}> = {
  claude: {model: 'Opus 5.5'},
  codex: {model: 'gpt-5.3-codex'},
  'gemini-cli': {model: 'gemini-3-pro-preview'},
  opencode: {model: 'opencode/claude-sonnet-4-5', usable: false},
  pi: {harness: 'Pi'},
}

const isHarnessName = (name: string): name is HarnessApp => Object.hasOwn(expected, name)

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const modelName = (harness: ExpectedModel): string => `${escapeRegex(harness.model)}( \\([^)]+\\))?`

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
  await loginWidget(page)
  await expectWidgetBoots(page, failures)

  const composerTextbox = page.getByRole('textbox', {name: 'Message the conciv agent'})
  const search = page.getByRole('textbox', {name: 'Search models'})
  if ('harness' in harness) {
    const prompt = page.getByRole('button', {name: `Model: ${harness.harness}`, exact: true})
    await expect(prompt).toBeVisible()
    await prompt.click()
    await expect(search).toBeFocused()
    await expect(page.getByText(`${harness.harness} has no usable models`)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(composerTextbox).toBeFocused()
  } else {
    const prompt = page.getByRole('button', {name: new RegExp(`^Model: ${modelName(harness)}(,|$)`)})
    await expect(prompt).toBeVisible()
    await prompt.click()
    await expect(search).toBeFocused()
    if (harness.usable === false) {
      await expect(page.getByRole('option', {selected: true})).toHaveCount(0)
      await expect(
        page
          .getByRole('group', {name: /^(OpenCode|Model)$/})
          .getByRole('option')
          .first(),
      ).toBeVisible()
    } else {
      await expect(page.getByRole('option', {name: new RegExp(`^${modelName(harness)}`), selected: true})).toBeVisible()
    }
    await page.keyboard.press('Escape')
    await expect(composerTextbox).toBeFocused()
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

const hubCheck: Record<HarnessApp, string[]> = {
  claude: ['claude', 'mcp', 'get', 'conciv-hub'],
  codex: ['codex', 'mcp', 'get', 'conciv-hub'],
  'gemini-cli': ['gemini', 'mcp', 'list'],
  opencode: ['opencode', 'mcp', 'list'],
  pi: [],
}

test('connect hub registers conciv-hub in the harness CLI config', async ({page}, testInfo) => {
  const projectName = testInfo.project.name
  if (!isHarnessName(projectName)) throw new Error(`unexpected harness project ${projectName}`)
  const base = await trustedEngineBase(page)
  const connected = await fetch(`${base}/rpc/meta/connectHub`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({json: {harness: projectName}}),
  })
  const [bin, ...args] = hubCheck[projectName]
  if (bin === undefined) {
    expect(await connected.json()).toEqual({
      json: {ok: false, message: `${projectName} cannot connect to the conciv hub`},
    })
    return
  }
  expect(await connected.json()).toEqual({json: {ok: true}})

  const home = harnessHome(projectName)
  const env = {...process.env, HOME: home, CODEX_HOME: join(home, '.codex')}
  const run = spawnSync(bin, args, {env, encoding: 'utf8', timeout: 60_000})
  expect(run.status).toBe(0)
  const listed = `${run.stdout}${run.stderr}`
  expect(listed).toContain('conciv-hub')
  expect(listed).toContain('@conciv/cli@')
})
