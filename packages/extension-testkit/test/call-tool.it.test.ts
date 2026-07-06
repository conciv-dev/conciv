import {expect, test} from 'vitest'
import ping from './fixtures/ping/server.js'
import {bootExtensionServer} from '../src/boot-server.js'
import {resolveSession} from '@conciv/harness-testkit'
import {makeCallTool} from '@conciv/harness-testkit'

test('calls a real extension tool over MCP', async () => {
  const {apiBase, stop} = await bootExtensionServer(ping)
  try {
    const session = await resolveSession(apiBase)
    const callTool = makeCallTool(apiBase, session)
    const result = await callTool('ping.echo', {text: 'marco-polo'})
    expect(JSON.stringify(result)).toContain('marco-polo')
  } finally {
    await stop()
  }
})
