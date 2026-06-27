import {expect, test} from 'vitest'
import ping from './fixtures/ping/server.js'
import {bootExtensionServer} from '../src/boot-server.js'

test('boots a real extension server reachable over HTTP', async () => {
  const {apiBase, stop} = await bootExtensionServer(ping)
  try {
    const res = await fetch(`${apiBase}/api/chat/models`)
    expect(res.ok).toBe(true)
  } finally {
    await stop()
  }
})
