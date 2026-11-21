import {describe, expect, it} from 'vitest'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'

describe('a conversation', () => {
  it('the user sends two messages and the second request carries the first', async () => {
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Hello Ada', 'first'), TestLLM.text('You said your name is Ada', 'second'))

    await engine.session.send('My name is Ada')
    await engine.session.send('What is my name?')

    const [, second] = await engine.requests()
    expect(second?.messages).toMatchObject([
      {role: 'user', content: 'My name is Ada'},
      {role: 'assistant', content: 'Hello Ada'},
      {role: 'user', content: 'What is my name?'},
    ])
  })

  it('an empty message is refused', async () => {
    const engine = await createEngine()

    await expect(engine.session.send('')).rejects.toThrow('the message is empty')
    expect(await engine.requests()).toEqual([])
  })

  it.each([
    {prompt: 'default', systemPrompt: undefined, first: expect.stringMatching(/^You are the conciv chat agent/)},
    {prompt: 'custom', systemPrompt: 'You are a pirate', first: 'You are a pirate'},
    {prompt: 'off', systemPrompt: false, first: expect.stringMatching(/^# Code Mode/)},
  ])('the configured system prompt reaches the agent: $prompt', async ({systemPrompt, first}) => {
    const engine = await createEngine({systemPrompt})
    await engine.reply(TestLLM.text('Ahoy', 'reply'))

    await engine.session.send('Hello')

    const [request] = await engine.requests()
    expect(request?.system[0]).toEqual(first)
  })
})
