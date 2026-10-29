import {describe, expect, it} from 'vitest'
import {SessionId} from '@conciv/protocol/chat-types'
import {createCommandMemory} from '../../src/chat/command-memory.js'

const SESSION = SessionId.parse('conciv_a')
const OTHER = SessionId.parse('conciv_b')

describe('per-session command memory', () => {
  it('allows only the exact command the user remembered, and only after they remembered it', () => {
    const memory = createCommandMemory()
    memory.note(SESSION, 'approval-1', 'pnpm run build')
    expect(memory.allows(SESSION, 'pnpm run build')).toBe(false)

    memory.remember(SESSION, 'approval-1')

    expect(memory.allows(SESSION, 'pnpm run build')).toBe(true)
    expect(memory.allows(SESSION, '  pnpm   run  build  ')).toBe(true)
    expect(memory.allows(SESSION, 'pnpm run build --force')).toBe(false)
    expect(memory.allows(SESSION, 'pnpm run buil')).toBe(false)
    expect(memory.allows(SESSION, 'pnpm run build && rm -rf /')).toBe(false)
    expect(memory.allows(OTHER, 'pnpm run build')).toBe(false)
  })

  it('never remembers a command carrying syntax that can hide a second command', () => {
    const memory = createCommandMemory()
    memory.note(SESSION, 'approval-2', 'grep "$(cat target)" src')
    memory.remember(SESSION, 'approval-2')
    expect(memory.allows(SESSION, 'grep "$(cat target)" src')).toBe(false)

    memory.note(SESSION, 'approval-3', 'ls > out.txt')
    memory.remember(SESSION, 'approval-3')
    expect(memory.allows(SESSION, 'ls > out.txt')).toBe(false)
  })

  it('remembers nothing for an approval that was never noted or has already settled', () => {
    const memory = createCommandMemory()
    memory.remember(SESSION, 'approval-unknown')
    expect(memory.allows(SESSION, 'pnpm run build')).toBe(false)

    memory.note(SESSION, 'approval-4', 'pnpm run test')
    memory.settle(SESSION, 'approval-4')
    memory.remember(SESSION, 'approval-4')
    expect(memory.allows(SESSION, 'pnpm run test')).toBe(false)
  })
})
