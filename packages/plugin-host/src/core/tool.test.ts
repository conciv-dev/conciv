import {describe, expect, test} from 'vitest'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'

describe('plugin tools', () => {
  test('a tool the model names but nobody offers answers that no such tool is available', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/toolbox']})
    await engine.reply(TestLLM.toolCall('c1', 'nope', {}), TestLLM.text('Recovered'))

    await engine.session.send('Call nope')

    expect((await engine.requests())[1]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          toolCallId: 'c1',
          content: expect.stringContaining('is currently available. Please use a tool from the available tool list.'),
        }),
      ]),
    )
  })

  test.each([
    [{length: 'two', unit: 'cm'}, 'length'],
    [{length: 2, unit: 'mm'}, 'unit'],
  ])('a call with input %j fails and names the field %s', async (input, field) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/toolbox']})

    const failure = await engine.session.tool('measure').failure(input)

    expect(JSON.parse(failure.message)).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          message: expect.stringContaining(`Invalid arguments for tool "measure":\n- ${field}: `),
        }),
      }),
    )
  })

  test('a tool with an invalid name or the reserved name execute is refused at load and the other tools still answer', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/toolbox']})
    await engine.reply(TestLLM.text('Ready'))

    expect(await engine.session.tool('measure').call({length: 2, unit: 'in'})).toEqual({text: 'measured 2 in'})
    await engine.session.send('What can you call?')

    const offered = (await engine.requests())[0]?.tools
    expect(offered).toEqual(expect.arrayContaining([expect.objectContaining({name: 'measure_direct'})]))
    expect(offered).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({name: 'bad-name'}),
        expect.objectContaining({name: 'execute'}),
      ]),
    )
  })

  test('an outside agent calls a tool that is not in code mode by its own name', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/toolbox']})

    expect(await engine.session.tool('measure_direct').call({length: 3})).toEqual({text: 'measured 3 cm'})
  })
})

describe('an outside agent', () => {
  test('discover_tools describes a plugin tool by name', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/toolbox']})

    expect(await engine.outside().discover(['measure'])).toEqual({
      content: [{type: 'text', text: expect.stringContaining('Measure a length in centimetres or inches')}],
    })
  })
})

describe('the model calls a plugin tool', () => {
  test('the tool is offered by its own name and its result reaches the next request', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/toolbox']})
    await engine.reply(TestLLM.toolCall('c1', 'measure_direct', {length: 2}), TestLLM.text('It is 2 cm'))

    await engine.session.send('How long is it?')

    const [first, second] = await engine.requests()
    expect(first?.tools).toEqual(expect.arrayContaining([expect.objectContaining({name: 'measure_direct'})]))
    expect(second?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({role: 'tool', toolCallId: 'c1', content: expect.stringContaining('measured 2 cm')}),
      ]),
    )
  })

  test('a tool that throws hands its error text to the model', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/toolbox']})
    await engine.reply(TestLLM.toolCall('c1', 'explode', {}), TestLLM.text('Sorry'))

    await engine.session.send('Measure it')

    expect((await engine.requests())[1]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          toolCallId: 'c1',
          content: expect.stringContaining('The ruler snapped'),
        }),
      ]),
    )
  })

  test('the execute.before hook changes the input and the execute.after hook changes the result', async () => {
    const engine = await createEngine({
      plugins: ['./test/fixtures/plugins/toolbox', './test/fixtures/plugins/tool-hooks'],
    })
    await engine.reply(TestLLM.toolCall('c1', 'measure_direct', {length: 2}), TestLLM.text('It is 4 cm'))

    await engine.session.send('How long is it?')

    expect((await engine.requests())[1]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          toolCallId: 'c1',
          content: expect.stringContaining('measured 4 cm, checked'),
        }),
      ]),
    )
  })

  test('Stop aborts a running tool and the model is not asked again', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/slow-tool']})
    await engine.reply(TestLLM.toolCall('c1', 'wait_for_stop', {}), TestLLM.text('Never asked'))
    const started = await engine.event('rpc.slow.started')

    const turn = engine.session.send('Wait for me')
    await started.arrived
    await engine.session.stop()
    await turn

    expect(await engine.session.tool('stop_outcome').call({})).toEqual({outcome: 'aborted'})
    expect(await engine.requests()).toHaveLength(1)
  })
})
