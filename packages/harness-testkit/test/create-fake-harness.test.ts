import {describe, expect, it} from 'vitest'
import {SessionId} from '@conciv/protocol/chat-types'
import type {HarnessConnectContext} from '@conciv/protocol/harness-types'
import {createFakeHarness} from '../src/create-fake-harness.js'

const context: HarnessConnectContext = {
  cwd: '/',
  concivSessionId: SessionId.parse('conciv_fake_harness'),
  harnessSessionId: 's',
  resume: false,
  model: null,
  mcpUrl: null,
  hookUrl: null,
}

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
