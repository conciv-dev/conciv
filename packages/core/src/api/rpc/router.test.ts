import {writeFileSync} from 'node:fs'
import {delimiter, join} from 'node:path'
import {ConfigProvider} from 'effect'
import {z} from 'zod'
import {describe} from 'vitest'
import {makeRpcClient} from '@conciv/contract'
import {claude} from '@conciv/harness/claude'
import {createHarnessEngine} from '../../testing.js'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {approvalRequestedEvent, ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {CONCIV_CLIENT_HEADER, CONCIV_ORIGIN_HEADER, CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {test} from '../../../test/engine-test.js'
import {CHAT_SYSTEM_PROMPT} from '../../lib/chat-system-prompt.js'

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

  test('a panel that opens while an outside call runs, or while a reply waits on an ask, finds the work so far in history and the rest live, as one message', async ({
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

    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: "return await external_notes_publish({title: 'Release notes'})",
      }),
      TestLLM.text('The release notes are out'),
    )
    const replied = engine.session.send('Publish the release notes')
    await readThrough(early, (chunk) => approvalRequestedEvent.parse(chunk) !== null)
    const midTurn = await rpc.chat.hydrate({sessionId: engine.session.id})
    await engine.session.approve()
    await replied
    const turned = await rpc.chat.hydrate({sessionId: engine.session.id})
    const replies = turned.messages.filter((message) => message.role === 'assistant')

    expect(midTurn.messages.at(-1)).toEqual(
      expect.objectContaining({
        id: replies.at(-1)?.id,
        parts: expect.arrayContaining([expect.objectContaining({type: 'tool-call', name: 'execute_typescript'})]),
      }),
    )
    expect(replies).toHaveLength(2)
    expect(replies.at(-1)?.parts).toEqual(
      expect.arrayContaining([expect.objectContaining({type: 'text', content: 'The release notes are out'})]),
    )
  })

  test("an outside agent that is disconnected from conciv is refused, and a connected one can't answer an ask, connect agents, read the event stream, use plugin routes or the session terminal", async ({
    expect,
  }) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/desk']})
    const outside = makeRpcClient(engine.address.apiBase, {
      token: engine.address.token,
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
      refused("outside agents can't answer permission requests; decide it in the conciv panel"),
    )
    await expect(outside.meta.connectHub({harness: 'claude'})).rejects.toMatchObject(
      refused("outside agents can't connect or disconnect agents; do it in the conciv panel"),
    )
    await expect(outside.event.subscribe()).rejects.toMatchObject(
      refused("outside agents can't read the engine's event stream"),
    )
    await expect(outside.plugin.list()).rejects.toMatchObject(
      refused("outside agents can't use plugin routes; use the plugin in the conciv panel"),
    )
    await expect(outside.experimental.persistentPty.create({sessionId: engine.session.id})).rejects.toMatchObject(
      refused("outside agents can't use the session terminal; open it in the conciv panel"),
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

  test('with open access a call into a session runs without asking, as the outside agent, while the panel calls as the session agent', async ({
    connect,
    expect,
  }) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/desk'], hubAccess: 'open'})
    const hub = makeRpcClient(engine.address.apiBase, {
      token: engine.address.token,
      headers: {
        [CONCIV_ORIGIN_HEADER]: 'hub',
        [CONCIV_CLIENT_HEADER]: 'terminal',
        [CONCIV_SESSION_HEADER]: engine.session.id,
      },
    })

    expect(await engine.outside({tab: engine.session.id}).call('desk_echo', {text: 'Hello'})).toEqual({
      content: [expect.objectContaining({type: 'text', text: expect.stringContaining('Hello')})],
    })
    expect(await engine.outside({tab: engine.session.id}).call('desk_agent', {})).toEqual({
      content: [expect.objectContaining({type: 'text', text: expect.stringContaining('"agent":"outside"')})],
    })
    expect(await hub.registry.call({name: 'desk_agent', input: {}})).toEqual({agent: 'outside'})
    const ran = await hub.code.execute({
      sessionId: engine.session.id,
      typescriptCode:
        "const first = await external_desk_echo({text: 'one'}); const second = await external_desk_echo({text: 'two'}); return [first.callId, second.callId]",
    })
    const started = z.tuple([z.string(), z.string()]).parse(ran.ok ? ran.result : null)
    expect(new Set(started).size).toBe(2)
    expect(ran.toolCalls).toEqual(started)
    expect(await connect(engine).registry.call({name: 'desk_agent', input: {}})).toEqual({agent: 'build'})
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

describe('a harness whose CLI fails its model list', () => {
  test('the session models answer with the harness and say the models failed, and the menu keeps the harness with its models failed', async ({
    connect,
    expect,
  }) => {
    const bin = tempDir('failing-claude-')
    writeFileSync(join(bin, 'claude'), '#!/bin/sh\nexit 1\n', {mode: 0o755})
    const path = [bin, '/usr/bin', '/bin'].join(delimiter)
    const engine = await createHarnessEngine({}, {harness: claude(ConfigProvider.fromEnvRecord({PATH: path}))})
    try {
      const rpc = connect(engine)

      await expect(rpc.meta.models({sessionId: engine.session.id})).resolves.toMatchObject({
        models: [],
        modelsFailed: true,
        harness: {id: 'claude', persistentPty: true},
      })
      await expect(rpc.meta.harnesses()).resolves.toMatchObject({
        harnesses: [{id: 'claude', models: [], modelsFailed: true}],
      })
    } finally {
      await engine.stop()
    }
  })
})

describe.concurrent('tool registry', () => {
  test("a call naming no registered tool is refused with UNKNOWN_TOOL, and a session answers the system text its next turn sends: the base prompt, a plugin's instruction entry, the code-mode preface, and what the context hooks leave seeing the offered tools, until it is deleted", async ({
    connect,
    expect,
  }) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/desk']})
    const rpc = connect(engine)
    const sessionId = engine.session.id

    await expect(rpc.registry.call({name: 'desk_missing', input: {}})).rejects.toMatchObject({
      code: 'UNKNOWN_TOOL',
      message: 'no registered tool answers to that name',
    })

    await engine.rpc.call('desk', 'pin', {sessionId})
    const {text} = await rpc.sessions.instructions({sessionId})
    expect(text).toContain(CHAT_SYSTEM_PROMPT.split('\n')[0])
    expect(text).toContain('<context key="desk">\nThe desk keeps the notes of this session.')
    expect(text).toContain('## Code Execution Tool')
    expect(text).toMatch(/^TOOLS .*execute_typescript/m)
    expect(text.endsWith('HOOKED')).toBe(true)

    await rpc.sessions.delete({sessionId})
    await expect(rpc.sessions.instructions({sessionId})).rejects.toMatchObject({code: 'NOT_FOUND'})
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
