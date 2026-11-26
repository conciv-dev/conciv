import {Stream} from 'effect'
import {describe, expect, it} from 'vitest'
import {runAdapterTurn} from '../../src/ai-testkit.js'
import {ChatEventType, type ChatEvent} from '@conciv/types/chat-event-types'
import {SessionId} from '@conciv/types/chat-types'
import {scriptedHarness} from '../../src/backend/scripted-harness.js'
import * as SimulatedHarness from '../../src/backend/simulated-harness.js'
import type {ProviderResponseEvent} from '../../src/backend/simulated-provider.js'
import type * as SimulatedProvider from '../../src/backend/simulated-provider.js'

describe('simulated harness', () => {
  function encoded(events: readonly ProviderResponseEvent[]): ChatEvent[] {
    const encoding = SimulatedHarness.newEncoding('run', 'thread')
    return events.flatMap((event) => SimulatedHarness.chatEvents(encoding, event))
  }

  function disconnecting(): SimulatedProvider.Interface {
    return {
      stream: () =>
        Stream.fail({_tag: 'SimulatedProvider.ProviderDisconnected', message: 'Simulated model provider disconnected'}),
    }
  }

  async function turn(provider: SimulatedProvider.Interface): Promise<ChatEvent[]> {
    const harness = SimulatedHarness.simulatedHarness(provider)(scriptedHarness({id: 'engine'}, '/workspace'))
    const {adapter} = await harness.chatConfig({
      cwd: '/workspace',
      sessionId: SessionId.parse('ses_simulated'),
      askPermission: async () => ({allowed: true}),
      resumeSessionId: null,
      env: {},
      kind: 'chat',
    })
    return runAdapterTurn(adapter, [{role: 'user', content: 'hello'}])
  }

  it.each([
    {
      name: 'every simulated provider event',
      events: [
        {type: 'reasoningDelta', text: 'thinking'},
        {type: 'textDelta', text: 'Hello'},
        {type: 'toolCall', index: 0, id: 'call_1', name: 'lookup', input: {query: 'answer'}},
        {type: 'raw', chunk: {type: ChatEventType.CUSTOM, name: 'simulation.raw', value: {kept: true}}},
        {type: 'finish', reason: 'tool-calls'},
      ] satisfies ProviderResponseEvent[],
      expected: [
        {type: ChatEventType.REASONING_START, messageId: 'run-thinking-1'},
        {type: ChatEventType.REASONING_MESSAGE_START, messageId: 'run-thinking-1', role: 'reasoning'},
        {type: ChatEventType.REASONING_MESSAGE_CONTENT, messageId: 'run-thinking-1', delta: 'thinking'},
        {type: ChatEventType.REASONING_MESSAGE_END, messageId: 'run-thinking-1'},
        {type: ChatEventType.REASONING_END, messageId: 'run-thinking-1'},
        {type: ChatEventType.TEXT_MESSAGE_START, messageId: 'run-text-2', role: 'assistant'},
        {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: 'run-text-2', delta: 'Hello'},
        {type: ChatEventType.TEXT_MESSAGE_END, messageId: 'run-text-2'},
        {type: ChatEventType.TOOL_CALL_START, toolCallId: 'call_1', toolCallName: 'lookup'},
        {type: ChatEventType.TOOL_CALL_ARGS, toolCallId: 'call_1', delta: '{"query":"answer"}'},
        {type: ChatEventType.TOOL_CALL_END, toolCallId: 'call_1', input: {query: 'answer'}},
        {type: ChatEventType.CUSTOM, name: 'simulation.raw', value: {kept: true}},
        {type: ChatEventType.RUN_FINISHED, runId: 'run', threadId: 'thread', finishReason: 'tool_calls'},
      ],
    },
    {
      name: 'partial tool input as tool call argument deltas',
      events: [
        {type: 'toolInputStart', index: 0, id: 'call_1', name: 'lookup'},
        {type: 'toolInputDelta', index: 0, text: '{"query":'},
        {type: 'toolInputDelta', index: 0, text: '"answer"}'},
        {type: 'finish', reason: 'tool-calls'},
      ] satisfies ProviderResponseEvent[],
      expected: [
        {type: ChatEventType.TOOL_CALL_START, toolCallId: 'call_1', toolCallName: 'lookup'},
        {type: ChatEventType.TOOL_CALL_ARGS, toolCallId: 'call_1', delta: '{"query":'},
        {type: ChatEventType.TOOL_CALL_ARGS, toolCallId: 'call_1', delta: '"answer"}'},
        {type: ChatEventType.TOOL_CALL_END, toolCallId: 'call_1', input: {query: 'answer'}},
        {type: ChatEventType.RUN_FINISHED, runId: 'run', threadId: 'thread', finishReason: 'tool_calls'},
      ],
    },
  ])('encodes $name as chat events', ({events, expected}) => {
    expect(encoded(events)).toEqual(expected)
  })

  it('ends the run with an error when the driver disconnects the invocation', async () => {
    const events = await turn(disconnecting())
    expect(events).toContainEqual(expect.objectContaining({type: ChatEventType.RUN_STARTED}))
    expect(events).toContainEqual(
      expect.objectContaining({type: ChatEventType.CUSTOM, value: {sessionId: 'simulated-ses_simulated'}}),
    )
    expect(events).toContainEqual(
      expect.objectContaining({type: ChatEventType.RUN_ERROR, message: 'Simulated model provider disconnected'}),
    )
  })
})
