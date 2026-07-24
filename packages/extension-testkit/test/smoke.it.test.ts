import {fileURLToPath} from 'node:url'
import {test} from 'vitest'
import {expect} from '@playwright/test'
import pingServer from './fixtures/ping/server.js'
import {fixtureHost, getExtensionTestApi} from '../src/get-extension-test-api.js'

const clientEntry = fileURLToPath(new URL('./fixtures/ping/client.tsx', import.meta.url))

test('mounts an extension, drives its real UI, grabs a source-mapped element, and calls a tool', async () => {
  const api = await getExtensionTestApi({server: pingServer, host: fixtureHost(clientEntry)})
  try {
    await api.page.getByRole('button', {name: 'Ping'}).click()
    await expect(api.page.getByText('Pinged')).toBeVisible()

    await api.page.getByRole('button', {name: 'Pick an element'}).click()
    await api.page.getByRole('button', {name: 'Comment target'}).click()
    await expect(api.page.getByText(/Picked: .*fixture-element/)).toBeVisible()

    const echo = await api.callTool('ping.echo', {text: 'mcp-ok'})
    expect(JSON.stringify(echo)).toContain('mcp-ok')
  } finally {
    await api.dispose()
  }
})
