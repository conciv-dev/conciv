import {fileURLToPath} from 'node:url'
import {test} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import terminal from '../src/server.js'
import {fixtureHost, getExtensionTestApi} from '@conciv/extension-testkit'
import {createFakeHarness} from '@conciv/harness-testkit'
import type {Page} from 'playwright'

const bashTty = {
  command: () => ({
    bin: 'bash',
    args: ['--noprofile', '--norc', '-i'],
    env: {TERM: 'xterm-256color', PS1: 'P> '},
  }),
}

async function openTerminalView(page: Page): Promise<void> {
  await page.getByRole('tab', {name: 'Terminal'}).click()
  await expectLocator(page.getByText('P>').first()).toBeVisible({timeout: 30_000})
}

test('a remounted terminal view replays the pty output it left behind', async () => {
  const api = await getExtensionTestApi({
    server: terminal,
    host: fixtureHost(fileURLToPath(new URL('../dist/test-host', import.meta.url))),
    harness: createFakeHarness({id: 'fake-terminal', text: 'ok', tty: bashTty}),
  })
  try {
    const {page} = api
    await openTerminalView(page)
    await page.keyboard.type('echo reload-marker-$((40+2))')
    await page.keyboard.press('Enter')
    await expectLocator(page.getByText('reload-marker-42').first()).toBeVisible({timeout: 30_000})

    await page.reload({waitUntil: 'domcontentloaded'})
    await openTerminalView(page)
    await expectLocator(page.getByText('reload-marker-42').first()).toBeVisible({timeout: 30_000})
  } finally {
    await api.dispose()
  }
}, 90_000)
