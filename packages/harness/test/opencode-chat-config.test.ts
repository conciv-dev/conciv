import {describe, expect, it} from 'vitest'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'
import {opencode, opencodePermissionHandler} from '../src/opencode/index.js'

const deps = (over: Partial<HarnessChatDeps> = {}): HarnessChatDeps => ({
  cwd: '/tmp/opencode-test',
  sessionId: 's-1',
  resumeSessionId: null,
  env: {},
  kind: 'chat',
  decide: async () => 'allow',
  ...over,
})

describe('opencodePermissionHandler', () => {
  it('maps gate allow to once, passing the request type and callID', async () => {
    const calls: unknown[][] = []
    const handler = opencodePermissionHandler(async (...args) => {
      calls.push(args)
      return 'allow'
    })
    const response = await handler({id: 'perm-1', sessionID: 'ses-1', type: 'bash', title: 'run ls', callID: 'call-7'})
    expect(response).toBe('once')
    expect(calls[0]).toEqual(['bash', {title: 'run ls'}, 'call-7'])
  })

  it('maps gate deny to reject and falls back to the permission id as toolUseId', async () => {
    const calls: unknown[][] = []
    const handler = opencodePermissionHandler(async (...args) => {
      calls.push(args)
      return 'deny'
    })
    const response = await handler({id: 'perm-2', sessionID: 'ses-1', type: 'edit', title: 'edit file'})
    expect(response).toBe('reject')
    expect(calls[0]).toEqual(['edit', {title: 'edit file'}, 'perm-2'])
  })
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
    expect(opencode.chatConfig(deps({resumeSessionId: 'ses-9'})).modelOptions).toEqual({sessionId: 'ses-9'})
  })
})
