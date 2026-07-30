import {describe, expect, it} from 'vitest'
import {SessionId} from '@conciv/protocol/chat-types'
import type {HarnessChatDeps, HarnessConnectContext} from '@conciv/protocol/harness-types'
import {codex} from '../src/codex/index.js'

const connectContext = (over: Partial<HarnessConnectContext> = {}): HarnessConnectContext => ({
  cwd: '/tmp',
  concivSessionId: SessionId.parse('conciv_codex_test'),
  harnessSessionId: null,
  resume: false,
  model: null,
  mcpUrl: null,
  hookUrl: null,
  ...over,
})

const deps = (over: Partial<HarnessChatDeps> = {}): HarnessChatDeps => ({
  cwd: '/tmp/codex-test',
  sessionId: 's-1',
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
    expect(codex.chatConfig(deps({resumeSessionId: 'thread-9'})).modelOptions).toEqual({sessionId: 'thread-9'})
  })

  it('plans a resume invocation for an existing harness session', () => {
    expect(codex.connect?.plan(connectContext({harnessSessionId: 'thread-9', model: 'gpt-5.1'}))).toEqual({
      argv: ['codex', 'resume', 'thread-9', '-m', 'gpt-5.1'],
      env: {},
      files: [],
    })
  })

  it('plans a bare invocation when there is no harness session and no model', () => {
    expect(codex.connect?.plan(connectContext({}))).toEqual({argv: ['codex'], env: {}, files: []})
  })
})
