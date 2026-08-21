import {describe, expect, it} from 'vitest'
import {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import type {HarnessConnectContext} from '@conciv/protocol/harness-types'
import {createFakeHarness} from '../src/create-fake-harness.js'

const context: HarnessConnectContext = {
  cwd: '/',
  stateDir: '/state/.conciv',
  concivSessionId: SessionId.parse('conciv_fake_harness'),
  harnessSessionId: HarnessSessionId.parse('s'),
  resume: false,
  owned: true,
  model: null,
  mcpUrl: null,
  hookUrl: null,
}

describe('createFakeHarness transcript history', () => {
  it('declares no transcript history by default', () => {
    const harness = createFakeHarness()
    expect(harness.capabilities.transcriptHistory).toBe(false)
    expect(harness.history).toBeUndefined()
  })

  it('serves the injected rows as the harness transcript list', async () => {
    const rows = [
      {
        id: HarnessSessionId.parse('external-1'),
        derivedTitle: 'An external session',
        updatedAt: 1_700,
        messageCount: 7,
      },
      {id: HarnessSessionId.parse('external-2'), derivedTitle: 'Another one', updatedAt: 1_800, messageCount: 2},
    ]
    const harness = createFakeHarness({history: rows})

    expect(harness.capabilities.transcriptHistory).toBe(true)
    expect(await harness.history?.list('/project')).toEqual(rows)
    expect(await harness.history?.messages('/project', HarnessSessionId.parse('external-1'))).toEqual([])
  })
})

describe('createFakeHarness tty', () => {
  it('has no tty by default', () => {
    expect(createFakeHarness().tty).toBeUndefined()
  })

  it('exposes an injected tty command', () => {
    const command = () => ({bin: 'bash', args: ['-i'], env: {}})
    const harness = createFakeHarness({tty: {command}})
    expect(harness.tty?.command(context).bin).toBe('bash')
  })
})
