import {describe} from 'vitest'
import {makeRpcClient} from '@conciv/contract'
import {approvalRequestedEvent, ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {createEngine} from '@conciv/plugin-testkit'
import {test} from '../../../test/engine-test.js'

describe.concurrent('outside agents', () => {
  const readThrough = async (
    events: AsyncIterator<ChatEvent>,
    last: (chunk: ChatEvent) => boolean,
    read: ChatEvent[] = [],
  ): Promise<ChatEvent[]> => {
    const next = await events.next()
    if (next.done === true) return read
    if (last(next.value)) return [...read, next.value]
    return readThrough(events, last, [...read, next.value])
  }

  test('a panel that opens while an outside call runs finds the call so far in history and the rest live', async ({
    connect,
    expect,
  }) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/asking-notes'], hubAccess: 'open'})
    const rpc = connect(engine)
    const early = (await rpc.chat.events({sessionId: engine.session.id}))[Symbol.asyncIterator]()

    const called = engine.outside({tab: engine.session.id}).call('notes_publish', {title: 'Launch plan'})
    await readThrough(early, (chunk) => approvalRequestedEvent.parse(chunk) !== null)
    const late = (await rpc.chat.events({sessionId: engine.session.id}))[Symbol.asyncIterator]()
    const during = await rpc.chat.hydrate({sessionId: engine.session.id})
    await engine.session.approve()
    await called
    const seen = await readThrough(late, (chunk) => chunk.type === ChatEventType.RUN_FINISHED)
    const after = await rpc.chat.hydrate({sessionId: engine.session.id})

    expect(during.messages).toEqual([
      expect.objectContaining({
        id: after.messages[0]?.id,
        parts: expect.arrayContaining([expect.objectContaining({type: 'tool-call', name: 'execute_typescript'})]),
      }),
    ])
    expect(after.messages).toEqual([expect.objectContaining({role: 'assistant'})])
    expect(seen).toContainEqual(
      expect.objectContaining({type: ChatEventType.TOOL_CALL_RESULT, content: expect.stringContaining('Launch plan')}),
    )
  })

  test('an outside agent that is disconnected from conciv is refused', async ({expect}) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/desk']})

    expect(await engine.outside({client: 'codex'}).call('desk_echo', {text: 'Hello'})).toMatchObject({
      isError: true,
      content: [{type: 'text', text: expect.stringContaining('Codex is disconnected from conciv')}],
    })
  })

  test('with project access a call into a session waits until the user allows it', async ({expect}) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/desk'], hubAccess: 'project'})

    const called = engine.outside({tab: engine.session.id}).call('desk_echo', {text: 'Hello'})
    await engine.session.approve()

    expect(await called).toEqual({
      content: [expect.objectContaining({type: 'text', text: expect.stringContaining('Hello')})],
    })
  })

  test('with open access a call into a session runs without asking', async ({expect}) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/desk'], hubAccess: 'open'})

    expect(await engine.outside({tab: engine.session.id}).call('desk_echo', {text: 'Hello'})).toEqual({
      content: [expect.objectContaining({type: 'text', text: expect.stringContaining('Hello')})],
    })
  })
})

describe.concurrent('harness listing', () => {
  test('the harness menu lists every harness of the engine with its models, the default first', async ({
    connect,
    expect,
  }) => {
    const engine = await createEngine(
      {},
      {
        harnesses: [
          {id: 'claude', models: [{id: 'opus', name: 'Opus 5.5'}]},
          {id: 'codex', models: [{id: 'gpt-5.6-sol', name: 'GPT 5.6 Sol'}]},
        ],
      },
    )

    await expect(connect(engine).meta.harnesses()).resolves.toMatchObject({
      defaultHarness: 'claude',
      harnesses: [
        {id: 'claude', models: [expect.objectContaining({id: 'opus'})], modelsFailed: false},
        {id: 'codex', models: [expect.objectContaining({id: 'gpt-5.6-sol'})], modelsFailed: false},
      ],
    })
  })
})

describe.concurrent('tool registry', () => {
  test('a call naming no registered tool is refused with UNKNOWN_TOOL', async ({connect, expect}) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/desk']})
    const rpc = connect(engine)

    await expect(rpc.registry.call({name: 'desk_missing', input: {}})).rejects.toMatchObject({
      code: 'UNKNOWN_TOOL',
      message: 'no registered tool answers to that name',
    })
  })
})

describe.concurrent('outside agent CLIs', () => {
  test("an agent CLI on the engine's PATH is offered, connects to conciv, and disconnects", async ({
    connect,
    agentPath,
    expect,
  }) => {
    const engine = await createEngine({}, {env: {PATH: agentPath(['claude'])}})
    const rpc = connect(engine)
    const listings = (await rpc.meta.hubAgents())[Symbol.asyncIterator]()

    expect((await listings.next()).value).toMatchObject({
      installs: [expect.objectContaining({harnessId: 'claude'})],
      connections: [],
    })
    await expect(rpc.meta.connectHub({harness: 'claude'})).resolves.toMatchObject({ok: true})
    expect((await listings.next()).value).toMatchObject({
      installs: [],
      connections: [expect.objectContaining({harnessId: 'claude'})],
    })
    await expect(rpc.meta.disconnectHub({harness: 'claude'})).resolves.toMatchObject({ok: true})
    expect((await listings.next()).value).toMatchObject({
      installs: [expect.objectContaining({harnessId: 'claude'})],
      connections: [],
    })
  })
})

describe.concurrent('terminal access', () => {
  test('a terminal opened from one origin answers that origin and is unknown to another', async ({expect}) => {
    const engine = await createEngine()
    const opener = makeRpcClient(engine.address.apiBase, {
      token: engine.address.token,
      headers: {origin: 'http://localhost:5173'},
    })
    const stranger = makeRpcClient(engine.address.apiBase, {
      token: engine.address.token,
      headers: {origin: 'http://127.0.0.1:5174'},
    })

    const pty = await opener.experimental.persistentPty.create({sessionId: engine.session.id})

    await expect(opener.experimental.persistentPty.resize({ptyId: pty.id, cols: 100, rows: 30})).resolves.toEqual({
      ok: true,
    })
    await expect(
      stranger.experimental.persistentPty.resize({ptyId: pty.id, cols: 100, rows: 30}),
    ).rejects.toMatchObject({code: 'PTY_NOT_FOUND', message: 'no terminal with that id'})
    await expect(stranger.experimental.persistentPty.create({sessionId: engine.session.id})).resolves.toMatchObject({
      id: pty.id,
    })
    await expect(stranger.experimental.persistentPty.resize({ptyId: pty.id, cols: 100, rows: 30})).resolves.toEqual({
      ok: true,
    })
  })
})
