import {describe, expect, it} from 'vitest'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'
import {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {geminiCli} from '../src/gemini-cli/index.js'

const deps = (over: Partial<HarnessChatDeps> = {}): HarnessChatDeps => ({
  cwd: '/tmp/acp-test',
  sessionId: SessionId.parse('conciv_s-1'),
  resumeSessionId: null,
  env: {},
  kind: 'chat',
  ...over,
})

describe('gemini-cli chatConfig', () => {
  it('returns the acp adapter named gemini-cli for the requested model', () => {
    const config = geminiCli.chatConfig(deps({model: 'gemini-2.5-flash'}))
    expect(config.adapter.model).toBe('gemini-2.5-flash')
  })

  it('threads the resume session id through modelOptions', () => {
    expect(geminiCli.chatConfig(deps()).modelOptions).toEqual({})
    expect(geminiCli.chatConfig(deps({resumeSessionId: HarnessSessionId.parse('acp-9')})).modelOptions).toEqual({
      sessionId: 'acp-9',
    })
  })
})
