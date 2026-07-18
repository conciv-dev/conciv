import {describe, expect, it, vi} from 'vitest'
import type {RpcClient} from '@conciv/contract'

const captured = vi.hoisted(() => ({options: undefined as unknown}))

vi.mock('@tanstack/ai-solid', () => ({
  useChat: (options: unknown) => {
    captured.options = options
    return {}
  },
}))

import {useChatSession} from '../src/use-chat-session.js'

describe('useChatSession', () => {
  it('uses TanStack AI native FIFO queuing', () => {
    useChatSession({rpc: {} as RpcClient, sessionId: 'session-1'})

    expect(captured.options).toMatchObject({
      queue: {whenBusy: 'queue', drain: 'fifo'},
    })
  })

  it('accepts TanStack AI batch queue configuration', () => {
    useChatSession({
      rpc: {} as RpcClient,
      sessionId: 'session-1',
      queue: {whenBusy: 'queue', drain: 'batch'},
    })

    expect(captured.options).toMatchObject({
      queue: {whenBusy: 'queue', drain: 'batch'},
    })
  })
})
