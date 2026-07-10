import {describe, it, expect} from 'vitest'
import {settledMessages, userText} from '../../src/chat/history.js'

const user = (id: string, text: string) => ({
  id,
  role: 'user' as const,
  parts: [{type: 'text' as const, content: text}],
})
const multiPartUser = (id: string, ...texts: string[]) => ({
  id,
  role: 'user' as const,
  parts: texts.map((content) => ({type: 'text' as const, content})),
})
const assistant = (id: string, text: string) => ({
  id,
  role: 'assistant' as const,
  parts: [{type: 'text' as const, content: text}],
})

describe('settledMessages', () => {
  it('returns everything when no turn is pending', () => {
    const messages = [user('h1', 'hi'), assistant('h2', 'hello')]
    expect(settledMessages(messages, null)).toEqual(messages)
  })

  it('drops the in-flight turn from the last matching user message onward', () => {
    const messages = [user('h1', 'hi'), assistant('h2', 'hello'), user('h3', 'do it'), assistant('h4', 'partial…')]
    expect(settledMessages(messages, 'do it')).toEqual([user('h1', 'hi'), assistant('h2', 'hello')])
  })

  it('keeps everything when the transcript has not recorded the pending message yet', () => {
    const messages = [user('h1', 'hi'), assistant('h2', 'hello')]
    expect(settledMessages(messages, 'do it')).toEqual(messages)
  })

  it('cuts at the LAST occurrence for repeated identical prompts', () => {
    const messages = [user('h1', 'go'), assistant('h2', 'done'), user('h3', 'go'), assistant('h4', 'part')]
    expect(settledMessages(messages, 'go')).toEqual([user('h1', 'go'), assistant('h2', 'done')])
  })

  it('truncates a multi-text-part user message (userText and the pending key agree on the separator)', () => {
    const pending = multiPartUser('h3', 'line a', 'line b')
    const messages = [user('h1', 'hi'), assistant('h2', 'hello'), pending, assistant('h4', 'partial…')]
    expect(settledMessages(messages, userText(pending))).toEqual([user('h1', 'hi'), assistant('h2', 'hello')])
  })
})
