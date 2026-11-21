import {describe, expect, test} from 'vitest'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'

describe('sessions and events', () => {
  test('the experimental.idle hook runs once a turn has ended', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/session-watcher']})
    await engine.reply(TestLLM.text('Done'))

    await engine.session.send('Do it')

    expect(await engine.session.tool('idle_session').call({})).toEqual({sessionId: engine.session.id})
  })

  test('a plugin creates a session and lists it beside the sessions the user made', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/session-watcher']})
    const other = await engine.newSession('Second')

    const created = await engine.session.tool('session_create').call({title: 'From the plugin'})

    expect(created).toEqual({id: expect.any(String), title: 'From the plugin'})
    expect(await engine.session.tool('session_list').call({})).toEqual({
      sessions: expect.arrayContaining([
        expect.objectContaining({id: engine.session.id}),
        {id: other.id, title: 'Second'},
        created,
      ]),
    })
  })

  test('a plugin subscribed to an event type receives it when a session is created', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/session-watcher']})

    const watched = await engine.newSession('Watched')

    expect(await engine.session.tool('created_session').call({})).toEqual({
      event: {sessionID: watched.id, title: 'Watched'},
    })
  })
})
