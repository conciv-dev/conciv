import {createSignal} from 'solid-js'
import {describe, expect, it} from 'vitest'
import type {ChatClientState} from '@tanstack/ai-client'
import {chatBusy} from '../src/store/chat-busy.js'

describe('chatBusy', () => {
  it('includes local and shared generation state', () => {
    const [status, setStatus] = createSignal<ChatClientState>('ready')
    const [sessionGenerating, setSessionGenerating] = createSignal(false)
    const chat = {status, sessionGenerating}

    expect(chatBusy(chat)).toBe(false)
    setSessionGenerating(true)
    expect(chatBusy(chat)).toBe(true)
    setSessionGenerating(false)
    setStatus('submitted')
    expect(chatBusy(chat)).toBe(true)
    setStatus('streaming')
    expect(chatBusy(chat)).toBe(true)
  })
})
