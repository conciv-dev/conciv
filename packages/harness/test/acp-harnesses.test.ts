import {describe, expect, it} from 'vitest'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'
import {acpPermissionHandler} from '../src/_shared/acp.js'
import {geminiCli} from '../src/gemini-cli/index.js'

const options = [
  {optionId: 'opt-allow', name: 'Allow once', kind: 'allow_once' as const},
  {optionId: 'opt-reject', name: 'Reject once', kind: 'reject_once' as const},
]

const request = (over: Partial<Parameters<ReturnType<typeof acpPermissionHandler>>[0]> = {}) => ({
  sessionId: 'ses-1',
  toolCall: {toolCallId: 'call-1', title: 'run ls'},
  options,
  ...over,
})

describe('acpPermissionHandler', () => {
  it('selects the allow_once option when the gate allows, passing title + toolCallId', async () => {
    const calls: unknown[][] = []
    const handler = acpPermissionHandler(async (...args) => {
      calls.push(args)
      return 'allow'
    })
    await expect(handler(request())).resolves.toEqual({outcome: 'selected', optionId: 'opt-allow'})
    expect(calls[0]?.[0]).toBe('run ls')
    expect(calls[0]?.[2]).toBe('call-1')
  })

  it('falls back to the toolCallId as the gate tool name when there is no title', async () => {
    const names: unknown[] = []
    const handler = acpPermissionHandler(async (toolName) => {
      names.push(toolName)
      return 'allow'
    })
    await handler(request({toolCall: {toolCallId: 'call-2'}}))
    expect(names[0]).toBe('call-2')
  })

  it('selects the reject_once option when the gate denies', async () => {
    const handler = acpPermissionHandler(async () => 'deny')
    await expect(handler(request())).resolves.toEqual({outcome: 'selected', optionId: 'opt-reject'})
  })

  it('cancels when no option matches the decision', async () => {
    const handler = acpPermissionHandler(async () => 'allow')
    await expect(
      handler(request({options: [{optionId: 'opt-reject', name: 'Reject once', kind: 'reject_once' as const}]})),
    ).resolves.toEqual({outcome: 'cancelled'})
  })
})

const deps = (over: Partial<HarnessChatDeps> = {}): HarnessChatDeps => ({
  cwd: '/tmp/acp-test',
  sessionId: 's-1',
  resumeSessionId: null,
  env: {},
  kind: 'chat',
  decide: async () => 'allow',
  ...over,
})

describe('gemini-cli chatConfig', () => {
  it('returns the acp adapter named gemini-cli for the requested model', () => {
    const config = geminiCli.chatConfig(deps({model: 'gemini-2.5-flash'}))
    expect(config.adapter.model).toBe('gemini-2.5-flash')
  })

  it('threads the resume session id through modelOptions', () => {
    expect(geminiCli.chatConfig(deps()).modelOptions).toEqual({})
    expect(geminiCli.chatConfig(deps({resumeSessionId: 'acp-9'})).modelOptions).toEqual({sessionId: 'acp-9'})
  })
})
