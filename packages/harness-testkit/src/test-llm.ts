import type {fakeText} from '@conciv/ai/testkit'
import type {ModelMessage} from '@conciv/protocol/chat-message-types'
import type {ReasoningEffort} from '@conciv/protocol/chat-types'

type FakeText = ReturnType<typeof fakeText>

export type FakeResponseStep = Parameters<FakeText['appendResponses']>[0][number]

declare const brand: unique symbol

export type Reply = FakeResponseStep & {readonly [brand]: 'TestLLM.Reply'}

export type ModelRequestTool = {name: string; description: string; inputSchema: Record<string, unknown>}

export type ModelRequest = {
  system: string[]
  messages: ModelMessage[]
  tools: ModelRequestTool[]
  model: string | null
  effort: ReasoningEffort | null
  options: Record<string, unknown>
}

export type Gate = Readonly<{started: Promise<void>; release: () => Promise<void>}>

function reply(step: FakeResponseStep): Reply
function reply(step: FakeResponseStep): FakeResponseStep {
  return step
}

function aborted(signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) resolve()
    else signal?.addEventListener('abort', () => resolve(), {once: true})
  })
}

export function text(value: string): Reply {
  return reply({text: value})
}

export function toolCall(id: string, name: string, input: unknown): Reply {
  return reply({toolCalls: [{id, name, input}]})
}

export function failAfter(error: Error): Reply {
  return reply({error: error.message})
}

export function hang(): Reply {
  return reply(async ({request}) => {
    await aborted(request.request?.signal)
    return {}
  })
}
