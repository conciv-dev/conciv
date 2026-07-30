import {afterEach, describe, expect, it} from 'vitest'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {startTerminalServer, type TerminalTestServer} from './helpers.js'

const open: {servers: TerminalTestServer[]} = {servers: []}

const OWNER = 'conciv_hook_owner'

const HOSTILE = [
  '../../etc/passwd',
  '/etc/passwd',
  '..',
  'sess/../../secret',
  'sess\u0000.jsonl',
  'a b',
  `${'x'.repeat(200)}`,
]

function postHook(server: TerminalTestServer, harnessSessionId: string): Promise<Response> {
  return fetch(`${server.base}/api/ext/terminal/hook`, {
    method: 'POST',
    headers: {'content-type': 'application/json', [CONCIV_SESSION_HEADER]: OWNER},
    body: JSON.stringify({session_id: harnessSessionId, hook_event_name: 'SessionStart', cwd: '/workspace'}),
  })
}

afterEach(async () => {
  const servers = open.servers.splice(0)
  await Promise.all(servers.map((server) => server.close()))
})

describe('terminal hook route rejects hostile session ids', () => {
  it.each(HOSTILE)('refuses %j and records no token', async (hostile) => {
    const server = await startTerminalServer()
    open.servers.push(server)
    const response = await postHook(server, hostile)
    expect(response.status).toBe(400)
    expect([...server.sessions.tokens.values()]).toEqual([])
  })

  it('still accepts a plain harness session id', async () => {
    const server = await startTerminalServer()
    open.servers.push(server)
    const response = await postHook(server, '0c1d2e3f-aaaa-bbbb-cccc-000011112222')
    expect(response.status).toBe(200)
    expect(server.sessions.tokens.get(OWNER)).toBe('0c1d2e3f-aaaa-bbbb-cccc-000011112222')
  })
})
