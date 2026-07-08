import {createRoot, createSignal} from 'solid-js'
import {describe, expect, it} from 'vitest'
import type {UseChatReturn} from '@tanstack/ai-solid'
import type {ChatClientState} from '@tanstack/ai-client'
import {guardChat} from '../src/store/chat-busy.js'

function fakeChat() {
  const [status, setStatus] = createSignal<ChatClientState>('ready')
  const [sessionGenerating, setSessionGenerating] = createSignal(false)
  const sent: string[] = []
  const reloads = {count: 0}
  const chat: UseChatReturn = {
    messages: () => [],
    sendMessage: (content) => {
      sent.push(typeof content === 'string' ? content : '[multimodal]')
      setStatus('submitted')
      return Promise.resolve()
    },
    append: () => Promise.resolve(),
    addToolResult: () => Promise.resolve(),
    addToolApprovalResponse: () => Promise.resolve(),
    reload: () => {
      reloads.count += 1
      setStatus('submitted')
      return Promise.resolve()
    },
    stop: () => setStatus('ready'),
    isLoading: () => status() !== 'ready',
    error: () => undefined,
    setMessages: () => {},
    clear: () => {},
    status,
    isSubscribed: () => true,
    connectionStatus: () => 'connected',
    sessionGenerating,
  }
  const settle = () => {
    setStatus('ready')
    setSessionGenerating(false)
  }
  return {chat, sent, reloads, setStatus, setSessionGenerating, settle}
}

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('guardChat', () => {
  it('sends immediately when idle', () => {
    createRoot((dispose) => {
      const {chat, sent} = fakeChat()
      const guarded = guardChat(chat)
      void guarded.sendMessage('hello')
      expect(sent).toEqual(['hello'])
      dispose()
    })
  })

  it('queues a send while the session is generating on another surface', async () => {
    await createRoot(async (dispose) => {
      const {chat, sent, setSessionGenerating, settle} = fakeChat()
      const guarded = guardChat(chat)
      setSessionGenerating(true)
      await flush()
      void guarded.sendMessage('later')
      expect(sent).toEqual([])
      settle()
      await flush()
      expect(sent).toEqual(['later'])
      dispose()
    })
  })

  it('flushes queued sends one at a time as each turn settles', async () => {
    await createRoot(async (dispose) => {
      const {chat, sent, setSessionGenerating, settle} = fakeChat()
      const guarded = guardChat(chat)
      setSessionGenerating(true)
      await flush()
      void guarded.sendMessage('a')
      void guarded.sendMessage('b')
      void guarded.sendMessage('c')
      expect(sent).toEqual([])
      settle()
      await flush()
      expect(sent).toEqual(['a'])
      settle()
      await flush()
      expect(sent).toEqual(['a', 'b'])
      settle()
      await flush()
      expect(sent).toEqual(['a', 'b', 'c'])
      dispose()
    })
  })

  it('reports shared busy via isBusy', async () => {
    await createRoot(async (dispose) => {
      const {chat, setSessionGenerating} = fakeChat()
      const guarded = guardChat(chat)
      expect(guarded.isBusy()).toBe(false)
      setSessionGenerating(true)
      await flush()
      expect(guarded.isBusy()).toBe(true)
      dispose()
    })
  })
})
