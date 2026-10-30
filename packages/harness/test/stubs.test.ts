import {describe, it, expect} from 'vitest'
import {ChatEventType} from '@conciv/ai'
import {runAdapterTurn} from '@conciv/ai/testkit'
import {SessionId} from '@conciv/protocol/chat-types'
import {pi} from '../src/pi/index.js'

describe.each([['pi', pi]])('%s stub', (id, adapter) => {
  it('declares its id and capabilities', () => {
    expect(adapter.id).toBe(id)
    expect(adapter.capabilities).toBeDefined()
  })
  it('chatConfig yields a RUN_ERROR naming the missing binary', async () => {
    const config = adapter.chatConfig({
      cwd: '/r',
      sessionId: SessionId.parse('conciv_s'),
      resumeSessionId: null,
      env: {},
      kind: 'chat',
      decide: async () => 'allow',
    })
    const chunks = await runAdapterTurn(config.adapter, [{role: 'user', content: 'hi'}])
    const last = chunks.at(-1)
    expect(last?.type).toBe(ChatEventType.RUN_ERROR)
    expect(last && 'message' in last ? last.message : '').toContain(adapter.binName)
  })
})
