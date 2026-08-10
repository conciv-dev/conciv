import {describe, expect, it} from 'vitest'
import {failRpcCalls} from '@conciv/extension-testkit/rpc-fault'
import {setupWsProbeSuite} from './helpers/probe-suite.js'

const suite = setupWsProbeSuite()

describe('rpc fault injection reaches calls that ride the websocket', () => {
  it('fails only the targeted procedure and lets it recover after repair', async () => {
    const page = await suite.browser().newPage()
    try {
      const models = await failRpcCalls(page, {path: ['meta', 'models']})
      await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
      await page.evaluate((wsUrl) => window.__CONCIV_WS_PROBE__.connect(wsUrl), suite.socketUrl())

      const failed = await page.evaluate(async () => {
        try {
          await window.__CONCIV_WS_PROBE__.call(['meta', 'models'], undefined)
          return 'answered'
        } catch (error) {
          return `failed: ${error instanceof Error ? error.message : String(error)}`
        }
      })
      expect(failed).toContain('failed:')

      const untouched = await page.evaluate(() => window.__CONCIV_WS_PROBE__.call(['meta', 'tools'], undefined))
      expect(JSON.stringify(untouched)).toContain('tools')

      models.repair()
      const repaired = await page.evaluate(() => window.__CONCIV_WS_PROBE__.call(['meta', 'models'], undefined))
      expect(JSON.stringify(repaired)).toContain('models')
    } finally {
      await page.close()
    }
  })
})
