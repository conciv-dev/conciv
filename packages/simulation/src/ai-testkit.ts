import {chat, StreamProcessor} from '@tanstack/ai'
import type {CapabilityContext} from '@tanstack/ai'
import {getToolBridgeProvisioner} from '@tanstack/ai-sandbox'
import {z} from 'zod'
import {failureText} from '@conciv/protocol'
import type {TextAdapter} from '@conciv/harness/adapters'
import type {ChatMessage, ModelMessage} from '@conciv/types/chat-message-types'
import type {ChatEvent} from '@conciv/types/chat-event-types'

export {ChatClient} from '@tanstack/ai-client'
export {fakeText} from '@tanstack/ai/testing'

export type ChatCapabilities = CapabilityContext

export type PermissionPromptCall = {
  threadId: string
  toolName: string
  input: unknown
  signal?: AbortSignal
  cut?: AbortSignal
}

const PERMISSION_TOOL = 'approval_prompt'

const ADAPTER_DEFAULT_DENIAL = {
  behavior: 'deny' as const,
  message: 'Awaiting client approval. Approve in the UI and re-run to continue.',
}

const PromptReplySchema = z.object({
  result: z.object({content: z.tuple([z.object({type: z.literal('text'), text: z.string()})])}),
})

export async function callPermissionPrompt(
  capabilities: ChatCapabilities,
  call: PermissionPromptCall,
): Promise<string> {
  const served = await getToolBridgeProvisioner(capabilities).provision([], {
    provider: 'local-process',
    threadId: call.threadId,
    permission: {toolName: PERMISSION_TOOL, resolve: () => ADAPTER_DEFAULT_DENIAL},
    ...(call.signal === undefined ? {} : {signal: call.signal}),
  })
  try {
    const reply = await fetch(served.url, {
      method: 'POST',
      headers: {authorization: `Bearer ${served.token}`, 'content-type': 'application/json'},
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {name: PERMISSION_TOOL, arguments: {tool_name: call.toolName, input: call.input}},
      }),
      signal: AbortSignal.any([call.cut, call.signal].filter((each) => each !== undefined)),
    })
    return PromptReplySchema.parse(await reply.json()).result.content[0].text
  } catch (error) {
    return `the permission prompt call failed: ${failureText(error)}`
  } finally {
    await served.close()
  }
}

export async function runAdapterTurn(adapter: TextAdapter, messages: ModelMessage[]): Promise<ChatEvent[]> {
  const events: ChatEvent[] = []
  for await (const event of chat({adapter, threadId: 'testkit', messages})) events.push(event)
  return events
}

export function foldChatEvents(events: Iterable<ChatEvent>): ChatMessage[] {
  const processor = new StreamProcessor({})
  for (const event of events) processor.processChunk(event)
  return processor.getMessages()
}
