import {createServer} from 'node:http'
import {fileURLToPath} from 'node:url'
import {afterAll, describe, expect, it, test} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {defineExtension} from '@conciv/extension'
import {fixtureHost, getExtensionTestApi} from '@conciv/extension-testkit'
import {probeCore} from '../src/shared/probe.js'

describe('connect pane lna', () => {
  const hostDist = fileURLToPath(new URL('../dist/test-host', import.meta.url))
  const permissionStub = fileURLToPath(new URL('./fixture/local-network-access-stub.js', import.meta.url))

  const WAITING_COPY = 'Waiting for your agent…'
  const BLOCKED_STEP_COPY =
    'Local network access was blocked. Click the site icon in the address bar, allow local network access, and reload.'
  const BLOCKED_STATUS_COPY = "Local network access is blocked, so your agent can't reach this tab."

  test('a denied local-network-access permission replaces the waiting copy, and granting it restores the wait', async () => {
    const api = await getExtensionTestApi({
      server: defineExtension({name: 'try-it-connect-fixture'}),
      host: fixtureHost(hostDist),
    })
    try {
      const {page} = api
      await expectLocator(page.getByText(WAITING_COPY)).toBeVisible({timeout: 20_000})
      await expectLocator(page.getByRole('alert')).toHaveCount(0, {timeout: 10_000})

      await page.addInitScript({path: permissionStub})
      await page.reload({waitUntil: 'domcontentloaded'})
      await expectLocator(page.getByRole('alert')).toHaveText(BLOCKED_STEP_COPY, {timeout: 20_000})
      await expectLocator(page.getByText(BLOCKED_STATUS_COPY)).toBeVisible({timeout: 10_000})
      await expectLocator(page.getByText(WAITING_COPY)).toHaveCount(0, {timeout: 10_000})

      await page.evaluate(() =>
        document.dispatchEvent(new CustomEvent('local-network-access-state', {detail: 'granted'})),
      )
      await expectLocator(page.getByText(WAITING_COPY)).toBeVisible({timeout: 20_000})
      await expectLocator(page.getByRole('alert')).toHaveCount(0, {timeout: 10_000})
    } finally {
      await api.dispose()
    }
  }, 180_000)
})

describe('probe', () => {
  const servers: Array<() => void> = []
  afterAll(() => servers.forEach((close) => close()))

  function serveHealth(token: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer((request, response) => {
        if (request.url === `/t/${token}/health`) {
          response.writeHead(200)
          response.end('ok')
          return
        }
        response.writeHead(404)
        response.end()
      })
      servers.push(() => server.close())
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address === null || typeof address === 'string') {
          reject(new Error('server has no port'))
          return
        }
        resolve(address.port)
      })
    })
  }

  describe('probeCore', () => {
    it('finds a token-gated core on any candidate port', async () => {
      const otherPort = await serveHealth('tok-other')
      const tokPort = await serveHealth('tok-p')
      expect(await probeCore('tok-p', [otherPort, tokPort])).toBe(`http://127.0.0.1:${tokPort}/t/tok-p`)
    })
    it('resolves null when nothing answers', async () => {
      const otherPort = await serveHealth('tok-other')
      expect(await probeCore('tok-none', [otherPort])).toBe(null)
    })
  })
})
