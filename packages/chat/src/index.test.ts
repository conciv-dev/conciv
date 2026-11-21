import {describe, expect, it} from 'vitest'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'

describe('stopping', () => {
  it('the user stops a held reply and the turn ends', async () => {
    const engine = await createEngine()
    await engine.reply(TestLLM.hangAfter())
    const gate = await engine.gate()
    const interrupted = await engine.event('session.execution.interrupted')

    const sent = engine.session.send('Write a long story')
    await gate.started
    await gate.release()
    await engine.session.stop()

    await expect(sent).resolves.toBeUndefined()
    await expect(interrupted.arrived).resolves.toMatchObject({data: {reason: 'user'}})
  })

  it('a stop sent before the run starts ends it', async () => {
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Never shown', 'early'))
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
  it("a new message ends the session's running turn", async () => {
    const engine = await createEngine()
    await engine.reply(TestLLM.hangAfter(), TestLLM.text('Here is the second answer', 'second'))
    const gate = await engine.gate()

    const first = engine.session.send('Write a long story')
    await gate.started
    await gate.release()
    await engine.session.send('Never mind, say hi')

    await expect(first).resolves.toBeUndefined()
    expect(await engine.requests()).toHaveLength(2)
  })

  it('a turn still preparing its prompt when a new message comes ends without ending the new one', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/turn-holder']})
    await engine.reply(TestLLM.text('Here is the second answer', 'second'))
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
  it("the turn rejects with the model's error", async () => {
    const engine = await createEngine()
    await engine.reply(TestLLM.failAfter(new Error('the model is overloaded')))

    await expect(engine.session.send('Hello')).rejects.toThrow('the model is overloaded')
  })
})

describe('run limits', () => {
  it('a turn whose agent never starts fails with the start limit', async () => {
    const engine = await createEngine({}, {timeouts: {firstStartTimeoutMs: 500}})
    await engine.reply(TestLLM.text('Too late', 'late'))
    await engine.gate()

    await expect(engine.session.send('Hello')).rejects.toThrow('the agent did not start within 1s')
  })

  it('a turn whose agent never speaks fails with the output limit', async () => {
    const engine = await createEngine({}, {timeouts: {firstChunkTimeoutMs: 500}})
    await engine.reply(TestLLM.hangAfter())

    await expect(engine.session.send('Hello')).rejects.toThrow('the agent produced no output within 1s')
  })
})
