import {describe, expect, test} from 'vitest'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'

describe('sessions and events', () => {
  test('the experimental.idle hook runs once a turn has ended', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/session-watcher']})
    await engine.reply(TestLLM.text('Done'))

    await engine.session.send('Do it')

    expect(await engine.session.tool('idle_session').call({})).toEqual({sessionId: engine.session.id})
  })

  test('a plugin creates a session and lists it beside the sessions the user made, and renames its own session and reads it back', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/session-watcher']})
    const other = await engine.newSession('Second')
    expect(await engine.session.tool('session_rename').call({title: 'Launch plan'})).toEqual({title: 'Launch plan'})

    const created = await engine.session.tool('session_create').call({title: 'From the plugin'})

    expect(created).toEqual({id: expect.any(String), title: 'From the plugin'})
    expect(await engine.session.tool('session_list').call({})).toEqual({
      sessions: expect.arrayContaining([
        {id: engine.session.id, title: 'Launch plan'},
        {id: other.id, title: 'Second'},
        created,
      ]),
    })
  })

  test('a plugin subscribed to an event type receives it when a session is created, and hears each run start and end', async () => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/session-watcher']})

    const watched = await engine.newSession('Watched')

    expect(await engine.session.tool('created_session').call({sessionID: watched.id})).toEqual({
      event: {sessionID: watched.id},
    })

    await engine.reply(TestLLM.text('First answer'))
    await engine.session.send('one')
    await engine.reply(TestLLM.failAfter(new Error('the model is down')))
    await expect(engine.session.send('two')).rejects.toThrow('the model is down')
    const gate = await engine.gate()
    await engine.reply(TestLLM.text('Never shown'))
    const held = engine.session.send('three')
    await gate.started
    await engine.session.stop()
    await held

    expect(await engine.session.tool('runs_heard').call({count: 6})).toEqual({
      heard: [
        'session.execution.started',
        'session.execution.succeeded',
        'session.execution.started',
        'session.execution.failed',
        'session.execution.started',
        'session.execution.interrupted',
      ],
    })
  })
})
