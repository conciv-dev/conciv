import {expect, test} from 'vitest'
import terminal from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'
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
  await expect.poll(() => page.getByText('P>').first().isVisible(), {timeout: 20_000}).toBe(true)
}

test('a remounted terminal view replays the pty output it left behind', async () => {
  const api = await getExtensionTestApi({
    server: terminal,
    clientEntry: '@conciv/extension-terminal/client',
    harness: createFakeHarness({id: 'fake-terminal', text: 'ok', tty: bashTty}),
  })
  try {
    const {page} = api
    await openTerminalView(page)
    await page.keyboard.type('echo reload-marker-$((40+2))')
    await page.keyboard.press('Enter')
    await expect.poll(() => page.getByText('reload-marker-42').first().isVisible(), {timeout: 10_000}).toBe(true)

    await page.reload({waitUntil: 'domcontentloaded'})
    await openTerminalView(page)
    await expect.poll(() => page.getByText('reload-marker-42').first().isVisible(), {timeout: 20_000}).toBe(true)
  } finally {
    await api.dispose()
  }
}, 90_000)
