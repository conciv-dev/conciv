import {describe, expect, test as base} from 'vitest'
import {makeBrowserRpcClient} from '@conciv/contract'
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

describe('past sessions given to the scripted harness', () => {
  test("the engine lists this project's past sessions and pages their preview, and lists none when none are given", async () => {
    const plain = await createHarnessEngine()
    const plainClient = makeBrowserRpcClient(plain.address.apiBase)
    const plainListed = await plainClient.rpc.sessions.list({limit: 20}).finally(() => plainClient.close())
    await plain.stop()
    expect(plainListed.sessions.map((session) => session.origin)).toEqual(['conciv'])

    const engine = await createHarnessEngine(
      {},
      {
        harnesses: [
          {
            id: 'engine',
            sessions: [
              {
                id: 'past-here',
                derivedTitle: 'Fix the login form',
                updatedAt: 1_000,
                messages: [
                  {id: 'm1', role: 'user', parts: [{type: 'text', content: 'first question'}]},
                  {id: 'm2', role: 'assistant', parts: [{type: 'text', content: 'first answer'}]},
                  {id: 'm3', role: 'user', parts: [{type: 'text', content: 'second question'}]},
                  {id: 'm4', role: 'assistant', parts: [{type: 'text', content: 'second answer'}]},
                ],
              },
              {
                id: 'past-elsewhere',
                cwd: '/elsewhere/other-app',
                derivedTitle: 'Other app',
                updatedAt: 2_000,
                messages: [],
              },
            ],
          },
        ],
      },
    )
    const client = makeBrowserRpcClient(engine.address.apiBase)
    try {
      const listed = await client.rpc.sessions.list({limit: 20})
      expect(listed.sessions.filter((session) => session.origin === 'external')).toEqual([
        expect.objectContaining({
          title: 'Fix the login form',
          native: expect.objectContaining({nativeId: 'past-here'}),
        }),
      ])

      const latest = await client.rpc.sessions.preview({
        harness: 'engine',
        nativeId: 'past-here',
        before: null,
        limit: 2,
      })
      expect(latest.messages.map((message) => message.id)).toEqual(['m3', 'm4'])
      expect(latest.earlier).not.toBeNull()

      const earlier = await client.rpc.sessions.preview({
        harness: 'engine',
        nativeId: 'past-here',
        before: latest.earlier,
        limit: 2,
      })
      expect(earlier).toEqual({
        messages: [expect.objectContaining({id: 'm1'}), expect.objectContaining({id: 'm2'})],
        earlier: null,
      })
    } finally {
      client.close()
      await engine.stop()
    }
  })
})
