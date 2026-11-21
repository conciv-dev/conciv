import {describe, expect} from 'vitest'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {test} from '../test/rpc-test.js'

describe('stopping', () => {
  test('the user stops a held reply and the turn ends', async () => {
    const engine = await createEngine()
    await engine.reply(TestLLM.hang())
    const gate = await engine.gate()
    const interrupted = await engine.event('session.execution.interrupted')

    const sent = engine.session.send('Write a long story')
    await gate.started
    await gate.release()
    await engine.session.stop()

    await expect(sent).resolves.toBeUndefined()
    await expect(interrupted.arrived).resolves.toMatchObject({data: {reason: 'user'}})
  })

  test('a stop sent before the run starts ends it', async () => {
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Never shown'))
    const gate = await engine.gate()
    const interrupted = await engine.event('session.execution.interrupted')

    const sent = engine.session.send('Hello')
    await gate.started
    await engine.session.stop()

    await expect(sent).resolves.toBeUndefined()
    await expect(interrupted.arrived).resolves.toMatchObject({data: {reason: 'user'}})
  })
})

describe('two turns', () => {
  test("a new message ends the session's running turn", async () => {
    const engine = await createEngine()
    await engine.reply(TestLLM.hang(), TestLLM.text('Here is the second answer'))
    const gate = await engine.gate()

    const first = engine.session.send('Write a long story')
    await gate.started
    await gate.release()
    await engine.session.send('Never mind, say hi')

    await expect(first).resolves.toBeUndefined()
    expect(await engine.requests()).toHaveLength(2)
  })

  test('a turn still preparing its prompt when a new message comes ends without ending the new one', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/turn-holder']})
    await engine.reply(TestLLM.text('Here is the second answer'))
    const ended = await engine.event('session.execution.interrupted')
    const held = engine.session.tool('turn_held')
    const release = engine.session.tool('turn_release')

    const first = engine.session.send('Write a long story')
    await held.call({hook: 'prompt'})
    const second = engine.session.send('Never mind, say hi')
    await held.call({hook: 'context'})
    await release.call({hook: 'prompt'})
    await ended.arrived
    await release.call({hook: 'context'})

    await expect(first).resolves.toBeUndefined()
    await expect(second).resolves.toBeUndefined()
    const requests = await engine.requests()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.messages.at(-1)).toMatchObject({role: 'user', content: 'Never mind, say hi'})
  })
})

describe('a failed reply', () => {
  test("the turn rejects with the model's error", async () => {
    const engine = await createEngine()
    await engine.reply(TestLLM.failAfter(new Error('the model is overloaded')))

    await expect(engine.session.send('Hello')).rejects.toThrow('the model is overloaded')
  })
})

describe('run limits', () => {
  test('a turn whose agent never starts fails with the start limit', async () => {
    const engine = await createEngine({}, {timeouts: {firstStartTimeoutMs: 500}})
    await engine.reply(TestLLM.text('Too late'))
    await engine.gate()

    await expect(engine.session.send('Hello')).rejects.toThrow('the agent did not start within 1s')
  })
})

describe('compacting', () => {
  test("compacting asks the agent for a summary, and a plugin's compaction hook adds to that request", async ({
    connect,
  }) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/request-shaper']})
    const rpc = connect(engine)
    await engine.reply(TestLLM.text('Bonjour'), TestLLM.text('We said hello'))

    await engine.session.send('Hello')
    await rpc.sessions.compact({sessionId: engine.session.id})

    const [, compaction] = await engine.requests()
    expect(compaction?.system).toContain('Keep the plugin notes in the summary')
    expect(compaction?.messages.at(-1)).toEqual({
      role: 'user',
      content:
        'Summarize our conversation so far as concisely as you can: the key decisions, the current state, and any open threads, so we can continue with less context.',
    })
  })

  test("a plugin's compaction hook answers the summary and the agent is not asked", async ({connect}) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/compaction-answer']})
    const rpc = connect(engine)
    await engine.reply(TestLLM.text('Hi'))

    await engine.session.send('Hello')
    await rpc.sessions.compact({sessionId: engine.session.id})

    expect(await engine.requests()).toHaveLength(1)
    const {messages} = await rpc.chat.hydrate({sessionId: engine.session.id})
    expect(messages.at(-1)).toMatchObject({
      role: 'assistant',
      parts: expect.arrayContaining([
        expect.objectContaining({type: 'text', content: 'The user said hello and the plugin summarized it'}),
      ]),
    })
  })
})
