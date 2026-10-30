import {describe, expect, it} from 'vitest'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'
import {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {opencode} from '../src/opencode/index.js'

const deps = (over: Partial<HarnessChatDeps> = {}): HarnessChatDeps => ({
  cwd: '/tmp/opencode-test',
  sessionId: SessionId.parse('conciv_s-1'),
  resumeSessionId: null,
  env: {},
  kind: 'chat',
  ...over,
})

describe('opencode chatConfig', () => {
  it('returns their opencode adapter for the requested model', () => {
    const config = opencode.chatConfig(deps({model: 'opencode/gpt-5.1'}))
    expect(config.adapter.name).toBe('opencode')
    expect(config.adapter.model).toBe('opencode/gpt-5.1')
  })

  it('defaults the model when none is requested', () => {
    expect(opencode.chatConfig(deps()).adapter.model).toBe('opencode/claude-sonnet-4-5')
  })

  it('threads the resume session id through modelOptions and leaves the workdir to the sandbox', () => {
    expect(opencode.chatConfig(deps()).modelOptions).toEqual({})
    expect(opencode.chatConfig(deps({resumeSessionId: HarnessSessionId.parse('ses-9')})).modelOptions).toEqual({
      sessionId: 'ses-9',
    })
  })
})
