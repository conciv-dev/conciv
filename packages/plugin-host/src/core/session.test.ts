import {describe, test} from 'vitest'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'

describe.concurrent('sessions and events', () => {
  test('the experimental.idle hook runs once a turn has ended', async ({expect}) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/session-watcher']})
    await engine.reply(TestLLM.text('Done'))

    await engine.session.send('Do it')

    expect(await engine.session.tool('idle_session').call({})).toEqual({sessionId: engine.session.id})
  })

  test('a plugin receives the session-created event of a session the user made, creates a session and lists it beside the sessions the user made, and renames its own session and reads it back', async ({
    expect,
  }) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/session-watcher']})
    const other = await engine.newSession('Second')
    expect(await engine.session.tool('created_session').call({sessionID: other.id})).toEqual({
      event: {sessionID: other.id},
    })
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

  test('a plugin hears each run start and end', async ({expect}) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/session-watcher']})

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

describe.concurrent('session.synthetic wakes and delivers', () => {
  test('promotes the first queued input when woken while idle', async ({expect}) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/inbox-notices']})
    await engine.reply(TestLLM.text('Done'))
    const stream = await engine.gate()

    await engine.session.tool('notice').call({text: 'Wait in queue', delivery: 'queue'})
    await stream.started
    await stream.release()

    const requests = await engine.requests()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.messages.filter((message) => message.role === 'user')).toMatchObject([
      {content: 'Wait in queue'},
    ])
  })

  test('a notice admitted with resume false starts no turn and goes in ahead of the next user message', async ({
    expect,
  }) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/inbox-notices']})
    await engine.reply(TestLLM.text('Answered'))

    await engine.session.tool('notice').call({text: 'Keep going', description: 'Continuing', resume: false})
    await engine.session.send('Start')

    const requests = await engine.requests()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.messages.filter((message) => message.role === 'user')).toMatchObject([
      {content: 'Keep going'},
      {content: 'Start'},
    ])
  })

  test('runs a follow-up when synthetic input arrives during an active run', async ({expect}) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/inbox-notices']})
    await engine.reply(TestLLM.text('Background started'), TestLLM.text('Handled completion'))
    const first = await engine.gate()
    const running = engine.session.send('Start background work')
    await first.started

    await engine.session.tool('notice').call({text: 'Background work completed'})
    const second = await engine.gate()
    await first.release()
    await running
    await second.started
    await second.release()

    const requests = await engine.requests()
    expect(requests).toHaveLength(2)
    expect(requests[1]?.messages).toContainEqual({role: 'user', content: 'Background work completed'})
  })

  test('preserves durable queued input for a later run after interruption', async ({expect}) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/inbox-notices']})
    await engine.reply(TestLLM.hang(), TestLLM.text('Resumed'), TestLLM.text('Went on'))
    const notice = engine.session.tool('notice')
    const stream = await engine.gate()
    const interrupted = await engine.event('session.execution.interrupted')
    const run = engine.session.send('Interrupt current work')
    await stream.started

    await notice.call({text: 'Run after interrupt', delivery: 'queue'})
    await stream.release()
    await engine.session.stop()
    await run
    await interrupted.arrived
    expect(await engine.requests()).toHaveLength(1)
    const resumed = await engine.gate()
    await notice.call({text: 'Go on', delivery: 'queue'})
    await resumed.started
    const next = await engine.gate()
    await resumed.release()
    await next.started
    await next.release()

    const requests = await engine.requests()
    expect(requests).toHaveLength(3)
    expect(requests.map((request) => request.messages.filter((message) => message.role === 'user'))).toMatchObject([
      [{content: 'Interrupt current work'}],
      [{content: 'Interrupt current work'}, {content: 'Run after interrupt'}],
      [{content: 'Interrupt current work'}, {content: 'Run after interrupt'}, {content: 'Go on'}],
    ])
  })

  test('promotes queued inputs one at a time in FIFO order, and steers before the next queued input', async ({
    expect,
  }) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/inbox-notices']})
    await engine.reply(TestLLM.text('One'), TestLLM.text('Two'), TestLLM.text('Three'), TestLLM.text('Four'))
    const notice = engine.session.tool('notice')
    const firstStream = await engine.gate()
    const first = engine.session.send('Start working')
    await firstStream.started

    await notice.call({text: 'Queue first', delivery: 'queue'})
    await notice.call({text: 'Queue second', delivery: 'queue'})
    const secondStream = await engine.gate()
    await firstStream.release()
    await first
    await secondStream.started
    await notice.call({text: 'Steer before next queued input'})
    await notice.call({text: 'Also steer before next queued input'})
    await notice.call({text: 'Background completion before next queued input'})
    const thirdStream = await engine.gate()
    await secondStream.release()
    await thirdStream.started
    const fourthStream = await engine.gate()
    await thirdStream.release()
    await fourthStream.started
    await fourthStream.release()

    const requests = await engine.requests()
    expect(requests).toHaveLength(4)
    expect(requests.map((request) => request.messages.filter((message) => message.role === 'user'))).toMatchObject([
      [{content: 'Start working'}],
      [{content: 'Start working'}, {content: 'Queue first'}],
      [
        {content: 'Start working'},
        {content: 'Queue first'},
        {content: 'Steer before next queued input'},
        {content: 'Also steer before next queued input'},
        {content: 'Background completion before next queued input'},
      ],
      [
        {content: 'Start working'},
        {content: 'Queue first'},
        {content: 'Steer before next queued input'},
        {content: 'Also steer before next queued input'},
        {content: 'Background completion before next queued input'},
        {content: 'Queue second'},
      ],
    ])
  })

  test('the model is sent the notice text only, never its description or metadata', async ({expect}) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/inbox-notices']})
    await engine.reply(TestLLM.text('Read them'))
    const stream = await engine.gate()

    await engine.session.tool('notice').call({
      text: 'Instructions from: /repo/sub/AGENTS.md\ncontent',
      description: 'Loaded /repo/sub/AGENTS.md',
      metadata: {instruction: {paths: ['/repo/sub/AGENTS.md']}},
    })
    await stream.started
    await stream.release()

    const [request] = await engine.requests()
    expect(request?.messages).toEqual([{role: 'user', content: 'Instructions from: /repo/sub/AGENTS.md\ncontent'}])
  })
})

describe.concurrent('session.synthetic admission', () => {
  test('reconciles synthetic retries from the promoted message regardless of payload', async ({expect}) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/inbox-notices']})
    await engine.reply(TestLLM.text('Seen once'))
    const notice = engine.session.tool('notice')
    const input = {id: 'msg_same_notice', text: 'Completed', resume: false}

    const entries = await Promise.all([notice.call(input), notice.call(input)])
    expect(entries[1]).toEqual(entries[0])
    await engine.session.send('Go')
    const promotedRetry = await notice.call(input)
    const differing = await notice.call({...input, text: 'Different completion'})

    expect(promotedRetry).toMatchObject({id: 'msg_same_notice', type: 'synthetic', payload: {text: 'Completed'}})
    expect(differing).toMatchObject({id: 'msg_same_notice', type: 'synthetic', payload: {text: 'Completed'}})
    const requests = await engine.requests()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.messages.filter((message) => message.role === 'user')).toMatchObject([
      {content: 'Completed'},
      {content: 'Go'},
    ])
  })

  test('keeps the first admission across sessions, including delivered retries and identity conflicts', async ({
    expect,
  }) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/inbox-notices']})
    await engine.reply(TestLLM.text('Seen'))
    const other = await engine.newSession('Other')
    const notice = engine.session.tool('notice')

    const id = 'msg_original_completion'
    const synthetic = await notice.call({id, text: 'Original completion', description: 'Job', resume: false})
    expect(synthetic).toEqual({
      id,
      sessionID: engine.session.id,
      time: {created: expect.any(Number)},
      type: 'synthetic',
      payload: {text: 'Original completion', description: 'Job'},
      delivery: 'steer',
    })
    const retry = {id, text: 'Ignore this', metadata: {source: 'retry'}, resume: false}
    expect(await notice.call(retry)).toEqual(synthetic)
    expect(await notice.call({...retry, sessionId: other.id})).toEqual({
      refused: 'Session.SyntheticConflictError',
      conflict: {sessionID: other.id, inputID: id},
    })

    await engine.session.send('Go')

    expect(await notice.call(retry)).toMatchObject({
      id,
      payload: {text: 'Original completion', description: 'Job'},
    })
    expect(await notice.call({...retry, sessionId: other.id})).toEqual({
      refused: 'Session.SyntheticConflictError',
      conflict: {sessionID: other.id, inputID: id},
    })
    const requests = await engine.requests()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.messages.filter((message) => message.role === 'user')).toMatchObject([
      {content: 'Original completion'},
      {content: 'Go'},
    ])
  })

  test('a deleted session refuses a notice with NotFoundError, and its waiting notice is gone with it', async ({
    expect,
  }) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/inbox-notices']})
    const doomed = await engine.newSession('Doomed')
    const notice = engine.session.tool('notice')
    await notice.call({sessionId: doomed.id, id: 'msg_waiting_notice', text: 'Waiting', resume: false})

    await engine.session.tool('session_remove').call({sessionId: doomed.id})

    expect(await notice.call({sessionId: doomed.id, text: 'Too late'})).toEqual({refused: 'Session.NotFoundError'})
    expect(await notice.call({id: 'msg_waiting_notice', text: 'Reused', resume: false})).toMatchObject({
      id: 'msg_waiting_notice',
      type: 'synthetic',
      payload: {text: 'Reused'},
    })
  })
})

describe.concurrent('session.synthetic and the idle hook', () => {
  test('runs the session idle hook only once the session would go idle', async ({expect}) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/inbox-notices']})
    await engine.reply(TestLLM.text('Background started'), TestLLM.text('Done'))
    const idles = engine.session.tool('idles_heard')
    const first = await engine.gate()
    const running = engine.session.send('First')
    await first.started

    await engine.session.tool('notice').call({text: 'Background work completed'})
    const second = await engine.gate()
    await first.release()
    await running
    await second.started
    expect(await idles.call({count: 0})).toEqual({idles: []})
    await second.release()

    expect(await idles.call({count: 1})).toEqual({idles: [engine.session.id]})
    expect(await engine.requests()).toHaveLength(2)
  })

  test.for([false, true])(
    'continues instead of going idle when a session idle hook admits input (resume: %s)',
    async (resume, {expect}) => {
      const engine = await createEngine({
        plugins: [['./test/fixtures/plugins/inbox-notices', {idleNotice: {resume}}]],
      })
      await engine.reply(TestLLM.text('First answer'), TestLLM.text('Second answer'))

      await engine.session.send('Start')

      expect(await engine.session.tool('idles_heard').call({count: 2})).toEqual({
        idles: [engine.session.id, engine.session.id],
      })
      const requests = await engine.requests()
      expect(requests).toHaveLength(2)
      expect(requests[1]?.messages.at(-1)).toMatchObject({role: 'user', content: 'Keep going'})
    },
  )
})
