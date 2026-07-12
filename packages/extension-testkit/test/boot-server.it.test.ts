import {expect, test} from 'vitest'
import {createFakeHarness, makeRpcClient} from '@conciv/harness-testkit'
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

test('boots with an injected harness that is not in the registry', async () => {
  const harness = createFakeHarness({id: 'fake-ext-boot', text: 'ok'})
  const {apiBase, stop} = await bootExtensionServer(ping, {harness})
  try {
    const models = await makeRpcClient(apiBase).meta.models()
    expect(models.harness.id).toBe('fake-ext-boot')
  } finally {
    await stop()
  }
})
