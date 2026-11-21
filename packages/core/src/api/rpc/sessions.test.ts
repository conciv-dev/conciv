import {join} from 'node:path'
import {createRouterClient, type RouterClient} from '@orpc/server'
import {describe, expect, test as base, vi} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'
import {start, type Engine} from '../../start.js'
import {readEngineRouter} from './engine-router.js'

const test = base.extend<{engine: Engine; client: RouterClient<ReturnType<typeof readEngineRouter>>}>({
  engine: async ({task: _task}, use) => {
    const root = tempDir('sessions-')
    const engine = await start({
      options: {stateRoot: root},
      root,
      homeDir: join(root, 'home'),
      devEndpointDir: join(root, 'dev-endpoint'),
      launchEditor: () => {},
      print: () => {},
    })
    await use(engine)
    await engine.stop()
  },
  client: async ({engine}, use) => {
    await use(
      createRouterClient(readEngineRouter(engine), {
        context: {origin: `http://127.0.0.1:${engine.port}`, callerOrigin: null, headers: {}},
      }),
    )
  },
})

describe('sessions', () => {
  test('the list answers the newest session first, a page at a time', async ({client}) => {
    vi.useFakeTimers({toFake: ['Date'], now: 1_000})
    const oldest = await client.sessions.create({})
    vi.setSystemTime(2_000)
    const middle = await client.sessions.create({})
    vi.setSystemTime(3_000)
    const newest = await client.sessions.create({})
    vi.useRealTimers()
    const first = await client.sessions.list({limit: 2})
    const second = await client.sessions.list({limit: 2, cursor: first.next})

    expect(first.sessions.map((session) => session.id)).toEqual([newest.sessionId, middle.sessionId])
    expect(second.sessions.map((session) => session.id)).toEqual([oldest.sessionId])
    expect(second.next).toBeNull()
  })

  test('get answers a renamed session with its title cleaned, and refuses an unknown id', async ({client}) => {
    const {sessionId} = await client.sessions.create({})
    await client.sessions.rename({sessionId, title: '  Plan  the\u0007 trip\n'})

    await expect(client.sessions.get({sessionId})).resolves.toMatchObject({
      id: sessionId,
      title: 'Plan the trip',
    })
    await expect(client.sessions.get({sessionId: 'conciv_00000000-0000-4000-8000-000000000000'})).rejects.toThrow(
      expect.objectContaining({code: 'NOT_FOUND'}),
    )
  })

  test('a deleted session leaves the list and refuses a new turn and a compact, and restore brings it back', async ({
    client,
  }) => {
    const {sessionId} = await client.sessions.create({})
    await client.sessions.delete({sessionId})
    const afterDelete = await client.sessions.list({})
    const turn = await client.chat.send({
      sessionId,
      runId: 'run-after-delete',
      messages: [{id: 'message-1', role: 'user', content: 'Hello'}],
    })
    const events: ChatEvent[] = []
    for await (const event of turn) events.push(event)
    await expect(client.sessions.compact({sessionId})).rejects.toThrow(expect.objectContaining({code: 'NOT_FOUND'}))
    await client.sessions.restore({sessionId})
    const afterRestore = await client.sessions.list({})

    expect(afterDelete.sessions.map((session) => session.id)).not.toContain(sessionId)
    expect(events).toContainEqual(expect.objectContaining({type: 'RUN_ERROR', code: 'session_deleted'}))
    expect(afterRestore.sessions.map((session) => session.id)).toContain(sessionId)
  })
})
