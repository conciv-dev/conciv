import {describe, it, expect} from 'vitest'
import {chat, EventType, type StreamChunk} from '@tanstack/ai'
import {geminiCli} from '../src/gemini-cli/index.js'
import {opencode} from '../src/opencode/index.js'
import {pi} from '../src/pi/index.js'

describe.each([
  ['gemini-cli', geminiCli],
  ['opencode', opencode],
  ['pi', pi],
])('%s stub', (id, adapter) => {
  it('declares its id and capabilities', () => {
    expect(adapter.id).toBe(id)
    expect(adapter.capabilities).toBeDefined()
  })
  it('chatConfig yields a RUN_ERROR naming the missing binary', async () => {
    const config = adapter.chatConfig({
      cwd: '/r',
      sessionId: 's',
      resumeSessionId: null,
      env: {},
      kind: 'chat',
      decide: async () => 'allow',
    })
    const chunks: StreamChunk[] = []
    for await (const chunk of chat({adapter: config.adapter, messages: [{role: 'user', content: 'hi'}]})) {
      chunks.push(chunk)
    }
    const last = chunks.at(-1)
    expect(last?.type).toBe(EventType.RUN_ERROR)
    expect(last && 'message' in last ? last.message : '').toContain(adapter.binName)
  })
})
