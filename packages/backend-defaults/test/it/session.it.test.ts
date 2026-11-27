import {describe} from 'vitest'
import {makeRpcClient} from '@conciv/client'
import {test} from '../utils/engine-test.js'
import {TestLLM} from '../utils/engine.js'

describe.concurrent('sessions and events', () => {
  test('the experimental.idle hook runs once a turn has ended', async ({createEngine, expect}) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/session-watcher']})
    await engine.reply(TestLLM.text('Done'))

    await engine.session.send('Do it')

    expect(await engine.session.tool('idle_session').call({})).toEqual({sessionId: engine.session.id})
  })

  test('a plugin receives the session-created event of a session the user made, creates a session and lists it beside the sessions the user made, and renames its own session and reads it back', async ({
    createEngine,
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

  test('a plugin hears each run start and end', async ({createEngine, expect}) => {
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

describe.concurrent('session.synthetic', () => {
  test('notices reach the model in order: an idle wake sends the notice text only, queued input goes one run at a time with steering before the next queued input, and a resume-false notice goes ahead of the next user message', async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/inbox-notices']})
    await engine.reply(
      TestLLM.text('Read them'),
      TestLLM.text('One'),
      TestLLM.text('Two'),
      TestLLM.text('Three'),
      TestLLM.text('Four'),
      TestLLM.text('Answered'),
    )
    const notice = engine.session.tool('notice')
    const idles = engine.session.tool('idles_heard')
    const woken = await engine.gate()

    await notice.call({
      text: 'Instructions from: /repo/sub/AGENTS.md\ncontent',
      description: 'Loaded /repo/sub/AGENTS.md',
      metadata: {instruction: {paths: ['/repo/sub/AGENTS.md']}},
      delivery: 'queue',
    })
    await woken.started
    await woken.release()
    await idles.call({count: 1})

    const [wake] = await engine.requests()
    expect(wake?.messages.map(({role, content}) => ({role, content}))).toEqual([
      {role: 'user', content: 'Instructions from: /repo/sub/AGENTS.md\ncontent'},
    ])

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
    await idles.call({count: 2})

    await notice.call({text: 'Keep going', description: 'Continuing', resume: false})
    expect(await engine.requests()).toHaveLength(5)
    await engine.session.send('Last')

    const wakeText = 'Instructions from: /repo/sub/AGENTS.md\ncontent'
    const requests = await engine.requests()
    expect(requests.map((request) => request.messages.filter((message) => message.role === 'user'))).toMatchObject([
      [{content: wakeText}],
      [{content: wakeText}, {content: 'Start working'}],
      [{content: wakeText}, {content: 'Start working'}, {content: 'Queue first'}],
      [
        {content: wakeText},
        {content: 'Start working'},
        {content: 'Queue first'},
        {content: 'Steer before next queued input'},
        {content: 'Also steer before next queued input'},
        {content: 'Background completion before next queued input'},
      ],
      [
        {content: wakeText},
        {content: 'Start working'},
        {content: 'Queue first'},
        {content: 'Steer before next queued input'},
        {content: 'Also steer before next queued input'},
        {content: 'Background completion before next queued input'},
        {content: 'Queue second'},
      ],
      [
        {content: wakeText},
        {content: 'Start working'},
        {content: 'Queue first'},
        {content: 'Steer before next queued input'},
        {content: 'Also steer before next queued input'},
        {content: 'Background completion before next queued input'},
        {content: 'Queue second'},
        {content: 'Keep going'},
        {content: 'Last'},
      ],
    ])
  })

  test('a stop keeps queued input for the next run', async ({createEngine, expect}) => {
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

  test('admission: a retry gets the first admission, another session reusing the id is refused with the conflict, and a deleted session refuses with NotFoundError and its waiting notice is gone', async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine({plugins: ['./test/fixtures/plugins/inbox-notices']})
    await engine.reply(TestLLM.text('Seen'))
    const other = await engine.newSession('Other')
    const doomed = await engine.newSession('Doomed')
    const notice = engine.session.tool('notice')
    const id = 'msg_original_completion'
    const input = {id, text: 'Original completion', description: 'Job', resume: false}
    const retry = {id, text: 'Ignore this', metadata: {source: 'retry'}, resume: false}
    const conflict = {refused: 'app-api.session.SYNTHETIC_CONFLICT', conflict: {sessionID: other.id, inputID: id}}

    const [synthetic, concurrent] = await Promise.all([notice.call(input), notice.call(input)])
    expect(synthetic).toEqual({
      id,
      sessionID: engine.session.id,
      time: {created: expect.any(Number)},
      type: 'synthetic',
      payload: {text: 'Original completion', description: 'Job'},
      delivery: 'steer',
    })
    expect(concurrent).toEqual(synthetic)
    expect(await notice.call(retry)).toEqual(synthetic)
    expect(await notice.call({...retry, sessionId: other.id})).toEqual(conflict)

    await engine.session.send('Go')

    expect(await notice.call(retry)).toMatchObject({
      id,
      type: 'synthetic',
      payload: {text: 'Original completion', description: 'Job'},
    })
    expect(await notice.call({...retry, sessionId: other.id})).toEqual(conflict)

    await notice.call({sessionId: doomed.id, id: 'msg_waiting_notice', text: 'Waiting', resume: false})
    await engine.session.tool('session_remove').call({sessionId: doomed.id})
    expect(await notice.call({sessionId: doomed.id, text: 'Too late'})).toEqual({refused: 'Session.NotFoundError'})
    expect(await notice.call({id: 'msg_waiting_notice', text: 'Reused', resume: false})).toMatchObject({
      id: 'msg_waiting_notice',
      type: 'synthetic',
      payload: {text: 'Reused'},
    })

    const requests = await engine.requests()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.messages.filter((message) => message.role === 'user')).toMatchObject([
      {content: 'Original completion'},
      {content: 'Go'},
    ])
  })

  test.for([false, true])(
    'the idle hook runs only once the session would go idle, and a notice it admits continues the session (resume: %s)',
    async (resume, {createEngine, expect}) => {
      const engine = await createEngine({
        plugins: [['./test/fixtures/plugins/inbox-notices', {idleNotice: {resume}}]],
      })
      await engine.reply(TestLLM.text('Background started'), TestLLM.text('Done'), TestLLM.text('Went on'))
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

      expect(await idles.call({count: 2})).toEqual({idles: [engine.session.id, engine.session.id]})
      const requests = await engine.requests()
      expect(requests).toHaveLength(3)
      expect(requests[1]?.messages.map(({role, content}) => ({role, content}))).toContainEqual({
        role: 'user',
        content: 'Background work completed',
      })
      expect(requests[2]?.messages.at(-1)).toMatchObject({role: 'user', content: 'Keep going'})
    },
  )

  test('a browser tab opens, a second joins, focus moves, the first reopens, the second closes, the engine restarts and cancels a running job with the restart notice, a deleted session takes its tabs, and a tab opened while its session is deleted is closed or refused', async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine(
      {plugins: ['./test/fixtures/plugins/queue-jobs']},
      {
        harnesses: [
          {
            id: 'engine',
            sessions: [
              {
                id: 'past-login',
                cwd: '/workspace/shop',
                derivedTitle: 'Fix the login form',
                updatedAt: 1_000,
                messages: [{id: 'm1', role: 'user', parts: [{type: 'text', content: 'Why does login fail?'}]}],
              },
            ],
          },
        ],
      },
    )
    const FIRST_TAB = 'tab_00000000-0000-4000-8000-000000000001'
    const SECOND_TAB = 'tab_00000000-0000-4000-8000-000000000002'
    const openTab = (id: string, focused: boolean) => ({
      id,
      url: 'http://localhost:5173/shelf',
      title: 'Plant shelf',
      focused,
      visible: true,
    })
    const widget = makeRpcClient(engine.address.apiBase, {token: engine.address.token})
    const {sessionId} = await widget.sessions.create({})
    await widget.sessions.rename({sessionId, title: 'Plant shelf'})
    const changes = (await widget.tabs.changes())[Symbol.asyncIterator]()
    await changes.next()
    const secondWidget = new AbortController()

    const firstOpen = widget.tabs.open({sessionId, connectionId: 'widget-1', tab: openTab(FIRST_TAB, false)})
    await changes.next()
    const secondOpen = widget.tabs.open(
      {sessionId, connectionId: 'widget-2', tab: openTab(SECOND_TAB, true)},
      {signal: secondWidget.signal},
    )
    await changes.next()
    await expect(widget.tabs.list({sessionId})).resolves.toEqual({
      tabs: [openTab(SECOND_TAB, true), openTab(FIRST_TAB, false)],
      focusedTabId: SECOND_TAB,
    })
    await expect(widget.tabs.sessions()).resolves.toEqual([sessionId])

    await widget.tabs.state({sessionId, connectionId: 'widget-1', tab: openTab(FIRST_TAB, true)})
    await changes.next()
    await expect(widget.tabs.list({sessionId})).resolves.toEqual({
      tabs: [openTab(FIRST_TAB, true), openTab(SECOND_TAB, false)],
      focusedTabId: FIRST_TAB,
    })

    const reopen = widget.tabs.open({sessionId, connectionId: 'widget-1', tab: openTab(FIRST_TAB, true)})
    await expect(firstOpen).resolves.toBe('replaced')
    await changes.next()
    await expect(widget.tabs.list({sessionId})).resolves.toMatchObject({tabs: [{id: FIRST_TAB}, {id: SECOND_TAB}]})

    secondWidget.abort()
    await expect(secondOpen).rejects.toThrow()
    await changes.next()
    await expect(widget.tabs.list({sessionId})).resolves.toEqual({
      tabs: [openTab(FIRST_TAB, true)],
      focusedTabId: FIRST_TAB,
    })
    await expect(
      widget.tabs.state({sessionId, connectionId: 'widget-2', tab: openTab(SECOND_TAB, true)}),
    ).rejects.toThrow(expect.objectContaining({code: 'UNAVAILABLE'}))

    await expect(engine.rpc.call('queue-jobs', 'queue', {sessionId, queueId: 'queue-1'})).resolves.toEqual({
      id: 'queue-1',
      status: 'running',
    })
    await expect(widget.jobs.list({sessionId})).resolves.toMatchObject({
      data: [{kind: 'page-queue', id: 'queue-1', sessionID: sessionId, status: 'running', queueId: 'queue-1'}],
    })
    await expect(widget.jobs.wait({ids: ['queue-1'], waitMs: 0})).resolves.toEqual({
      data: [{id: 'queue-1', status: 'running'}],
    })

    const reopenEnded = Promise.allSettled([reopen])
    await engine.restart()
    await reopenEnded
    await expect(widget.jobs.wait({ids: ['queue-1'], waitMs: 0})).resolves.toEqual({
      data: [{id: 'queue-1', status: 'cancelled', error: 'Interrupted by server restart.'}],
    })
    await expect(widget.jobs.wait({ids: ['queue-1'], waitMs: 0})).resolves.toEqual({data: []})
    await expect(widget.tabs.sessions()).resolves.toEqual([])
    await expect(widget.tabs.list({sessionId})).resolves.toEqual({tabs: [], focusedTabId: null})

    const restarted = (await widget.tabs.changes())[Symbol.asyncIterator]()
    await restarted.next()
    const afterRestart = widget.tabs.open({sessionId, connectionId: 'widget-3', tab: openTab(FIRST_TAB, false)})
    await restarted.next()
    await expect(widget.tabs.sessions()).resolves.toEqual([sessionId])
    await widget.sessions.delete({sessionId})
    await expect(afterRestart).resolves.toBe('closed')
    await expect(widget.tabs.list({sessionId})).resolves.toEqual({tabs: [], focusedTabId: null})
    await expect(widget.tabs.sessions()).resolves.toEqual([])

    const racing = await widget.sessions.create({})
    const [racedOpen, racedDelete] = await Promise.allSettled([
      widget.tabs.open({sessionId: racing.sessionId, connectionId: 'widget-5', tab: openTab(SECOND_TAB, true)}),
      widget.sessions.delete({sessionId: racing.sessionId}),
    ])
    expect(racedDelete).toEqual({status: 'fulfilled', value: {ok: true}})
    expect(racedOpen).toBeOneOf([
      {status: 'fulfilled', value: 'closed'},
      {status: 'rejected', reason: expect.objectContaining({code: 'NOT_FOUND'})},
    ])
    await expect(widget.tabs.list({sessionId: racing.sessionId})).resolves.toEqual({tabs: [], focusedTabId: null})
    await expect(widget.tabs.sessions()).resolves.toEqual([])

    const elsewhere = await widget.sessions.open({
      harnessKind: 'engine',
      cwd: '/workspace/shop',
      nativeId: 'past-login',
    })
    await expect(
      widget.tabs.open({sessionId: elsewhere.sessionId, connectionId: 'widget-4', tab: openTab(SECOND_TAB, false)}),
    ).rejects.toThrow(expect.objectContaining({code: 'UNAVAILABLE'}))
  })
})
