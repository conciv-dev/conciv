import {fileURLToPath} from 'node:url'
import {afterAll, beforeAll, describe, it} from 'vitest'
import {expect} from '@playwright/test'
import {getExtensionTestApi, type ExtensionTestApi} from '../src/get-extension-test-api.js'
import server from './fixtures/host-api/server.js'

const clientEntry = fileURLToPath(new URL('./fixtures/host-api/client.tsx', import.meta.url))

let api: ExtensionTestApi

beforeAll(async () => {
  api = await getExtensionTestApi({server, clientEntry})
}, 240000)

afterAll(async () => api.dispose())

describe('fake host implements the hook api', () => {
  it('mounts with slot and records chat calls', async () => {
    await expect(api.page.getByRole('button', {name: 'send chat'})).toBeVisible()
    await expect(api.page.locator('[data-slot]')).toHaveText('composer')
    await api.page.getByRole('button', {name: 'send chat'}).click()
    await expect(api.page.getByRole('log')).toContainText('send:hello-from-fixture')
  })

  it('writes through the extension table collection into the real state plane', async () => {
    await api.page.getByRole('button', {name: 'add note'}).click()
    await api.page.getByRole('button', {name: 'refresh'}).click()
    await expect(api.page.locator('[data-notes] li').first()).toHaveText('from-client')
  })
})
