import {describe, it, expect} from 'vitest'
import {geminiCli} from '../src/gemini-cli/index.js'
import {opencode} from '../src/opencode/index.js'
import {pi} from '../src/pi/index.js'
import type {HarnessTurn} from '@aidx/protocol/harness-types'

const turn: HarnessTurn = {prompt: 'x', cwd: '/r', resumeSessionId: null, systemPrompt: ''}

describe.each([
  ['gemini-cli', geminiCli],
  ['opencode', opencode],
  ['pi', pi],
])('%s stub', (id, adapter) => {
  it('declares its id and capabilities', () => {
    expect(adapter.id).toBe(id)
    expect(adapter.capabilities).toBeDefined()
  })
  it('throws "not implemented" from buildArgs', () => {
    expect(() => adapter.buildArgs(turn)).toThrow(/not implemented/)
  })
})
