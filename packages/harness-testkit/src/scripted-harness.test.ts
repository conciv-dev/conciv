import {test, expect} from 'vitest'
import {makeBrowserRpcClient} from '@conciv/contract'
import {ChatEventType} from '@conciv/protocol/chat-event-types'
import {createHarnessEngine, TestLLM, type HarnessEngine, type HarnessEngineOptions} from './harness-engine.js'

type EngineRpc = ReturnType<typeof makeBrowserRpcClient>['rpc']

const engineTest = test.extend<{
  startEngine: (options?: HarnessEngineOptions) => Promise<HarnessEngine>
  connect: (engine: HarnessEngine) => EngineRpc
}>({
  startEngine: async ({task: _task}, use) => {
    const started: HarnessEngine[] = []
    await use(async (options) => {
      const engine = await createHarnessEngine(options)
      started.push(engine)
      return engine
    })
    for (const engine of started) await engine.stop()
  },
  connect: async ({task: _task}, use) => {
    const clients: Array<ReturnType<typeof makeBrowserRpcClient>> = []
    await use((engine) => {
      const client = makeBrowserRpcClient(engine.address.apiBase)
      clients.push(client)
      return client.rpc
    })
    for (const client of clients) client.close()
  },
})

engineTest(
  'the default harness lists its models and slash commands over the engine rpc',
  async ({startEngine, connect}) => {
    const engine = await startEngine()
    const rpc = connect(engine)
    const sessionId = engine.session.id

    const listed = await rpc.meta.models({sessionId})
    expect(listed.models).toEqual([
      {id: 'opus', name: 'Opus 5.5', group: 'Claude', efforts: ['low', 'medium', 'high', 'xhigh', 'max']},
      {id: 'sonnet', name: 'Sonnet 5.5', group: 'Claude', efforts: ['low', 'medium', 'high', 'xhigh', 'max']},
      {
        id: 'claude-opus-4-7',
        name: 'Opus 4.7',
        group: 'Older versions',
        efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      },
      {id: 'claude-haiku-4-5', name: 'Haiku 4.5', group: 'Older versions'},
    ])

    const {commands} = await rpc.meta.commands({sessionId})
    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({name: 'model', description: 'Set the AI model', source: 'harness'}),
        expect.objectContaining({name: 'deploy', description: 'Ship the branch', source: 'harness'}),
      ]),
    )
  },
)

engineTest('a reply that fails part-way ends the run with its error', async ({startEngine}) => {
  const engine = await startEngine({
    replies: [
      TestLLM.failAfter(
        new Error('the model went away'),
        {type: ChatEventType.TEXT_MESSAGE_START, messageId: 'text-partial', role: 'assistant'},
        {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: 'text-partial', delta: 'Partial'},
      ),
    ],
  })
  await expect(engine.session.send('start')).rejects.toThrow('the model went away')
})
