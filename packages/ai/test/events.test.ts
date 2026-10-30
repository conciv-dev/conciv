import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {
  approvalAskOf,
  approvalRequestedEvent,
  ChatEventType,
  defineChatEvent,
  isRunPhaseTerminal,
  runLifecycleEvent,
} from '@conciv/ai'

const lifecycle = {
  runId: 'r1',
  phase: 'running' as const,
  startedAt: 1,
  finishedAt: null,
  serverNow: 2,
  error: null,
}

describe('defineChatEvent', () => {
  const pinged = defineChatEvent('test.pinged', z.object({count: z.number()}))

  it('creates a CUSTOM event carrying the validated value', () => {
    expect(pinged.create({count: 1})).toEqual({type: ChatEventType.CUSTOM, name: 'test.pinged', value: {count: 1}})
  })

  it('rejects an invalid value on create', () => {
    expect(() => pinged.create({count: Number.NaN})).toThrow()
  })

  it('parses only its own name with a valid value', () => {
    expect(pinged.parse({type: ChatEventType.CUSTOM, name: 'test.pinged', value: {count: 2}})).toEqual({count: 2})
    expect(pinged.parse({type: ChatEventType.CUSTOM, name: 'test.other', value: {count: 2}})).toBeNull()
    expect(pinged.parse({type: ChatEventType.CUSTOM, name: 'test.pinged', value: {count: 'x'}})).toBeNull()
    expect(pinged.parse({type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta: 'hi'})).toBeNull()
  })
})

describe('conciv events keep their wire shape', () => {
  it('approval-requested, the shape the sandbox adapters emit', () => {
    const event = approvalRequestedEvent.create({
      approvalId: 'claude-code:command:ls',
      title: 'Bash: ls',
      command: 'ls',
    })
    expect(event).toEqual({
      type: ChatEventType.CUSTOM,
      name: 'approval-requested',
      value: {approvalId: 'claude-code:command:ls', title: 'Bash: ls', command: 'ls'},
    })
    expect(approvalAskOf({...event, timestamp: 1})).toEqual({
      approvalId: 'claude-code:command:ls',
      toolCallId: 'claude-code:command:ls',
      toolName: 'Bash: ls',
      input: {command: 'ls'},
    })
  })

  it('run lifecycle', () => {
    const event = runLifecycleEvent.create(lifecycle)
    expect(event).toEqual({type: ChatEventType.CUSTOM, name: 'conciv.run-lifecycle', value: lifecycle})
    expect(runLifecycleEvent.parse(event)).toEqual(lifecycle)
    expect(isRunPhaseTerminal('stopping')).toBe(false)
    expect(isRunPhaseTerminal('aborted')).toBe(true)
  })
})
