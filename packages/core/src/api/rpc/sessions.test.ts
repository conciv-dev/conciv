import {describe, expect, vi} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {createEngine} from '@conciv/plugin-testkit'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'
import {test} from '../../../test/engine-test.js'

describe('sessions', () => {
  test('the list answers the newest session first, a page at a time', async ({client, fakeTimers}) => {
    fakeTimers({toFake: ['Date'], now: 1_000})
    const oldest = await client.sessions.create({})
    vi.setSystemTime(2_000)
    const middle = await client.sessions.create({})
    vi.setSystemTime(3_000)
    const newest = await client.sessions.create({})
    const first = await client.sessions.list({limit: 2})
    const second = await client.sessions.list({limit: 2, cursor: first.next})

    expect(first.sessions.map((session) => session.id)).toEqual([newest.sessionId, middle.sessionId])
    expect(second.sessions.map((session) => session.id)).toEqual([oldest.sessionId])
    expect(second.next).toBeNull()
  })

  test('a rename reaches the event stream and get answers the title cleaned, and an unknown id is refused', async ({
    client,
  }) => {
    const {sessionId} = await client.sessions.create({})
    const events = (await client.event.subscribe({types: ['session.renamed']}))[Symbol.asyncIterator]()
    await events.next()
    await client.sessions.rename({sessionId, title: '  Plan  the\u0007 trip\n'})

    await expect(events.next()).resolves.toMatchObject({
      value: {type: 'session.renamed', data: {sessionID: sessionId, title: 'Plan the trip'}},
    })
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

  test('an empty session is swept when the engine starts again, and a session with a typed draft keeps it', async ({
    launch,
  }) => {
    const root = tempDir('sweep-')
    const first = await launch(root)
    const empty = await first.sessions.create({})
    const drafted = await first.sessions.create({})
    await first.drafts.set({
      sessionId: drafted.sessionId,
      text: 'Plan the trip',
      selectionStart: 13,
      selectionEnd: 13,
      updatedAt: 1_000,
    })

    const second = await launch(root)
    const listed = (await second.sessions.list({})).sessions.map((session) => session.id)

    expect(listed).not.toContain(empty.sessionId)
    expect(listed).toContain(drafted.sessionId)
    await expect(second.drafts.get({sessionId: drafted.sessionId})).resolves.toMatchObject({text: 'Plan the trip'})
  })
})

describe('native sessions', () => {
  test('a past CLI session is found by what was said in it, with the command that resumes it', async ({connect}) => {
    const otherProject = tempDir('other-project-')
    const engine = await createEngine(
      {},
      {
        harnesses: [
          {
            id: 'engine',
            sessions: [
              {
                id: 'past-login',
                cwd: otherProject,
                derivedTitle: 'Fix the login form',
                updatedAt: 1_000,
                messages: [
                  {id: 'm1', role: 'user', parts: [{type: 'text', content: 'the submit button throws a stacktrace'}]},
                  {id: 'm2', role: 'assistant', parts: [{type: 'text', content: 'The token expired'}]},
                ],
              },
            ],
          },
        ],
      },
    )
    const client = connect(engine)
    const versions = (await client.sessions.changes())[Symbol.asyncIterator]()
    await versions.next()

    await client.sessions.list({})
    await client.sessions.search({term: 'stacktrace', everywhere: true})
    await versions.next()
    await versions.next()
    const found = await client.sessions.search({term: 'stacktrace', everywhere: true})

    expect(found.sessions).toEqual([
      expect.objectContaining({
        title: 'Fix the login form',
        excerpt: expect.stringContaining('stacktrace'),
        resume: `cd '${otherProject}' && 'engine' 'past-login'`,
      }),
    ])
  })
})
