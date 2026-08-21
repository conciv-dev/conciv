import {describe, expect, it} from 'vitest'
import {CONCIV_SESSION_HEADER, HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import type {HarnessConnectContext} from '@conciv/protocol/harness-types'
import {opencode} from '../src/opencode/index.js'

const CONCIV_SESSION = SessionId.parse('conciv_opencode_test')

const context = (over: Partial<HarnessConnectContext> = {}): HarnessConnectContext => ({
  cwd: '/workspace',
  stateDir: '/tmp/.conciv/opencode',
  concivSessionId: CONCIV_SESSION,
  harnessSessionId: null,
  resume: false,
  owned: true,
  model: null,
  mcpUrl: null,
  hookUrl: null,
  ...over,
})

function plan(over: Partial<HarnessConnectContext> = {}) {
  const connect = opencode.connect
  if (!connect) throw new Error('opencode harness has no connect plan')
  return connect.plan(context(over))
}

describe('opencode connect.plan', () => {
  it('continues an existing session only when resuming', () => {
    expect(plan({resume: true, harnessSessionId: HarnessSessionId.parse('ses_1')}).argv).toEqual([
      'opencode',
      '--session',
      'ses_1',
    ])
    expect(plan({harnessSessionId: HarnessSessionId.parse('ses_1')}).argv).toEqual(['opencode'])
  })

  it('passes the conciv mcp server through the config content env var', () => {
    const built = plan({mcpUrl: 'http://127.0.0.1:4321/api/mcp'})
    expect(built.files).toEqual([])
    expect(JSON.parse(built.env.OPENCODE_CONFIG_CONTENT ?? '')).toEqual({
      mcp: {
        conciv: {
          type: 'remote',
          url: 'http://127.0.0.1:4321/api/mcp',
          headers: {[CONCIV_SESSION_HEADER]: CONCIV_SESSION},
          oauth: false,
          enabled: true,
        },
      },
    })
  })

  it('leaves the environment alone when there is no mcp url', () => {
    expect(plan().env).toEqual({})
  })
})
