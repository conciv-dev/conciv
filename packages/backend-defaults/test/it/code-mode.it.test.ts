import {describe, expect} from 'vitest'
import {test} from '../utils/engine-test.js'
import {TestLLM} from '../utils/engine.js'

describe('offered tools', () => {
  test.for<{effect: 'allow' | 'deny'; offered: boolean}>([
    {effect: 'allow', offered: true},
    {effect: 'deny', offered: false},
  ])(
    'a plugin tool the permission rules $effect is offered to the agent: $offered',
    async ({effect, offered}, {createEngine}) => {
      const engine = await createEngine({
        plugins: ['./test/fixtures/plugins/weather'],
        permission: {weather_alerts: effect},
      })
      await engine.reply(TestLLM.text('No alerts today'))

      await engine.session.send('Any weather alerts in Lisbon?')

      const [request] = await engine.requests()
      const names = request?.tools.map((tool) => tool.name)
      expect(names).toContain('execute_typescript')
      expect(names).toContain('discover_tools')
      expect(names?.includes('weather_alerts')).toBe(offered)
    },
  )
})

describe('the agent program', () => {
  test("the agent's program calls a plugin tool, the agent gets the result and the call shows under the program", async ({
    createEngine,
    connect,
  }) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/weather']})
    const rpc = connect(engine)
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_forecast({city: 'Lisbon'})",
      }),
      TestLLM.text('It is sunny in Lisbon'),
    )

    await engine.session.send('What is the weather in Lisbon?')

    const [, second] = await engine.requests()
    expect(second?.messages.at(-1)).toMatchObject({
      role: 'tool',
      toolCallId: 'c1',
      content: expect.stringContaining('sunny'),
    })
    const {messages} = await rpc.chat.hydrate({sessionId: engine.session.id})
    expect(messages.flatMap((message) => message.parts)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({type: 'tool-call', id: 'c1', name: 'execute_typescript'}),
        expect.objectContaining({
          type: 'tool-call',
          name: expect.stringMatching(/forecast$/),
          metadata: expect.objectContaining({parentToolCallId: 'c1'}),
        }),
      ]),
    )
  })
})
