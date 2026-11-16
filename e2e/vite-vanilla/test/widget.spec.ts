import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {expect, test} from '@playwright/test'
import {e2eConfigDir, harnessHome} from '@conciv/e2e-utils/config'
import {collectFailures, expectWidgetBoots, loginWidget} from '@conciv/e2e-utils/widget'

test('widget boots from dist in a vanilla vite app', async ({page}) => {
  const failures = collectFailures(page)
  await loginWidget(page)
  await expectWidgetBoots(page, failures)
})

test('files a harness writes into its e2e home do not reload the page', async ({page}) => {
  const configDir = e2eConfigDir(test.info().config.configFile)
  const clone = join(harnessHome(configDir, 'codex'), '.codex', '.tmp', 'plugins-clone', 'plugin')
  const probeName = `reload-probe-${test.info().testId}`
  const probe = join(configDir, '.conciv', probeName)
  const probeReload = JSON.stringify({type: 'full-reload', path: `/.conciv/${probeName}/index.html`})
  const hmrSocket = page.waitForEvent('websocket', (socket) => {
    const url = new URL(socket.url())
    return url.pathname === '/' && url.searchParams.has('token')
  })
  await page.goto('/', {waitUntil: 'domcontentloaded'})
  const socket = await hmrSocket
  await page.getByRole('button', {name: 'Count is 0'}).click()
  await expect(page.getByRole('button', {name: 'Count is 1'})).toBeVisible()
  try {
    const probeAnnounced = socket.waitForEvent('framereceived', {
      predicate: (frame) => String(frame.payload) === probeReload,
    })
    mkdirSync(clone, {recursive: true})
    writeFileSync(join(clone, 'tsconfig.json'), '{}')
    writeFileSync(join(clone, 'index.html'), '<!doctype html>')
    mkdirSync(probe, {recursive: true})
    writeFileSync(join(probe, 'index.html'), '<!doctype html>')
    await probeAnnounced
    await page.getByRole('button', {name: 'Count is 1'}).click()
    await expect(page.getByRole('button', {name: 'Count is 2'})).toBeVisible()
  } finally {
    rmSync(probe, {recursive: true, force: true})
    rmSync(harnessHome(configDir, 'codex'), {recursive: true, force: true})
  }
})
