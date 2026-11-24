import {describe, test} from 'vitest'
import {TestLLM} from '@conciv/harness-testkit'
import {createEngine} from '../../engine.js'

describe.concurrent('what the model is given', () => {
  test('the code-mode preface with the plugin tools reaches the model as a system prompt', async ({expect}) => {
    const engine = await createEngine({plugins: ['./test/plugin-host/fixtures/plugins/greeter-promise']})
    await engine.reply(TestLLM.text('Hello'))

    await engine.session.send('Hi')

    expect((await engine.requests())[0]?.system).toEqual(
      expect.arrayContaining([expect.stringMatching(/# Code Mode[\s\S]*\/\/ Greet someone from the Promise entry/)]),
    )
  })

  test('a session instruction entry reaches the model, a changed value supersedes it and a removed one is dropped', async ({
    expect,
  }) => {
    const engine = await createEngine({plugins: ['./test/plugin-host/fixtures/plugins/instruction-notes']})
    await engine.reply(TestLLM.text('Noted'), TestLLM.text('Noted again'), TestLLM.text('Dropped'))
    const metric = '<context key="units">\nUse metric units\n</context>'
    const imperial = '<context key="units">\nUse imperial units\n</context>'

    await engine.session.tool('note_put').call({value: 'Use metric units'})
    await engine.session.send('First')
    await engine.session.tool('note_put').call({value: 'Use imperial units'})
    await engine.session.send('Second')
    await engine.session.tool('note_remove').call({})
    await engine.session.send('Third')

    const [first, second, third] = await engine.requests()
    expect(first?.system).toEqual(expect.arrayContaining([expect.stringContaining(metric)]))
    expect(second?.system).toEqual(expect.arrayContaining([expect.stringContaining(imperial)]))
    expect(second?.system).toEqual(expect.not.arrayContaining([expect.stringContaining(metric)]))
    expect(third?.system).toEqual(expect.not.arrayContaining([expect.stringContaining('<context key="units">')]))
  })

  test('on a harness that resumes its own session, the first value stays in the system prompt, a change rides on the next message and a removal is taken back on the one after', async ({
    expect,
  }) => {
    const engine = await createEngine(
      {plugins: ['./test/plugin-host/fixtures/plugins/instruction-notes']},
      {harnesses: [{id: 'engine', sessions: []}]},
    )
    await engine.reply(TestLLM.text('Noted'), TestLLM.text('Noted again'), TestLLM.text('Dropped'))

    await engine.session.tool('note_put').call({value: 'Use metric units'})
    await engine.session.send('First')
    await engine.session.tool('note_put').call({value: 'Use imperial units'})
    await engine.session.send('Second')
    await engine.session.tool('note_remove').call({})
    await engine.session.send('Third')

    const [, second, third] = await engine.requests()
    expect(second?.system).toEqual(expect.arrayContaining([expect.stringContaining('Use metric units')]))
    expect(second?.system).toEqual(expect.not.arrayContaining([expect.stringContaining('Use imperial units')]))
    expect(second?.messages.at(-1)).toEqual(
      expect.objectContaining({
        role: 'user',
        content: expect.arrayContaining([
          expect.objectContaining({type: 'text', content: expect.stringContaining('Use imperial units')}),
        ]),
      }),
    )
    expect(third?.messages.at(-1)).toEqual(
      expect.objectContaining({
        role: 'user',
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            content: expect.stringContaining('The context under "units" no longer applies. Disregard it.'),
          }),
        ]),
      }),
    )
  })

  test("the prompt hook changes the user's message, and the context hook edits the system prompts, messages, model options and tools the model gets", async ({
    expect,
  }) => {
    const engine = await createEngine({plugins: ['./test/plugin-host/fixtures/plugins/request-shaper']})
    await engine.reply(TestLLM.text('Hello'))

    await engine.session.send('Hello')

    const [request] = await engine.requests()
    expect(request?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({role: 'user', content: [{type: 'text', content: 'Hello, from the prompt hook'}]}),
      ]),
    )
    expect(request?.system).toEqual(expect.arrayContaining(['Answer in one short sentence.']))
    expect(request?.messages.at(-1)).toEqual(
      expect.objectContaining({role: 'user', content: 'Reminder from the context hook.'}),
    )
    expect(request?.options).toEqual(expect.objectContaining({temperature: 0.2}))
    expect(request?.tools).toEqual(
      expect.arrayContaining([
        {
          name: 'shaped_tool',
          description: 'Looks up a topic, shaped by the context hook',
          inputSchema: {
            type: 'object',
            properties: {topic: {type: 'string'}, depth: {type: 'number'}},
            required: ['topic'],
          },
        },
      ]),
    )
    expect(request?.tools).toEqual(expect.not.arrayContaining([expect.objectContaining({name: 'hidden_tool'})]))
  })
})
