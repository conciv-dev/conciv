import type {UsageSnapshot} from '@conciv/types/usage-types'
import type {FakeReply} from './fake-types.js'

export const FakeLLM = {
  text: (text: string): FakeReply => ({kind: 'text', text, ends: true}),
  partialText: (text: string): FakeReply => ({kind: 'text', text, ends: false}),
  thinking: (text: string): FakeReply => ({kind: 'thinking', text}),
  usage: (usage: UsageSnapshot): FakeReply => ({kind: 'usage', usage}),
  toolCall: (id: string, name: string, input: unknown, result: unknown = {}): FakeReply => ({
    kind: 'toolCall',
    id,
    name,
    input,
    result,
    failed: false,
  }),
  toolError: (id: string, name: string, input: unknown, message: string): FakeReply => ({
    kind: 'toolCall',
    id,
    name,
    input,
    result: message,
    failed: true,
  }),
  execute: (id: string, name: string, input: unknown): FakeReply => ({kind: 'execute', id, name, input}),
  failAfter: (error: Error & {code?: string}): FakeReply => ({
    kind: 'failAfter',
    message: error.message,
    code: error.code,
  }),
  hang: (): FakeReply => ({kind: 'hang'}),
}
