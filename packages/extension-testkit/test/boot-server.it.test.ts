import {expect, test} from 'vitest'
import {makeRpcClient} from '@conciv/harness-testkit'
import ping from './fixtures/ping/server.js'
import {bootExtensionServer} from '../src/boot-server.js'

test('boots a real extension server reachable over HTTP', async () => {
  const {apiBase, stop} = await bootExtensionServer(ping)
  try {
    const models = await makeRpcClient(apiBase).meta.models()
    expect(models.harness.id.length).toBeGreaterThan(0)
  } finally {
    await stop()
  }
})
