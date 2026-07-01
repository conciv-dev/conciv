import {expect, test} from 'vitest'
import ping from './fixtures/ping/server.js'
import {bootExtensionServer} from '../src/boot-server.js'
import {resolveSession} from '../src/session.js'

test('resolves a real conciv session id', async () => {
  const {apiBase, stop} = await bootExtensionServer(ping)
  try {
    const session = await resolveSession(apiBase)
    expect(session).toMatch(/^conciv_/)
  } finally {
    await stop()
  }
})
