import {describe, expect} from 'vitest'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {test} from '../test/rpc-test.js'

describe('a conversation', () => {
  test('the user sends two messages and the second request carries the first', async () => {
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Hello Ada'), TestLLM.text('You said your name is Ada'))

    await engine.session.send('My name is Ada')
    await engine.session.send('What is my name?')

    const [, second] = await engine.requests()
    expect(second?.messages).toMatchObject([
      {role: 'user', content: 'My name is Ada'},
      {role: 'assistant', content: 'Hello Ada'},
      {role: 'user', content: 'What is my name?'},
    ])
  })

  test('an empty message is refused', async () => {
    const engine = await createEngine()

    await expect(engine.session.send('')).rejects.toThrow('the message is empty')
    expect(await engine.requests()).toEqual([])
  })

  test.each([
    {prompt: 'default', systemPrompt: undefined, first: expect.stringMatching(/^You are the conciv chat agent/)},
    {prompt: 'custom', systemPrompt: 'You are a pirate', first: 'You are a pirate'},
    {prompt: 'off', systemPrompt: false, first: expect.stringMatching(/^# Code Mode/)},
  ])('the configured system prompt reaches the agent: $prompt', async ({systemPrompt, first}) => {
    const engine = await createEngine({systemPrompt})
    await engine.reply(TestLLM.text('Ahoy'))

    await engine.session.send('Hello')

    const [request] = await engine.requests()
    expect(request?.system[0]).toEqual(first)
  })
})

describe('plugin hooks', () => {
  test("a plugin's prompt and context hooks change the request the agent gets", async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/request-shaper']})
    await engine.reply(TestLLM.text('Bonjour'))

    await engine.session.send('Hello')

    const [request] = await engine.requests()
    expect(request?.system).toContain('Answer in French')
    expect(request?.messages).toMatchObject([
      {role: 'user', content: [{type: 'text', content: 'Hello, rewritten by the plugin'}]},
      {role: 'user', content: 'The plugin was here'},
    ])
    expect(request?.tools).toContainEqual(
      expect.objectContaining({name: 'execute_typescript', description: 'Run a program the plugin allows'}),
    )
  })
})

describe('the session', () => {
  test('the first message titles the session and a later one leaves the title', async ({connect}) => {
    const engine = await createEngine()
    const rpc = connect(engine)
    await engine.reply(TestLLM.text('Lisbon is lovely'), TestLLM.text('Booked'))

    await engine.session.send('Plan a trip to Lisbon')
    await engine.session.send('And book a hotel')

    await expect(rpc.sessions.get({sessionId: engine.session.id})).resolves.toMatchObject({
      title: 'Plan a trip to Lisbon',
    })
  })

  test('deleting a session with a running reply ends the run, drops its draft and tells plugins', async ({connect}) => {
    const engine = await createEngine()
    const sessionId = engine.session.id
    const rpc = connect(engine)
    await engine.reply(TestLLM.hang())
    const gate = await engine.gate()
    const deleted = await engine.event('session.deleted')

    const sent = engine.session.send('Write a long story')
    await gate.started
    await rpc.drafts.set({
      sessionId,
      text: 'A half-written note',
      selectionStart: 0,
      selectionEnd: 0,
      updatedAt: Date.now(),
    })
    await gate.release()
    await rpc.sessions.delete({sessionId})

    await expect(sent).resolves.toBeUndefined()
    await expect(deleted.arrived).resolves.toMatchObject({data: {sessionID: sessionId}})
    await expect(rpc.drafts.get({sessionId})).resolves.toBeNull()
  })

  test('a finished turn records its token usage on the session', async ({connect}) => {
    const engine = await createEngine()
    const rpc = connect(engine)
    await engine.reply(TestLLM.text('Hello there, how can I help?'))

    await engine.session.send('Hello')

    const session = await rpc.sessions.get({sessionId: engine.session.id})
    expect(session.usage?.inputTokens).toBeGreaterThan(0)
    expect(session.usage?.outputTokens).toBeGreaterThan(0)
  })
})

describe('model and harness', () => {
  test('the model and effort the user picked reach the next request', async ({connect}) => {
    const engine = await createEngine()
    const sessionId = engine.session.id
    const rpc = connect(engine)
    await engine.reply(TestLLM.text('Thinking hard'))

    await rpc.sessions.model({sessionId, model: 'sonnet'})
    await rpc.sessions.effort({sessionId, effort: 'high'})
    await engine.session.send('Hello')

    const [request] = await engine.requests()
    expect(request).toMatchObject({model: 'sonnet', effort: 'high'})
  })

  test('a session switched to another harness sends its next turn there with the whole history', async ({connect}) => {
    const engine = await createEngine(
      {},
      {harnesses: [{id: 'engine'}, {id: 'second', models: [{id: 'gpt-6', name: 'GPT 6'}]}]},
    )
    const sessionId = engine.session.id
    const rpc = connect(engine)
    await engine.reply(TestLLM.text('Hello Ada'), TestLLM.text('You said your name is Ada'))

    await engine.session.send('My name is Ada')
    await rpc.sessions.switchHarness({sessionId, harnessId: 'second', model: 'gpt-6'})
    await engine.session.send('What is my name?')

    const [, second] = await engine.requests()
    expect(second?.model).toBe('gpt-6')
    expect(second?.messages).toMatchObject([
      {role: 'user', content: 'My name is Ada'},
      {role: 'assistant', content: 'Hello Ada'},
      {role: 'user', content: 'What is my name?'},
    ])
  })
})
