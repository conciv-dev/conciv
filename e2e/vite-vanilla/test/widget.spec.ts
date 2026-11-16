import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {expect, test} from '@playwright/test'
import {e2eConfigDir, e2eServerLog, harnessHome} from '@conciv/e2e-utils/config'
import {collectFailures, expectWidgetBoots, loginWidget} from '@conciv/e2e-utils/widget'

test('widget boots from dist in a vanilla vite app', async ({page}) => {
  const failures = collectFailures(page)
  await loginWidget(page)
  await expectWidgetBoots(page, failures)
})

test('files a harness writes into its e2e home do not reload the page', async ({page}) => {
  const configDir = e2eConfigDir(test.info().config.configFile)
  const clone = join(harnessHome(configDir, 'codex'), '.codex', '.tmp', 'plugins-clone', 'plugin')
  const probe = join(configDir, '.conciv', 'reload-probe')
  await page.goto('/', {waitUntil: 'domcontentloaded'})
  await page.getByRole('button', {name: 'Count is 0'}).click()
  await expect(page.getByRole('button', {name: 'Count is 1'})).toBeVisible()
  try {
    mkdirSync(clone, {recursive: true})
    writeFileSync(join(clone, 'tsconfig.json'), '{}')
    writeFileSync(join(clone, 'index.html'), '<!doctype html>')
    mkdirSync(probe, {recursive: true})
    writeFileSync(join(probe, 'index.html'), '<!doctype html>')
    const logPath = e2eServerLog(configDir, Number(new URL(page.url()).port))
    await expect.poll(() => readFileSync(logPath, 'utf8')).toContain('.conciv/reload-probe/index.html')
    await page.getByRole('button', {name: 'Count is 1'}).click()
    await expect(page.getByRole('button', {name: 'Count is 2'})).toBeVisible()
  } finally {
    rmSync(probe, {recursive: true, force: true})
    rmSync(harnessHome(configDir, 'codex'), {recursive: true, force: true})
  }
})
