import {describe, expect, it} from 'vitest'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'
import {codex} from '../src/codex/index.js'

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

  it('keeps the terminal launch flow', async () => {
    const result = await codex.launch?.({
      cwd: '/tmp',
      sessionId: 'thread-9',
      model: 'gpt-5.1',
      mcpUrl: null,
      openTerminal: async (argv) => ({opened: true, command: argv.join(' ')}),
      openUrl: async () => ({opened: false, command: ''}),
    })
    expect(result).toEqual({opened: true, command: 'codex resume thread-9 -m gpt-5.1'})
  })
})
