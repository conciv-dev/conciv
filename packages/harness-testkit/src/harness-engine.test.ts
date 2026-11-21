import {describe, expect, test as base} from 'vitest'
import {createHarnessEngine, TestLLM, type HarnessEngine} from './harness-engine.js'

const test = base.extend<{engine: HarnessEngine}>({
  engine: async ({task: _task}, use) => {
    const engine = await createHarnessEngine()
    await use(engine)
    await engine.stop()
  },
})

describe('scripted replies', () => {
  test('each model request takes the next reply in order, and a request with none left fails its turn', async ({
    engine,
  }) => {
    await engine.reply(TestLLM.text('First answer'), TestLLM.text('Second answer'))

    await engine.session.send('one')
    await engine.session.send('two')
    await expect(engine.session.send('three')).rejects.toThrow('the scripted harness has no reply for request 3')

    expect((await engine.requests())[2]?.messages).toEqual([
      expect.objectContaining({role: 'user', content: 'one'}),
      expect.objectContaining({role: 'assistant', content: 'First answer'}),
      expect.objectContaining({role: 'user', content: 'two'}),
      expect.objectContaining({role: 'assistant', content: 'Second answer'}),
      expect.objectContaining({role: 'user', content: 'three'}),
    ])
  })
})

describe('the engine clock', () => {
  test('an engine on the real clock refuses every clock call with a plain message', async ({engine}) => {
    await expect(engine.clock.advance(Promise.resolve())).rejects.toThrow(
      "this engine runs on the real clock: make it with clock: 'test'",
    )
    await expect(engine.clock.drain()).rejects.toThrow("this engine runs on the real clock: make it with clock: 'test'")
  })
})

describe('calling a tool through code mode', () => {
  test.for(['two-words', '9lives', 'x(1)'])(
    'the tool name %s is refused before any program is built',
    async (name, {engine}) => {
      await expect(engine.session.tool(name).call({})).rejects.toThrow(
        `the tool name "${name}" is not a plain identifier`,
      )
      await expect(engine.outside().call(name, {})).rejects.toThrow(`the tool name "${name}" is not a plain identifier`)
    },
  )
})
