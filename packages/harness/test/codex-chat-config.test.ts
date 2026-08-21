import {describe, expect, it} from 'vitest'
import {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import type {HarnessChatDeps, HarnessConnectContext} from '@conciv/protocol/harness-types'
import {codex} from '../src/codex/index.js'

const connectContext = (over: Partial<HarnessConnectContext> = {}): HarnessConnectContext => ({
  cwd: '/tmp',
  stateDir: '/tmp/.conciv/codex',
  concivSessionId: SessionId.parse('conciv_codex_test'),
  harnessSessionId: null,
  resume: false,
  owned: true,
  model: null,
  mcpUrl: null,
  hookUrl: null,
  ...over,
})

const deps = (over: Partial<HarnessChatDeps> = {}): HarnessChatDeps => ({
  cwd: '/tmp/codex-test',
  sessionId: SessionId.parse('conciv_s-1'),
  resumeSessionId: null,
  env: {PATH: '/usr/bin'},
  kind: 'chat',
  decide: async () => 'allow',
  ...over,
})

describe('codex chatConfig', () => {
  it('returns their codex adapter for the requested model', () => {
    const config = codex.chatConfig(deps({model: 'gpt-5.1'}))
    expect(config.adapter.name).toBe('codex')
    expect(config.adapter.model).toBe('gpt-5.1')
  })

  it('defaults the model when none is requested', () => {
    expect(codex.chatConfig(deps()).adapter.model).toBe('gpt-5.5')
  })

  it('threads the resume session id through modelOptions and leaves the workdir to the sandbox', () => {
    expect(codex.chatConfig(deps()).modelOptions).toEqual({})
    expect(codex.chatConfig(deps({resumeSessionId: HarnessSessionId.parse('thread-9')})).modelOptions).toEqual({
      sessionId: 'thread-9',
    })
  })

  it('auto-approves the bridged MCP server only when tools ride the run', () => {
    const bridged = JSON.stringify(codex.chatConfig(deps({hasTools: true})).adapter)
    expect(bridged).toContain('mcp_servers.tanstack.default_tools_approval_mode')
    const bare = JSON.stringify(codex.chatConfig(deps()).adapter)
    expect(bare).not.toContain('mcp_servers.tanstack')
  })

  it('plans a resume invocation for an existing harness session', () => {
    expect(
      codex.connect?.plan(
        connectContext({resume: true, harnessSessionId: HarnessSessionId.parse('thread-9'), model: 'gpt-5.1'}),
      ),
    ).toEqual({
      argv: ['codex', 'resume', 'thread-9', '-m', 'gpt-5.1'],
      env: {},
      files: [],
    })
  })

  it('plans a bare invocation when there is no harness session and no model', () => {
    expect(codex.connect?.plan(connectContext({}))).toEqual({argv: ['codex'], env: {}, files: []})
  })

  it('leaves the session to codex when a known session is not being resumed', () => {
    expect(codex.connect?.plan(connectContext({harnessSessionId: HarnessSessionId.parse('thread-9')})).argv).toEqual([
      'codex',
    ])
  })

  it('passes the conciv mcp server as a whole-table toml override', () => {
    const argv = codex.connect?.plan(connectContext({mcpUrl: 'http://127.0.0.1:4321/api/mcp'})).argv ?? []
    expect(argv).toEqual([
      'codex',
      '-c',
      'mcp_servers={conciv={url="http://127.0.0.1:4321/api/mcp",http_headers={"conciv-session-id"="conciv_codex_test"},startup_timeout_sec=30}}',
    ])
  })
})
