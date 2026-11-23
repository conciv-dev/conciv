import {describe} from 'vitest'
import {makeRpcClient} from '@conciv/contract'
import {createEngine} from '@conciv/plugin-testkit'
import {CONCIV_CLIENT_HEADER, CONCIV_ORIGIN_HEADER, CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {test} from '../../../test/engine-test.js'

describe.concurrent('outside agents', () => {
  test("an outside agent that is disconnected from conciv is refused, and a connected one can't answer an ask, connect agents, read the event stream, use plugin routes or the session terminal", async ({
    expect,
  }) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/desk']})
    const outside = makeRpcClient(engine.address.apiBase, {
      headers: {
        [CONCIV_ORIGIN_HEADER]: 'hub',
        [CONCIV_CLIENT_HEADER]: 'terminal',
        [CONCIV_SESSION_HEADER]: engine.session.id,
      },
    })
    const refused = (message: string) => ({code: 'APPROVAL_DENIED', message})

    expect(await engine.outside({client: 'codex'}).call('desk_echo', {text: 'Hello'})).toMatchObject({
      isError: true,
      content: [{type: 'text', text: expect.stringContaining('Codex is disconnected from conciv')}],
    })
    await expect(outside.chat.permissionDecision({approvalId: 'approval-1', reply: 'once'})).rejects.toMatchObject(
      refused("outside agents can't answer permission requests; decide it in the tab"),
    )
    await expect(outside.meta.connectHub({harness: 'claude'})).rejects.toMatchObject(
      refused("outside agents can't connect or disconnect agents; do it in the tab"),
    )
    await expect(outside.event.subscribe()).rejects.toMatchObject(
      refused("outside agents can't read the engine's event stream"),
    )
    await expect(outside.plugin.list()).rejects.toMatchObject(
      refused("outside agents can't use plugin routes; use the plugin in the tab"),
    )
    await expect(outside.experimental.persistentPty.create({sessionId: engine.session.id})).rejects.toMatchObject(
      refused("outside agents can't use the session terminal; use it in the tab"),
    )
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
    const opener = makeRpcClient(engine.address.apiBase, {headers: {origin: 'http://localhost:5173'}})
    const stranger = makeRpcClient(engine.address.apiBase, {headers: {origin: 'http://127.0.0.1:5174'}})

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
