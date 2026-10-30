import {describe, expect, test} from 'vitest'
import {type ChatEvent, ChatEventType} from '@conciv/ai/events'
import {codeModeToolChunks} from '@conciv/chat/code-mode-parts'
import {createMessageFold} from '@conciv/ai/server'

const custom = (name: string, value: Record<string, unknown>): ChatEvent => ({type: ChatEventType.CUSTOM, name, value})

describe('codeModeToolChunks', () => {
  test('conciv:tool_call becomes START/ARGS/END stamped with the parent tool-call id', () => {
    const chunks = codeModeToolChunks(
      custom('conciv:tool_call', {callId: 'c1', name: 'canvas_svg', input: {x: 1}, toolCallId: 'parent-1'}),
    )
    expect(chunks).toEqual([
      {
        type: ChatEventType.TOOL_CALL_START,
        toolCallId: 'c1',
        toolCallName: 'canvas_svg',
        metadata: {codeModeSynthetic: true, parentToolCallId: 'parent-1'},
      },
      {type: ChatEventType.TOOL_CALL_ARGS, toolCallId: 'c1', delta: '{"x":1}'},
      {type: ChatEventType.TOOL_CALL_END, toolCallId: 'c1'},
    ])
  })

  test('a call without a parent id still carries the synthetic marker', () => {
    const chunks = codeModeToolChunks(custom('conciv:tool_call', {callId: 'c1', name: 'canvas_svg', input: {}}))
    expect(chunks?.[0]).toEqual({
      type: ChatEventType.TOOL_CALL_START,
      toolCallId: 'c1',
      toolCallName: 'canvas_svg',
      metadata: {codeModeSynthetic: true},
    })
  })

  test('conciv:tool_result becomes a complete TOOL_CALL_RESULT', () => {
    const chunks = codeModeToolChunks(custom('conciv:tool_result', {callId: 'c1', result: {ok: true}}))
    expect(chunks).toEqual([
      {
        type: ChatEventType.TOOL_CALL_RESULT,
        messageId: 'c1-result',
        toolCallId: 'c1',
        content: '{"ok":true}',
      },
    ])
  })

  test('conciv:tool_error becomes an output-error TOOL_CALL_RESULT', () => {
    const chunks = codeModeToolChunks(custom('conciv:tool_error', {callId: 'c1', error: 'denied'}))
    expect(chunks).toEqual([
      {
        type: ChatEventType.TOOL_CALL_RESULT,
        messageId: 'c1-result',
        toolCallId: 'c1',
        content: '{"error":"denied"}',
        metadata: {tanstack: {state: 'output-error'}},
      },
    ])
  })

  test('unrelated chunks are left alone', () => {
    expect(codeModeToolChunks(custom('code_mode:external_call', {function: 'x'}))).toBeNull()
    expect(codeModeToolChunks({type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta: 'hi'})).toBeNull()
    expect(codeModeToolChunks(custom('conciv:tool_call', {bogus: true}))).toBeNull()
  })

  test('synthesized chunks fold into a tool-call part with parent metadata and a paired result', () => {
    const processor = createMessageFold()
    processor.fold({type: ChatEventType.TEXT_MESSAGE_START, messageId: 'm1', role: 'assistant'})
    const sequence = [
      custom('conciv:tool_call', {callId: 'c1', name: 'canvas_svg', input: {x: 1}, toolCallId: 'parent-1'}),
      custom('conciv:tool_result', {callId: 'c1', result: 'drew'}),
    ].flatMap((chunk) => codeModeToolChunks(chunk) ?? [])
    sequence.forEach((chunk) => processor.fold(chunk))
    const parts = processor.messages().flatMap((message) => message.parts)
    const call = parts.find((part) => part.type === 'tool-call')
    expect(call).toMatchObject({name: 'canvas_svg', metadata: {parentToolCallId: 'parent-1'}})
    const result = parts.find((part) => part.type === 'tool-result')
    expect(result).toMatchObject({toolCallId: 'c1', state: 'complete'})
  })
})
