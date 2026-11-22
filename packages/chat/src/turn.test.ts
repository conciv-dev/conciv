import {describe, expect} from 'vitest'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'
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
    await expect(rpc.sessions.get({sessionId})).resolves.toMatchObject({harnessKind: 'second', model: 'gpt-6'})
  })
})

describe('native transcript', () => {
  test("a CLI's past session opens with its own transcript, and its next turn resumes it with only the new message", async ({
    connect,
  }) => {
    const engine = await createEngine(
      {},
      {
        harnesses: [
          {
            id: 'engine',
            sessions: [
              {
                id: 'past-login',
                cwd: '/workspace/shop',
                derivedTitle: 'Fix the login form',
                updatedAt: 1_000,
                messages: [
                  {id: 'm1', role: 'user', parts: [{type: 'text', content: 'Why does login fail?'}]},
                  {id: 'm2', role: 'assistant', parts: [{type: 'text', content: 'The token expired'}]},
                ],
              },
            ],
          },
        ],
      },
    )
    const rpc = connect(engine)
    await engine.reply(TestLLM.text('The reset link is sent by email'))

    const {sessionId} = await rpc.sessions.open({harnessKind: 'engine', cwd: '/workspace/shop', nativeId: 'past-login'})
    const imported = await rpc.chat.hydrate({sessionId})

    expect(imported.messages).toMatchObject([
      {role: 'user', parts: [expect.objectContaining({type: 'text', content: 'Why does login fail?'})]},
      {role: 'assistant', parts: [expect.objectContaining({type: 'text', content: 'The token expired'})]},
    ])

    const turn = await rpc.chat.send({
      sessionId,
      runId: 'run-resumed',
      messages: [{id: 'message-1', role: 'user', content: 'And the reset link?'}],
    })
    const events: ChatEvent[] = []
    for await (const event of turn) events.push(event)

    expect(events).toContainEqual(expect.objectContaining({type: 'RUN_FINISHED'}))
    const [request] = await engine.requests()
    expect(request?.messages).toMatchObject([{role: 'user', content: 'And the reset link?'}])
  })
})

describe('a long tool loop', () => {
  test('a turn with nine tool calls in a row runs every tool and ends with the final answer', async ({connect}) => {
    const engine = await createEngine()
    const rpc = connect(engine)
    const callIds = Array.from({length: 9}, (_, index) => `call-${index + 1}`)
    await engine.reply(
      ...callIds.map((id, index) =>
        TestLLM.toolCall(id, 'execute_typescript', {typescriptCode: `return ${index + 1}`}),
      ),
      TestLLM.text('All nine steps are done'),
    )

    await engine.session.send('Do nine steps')

    const requests = await engine.requests()
    expect(requests).toHaveLength(10)
    expect(requests.at(-1)?.messages.filter((message) => message.role === 'tool')).toMatchObject(
      callIds.map((toolCallId, index) => ({toolCallId, content: expect.stringContaining(String(index + 1))})),
    )
    const {messages} = await rpc.chat.hydrate({sessionId: engine.session.id})
    expect(messages.at(-1)?.parts.at(-1)).toMatchObject({type: 'text', content: 'All nine steps are done'})
  })
})
