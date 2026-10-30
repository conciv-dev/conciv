import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {
  approvalAskOf,
  approvalRequestedEvent,
  approvalSettledEvent,
  ChatEventType,
  codeModeToolCallEvent,
  codeModeToolErrorEvent,
  codeModeToolResultEvent,
  defineChatEvent,
  isRunPhaseTerminal,
  runLifecycleEvent,
} from '../src/index.js'

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
  it('approval-requested', () => {
    const event = approvalRequestedEvent.create({
      toolCallId: 'tc1',
      toolName: 'Bash',
      input: {command: 'ls'},
      approval: {id: 'a1', needsApproval: true},
    })
    expect(event).toEqual({
      type: ChatEventType.CUSTOM,
      name: 'approval-requested',
      value: {toolCallId: 'tc1', toolName: 'Bash', input: {command: 'ls'}, approval: {id: 'a1', needsApproval: true}},
    })
    expect(approvalAskOf({...event, timestamp: 1})).toEqual({
      approvalId: 'a1',
      toolCallId: 'tc1',
      toolName: 'Bash',
      input: {command: 'ls'},
    })
  })

  it('approval-settled', () => {
    const event = approvalSettledEvent.create({approvalId: 'a1'})
    expect(event).toEqual({type: ChatEventType.CUSTOM, name: 'conciv.approval-settled', value: {approvalId: 'a1'}})
    expect(approvalSettledEvent.parse(event)?.approvalId).toBe('a1')
  })

  it('run lifecycle', () => {
    const event = runLifecycleEvent.create(lifecycle)
    expect(event).toEqual({type: ChatEventType.CUSTOM, name: 'conciv.run-lifecycle', value: lifecycle})
    expect(runLifecycleEvent.parse(event)).toEqual(lifecycle)
    expect(isRunPhaseTerminal('stopping')).toBe(false)
    expect(isRunPhaseTerminal('aborted')).toBe(true)
  })

  it('code-mode child tool events', () => {
    expect(codeModeToolCallEvent.name).toBe('conciv:tool_call')
    expect(codeModeToolResultEvent.name).toBe('conciv:tool_result')
    expect(codeModeToolErrorEvent.name).toBe('conciv:tool_error')
    expect(
      codeModeToolCallEvent.parse({
        type: ChatEventType.CUSTOM,
        name: 'conciv:tool_call',
        value: {callId: 'c1', name: 'canvas_svg', input: {x: 1}},
      }),
    ).toEqual({callId: 'c1', name: 'canvas_svg', input: {x: 1}})
  })
})
