import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {describe, expect} from 'vitest'
import {CONTEXT_OVERFLOW_CODE} from '@conciv/protocol/chat-event-types'
import {TestLLM} from './harness-engine.js'
import {test} from '../test/engine-test.js'

describe('scripted replies', () => {
  test('each model request takes the next reply in order, and a request with none left fails its turn', async ({
    engine,
  }) => {
    await engine.reply(TestLLM.text('First answer'), TestLLM.text('Second answer'))

    await engine.session.send('one')
    await engine.session.send('two')
    await expect(engine.session.send('three')).rejects.toThrow('the scripted harness has no reply for request 3')
  })

  test('a failed reply carries the code of the error it was made from, so a client sees why the run failed', async ({
    engine,
  }) => {
    await engine.reply(TestLLM.failAfter(Object.assign(new Error('prompt is too long'), {code: CONTEXT_OVERFLOW_CODE})))

    await expect(engine.session.send('one')).rejects.toMatchObject({
      message: 'prompt is too long',
      code: CONTEXT_OVERFLOW_CODE,
    })
  })
})

describe('a held reply', () => {
  test('a Stop while the reply is held ends the turn without a release, and the next turn takes the next reply', async ({
    engine,
  }) => {
    const gate = await engine.gate()
    await engine.reply(TestLLM.text('never sent'), TestLLM.text('Second answer'))

    const turn = engine.session.send('one')
    await gate.started
    await engine.session.stop()

    await expect(turn).resolves.toBeUndefined()
    await engine.session.send('two')
    expect(await engine.requests()).toHaveLength(2)
  })
})

describe('a reply that thinks first', () => {
  test("the thread keeps the reply's reasoning ahead of its answer", async ({launch}) => {
    const {engine, client} = await launch()
    await engine.reply(TestLLM.thinking('The user wants a greeting', 'Hello there'))

    await engine.session.send('Say hello')

    const {messages} = await client.chat.hydrate({sessionId: engine.session.id})
    expect(messages.at(-1)?.parts).toMatchObject([
      {type: 'thinking', content: 'The user wants a greeting'},
      {type: 'text', content: 'Hello there'},
    ])
  })
})

describe('several tool calls in one reply', () => {
  test('a reply with two tool calls runs both, and the next request carries both results in call order', async ({
    engine,
  }) => {
    await engine.reply(
      TestLLM.toolCalls(
        {id: 'c1', name: 'execute_typescript', input: {typescriptCode: 'return 1'}},
        {id: 'c2', name: 'execute_typescript', input: {typescriptCode: 'return 2'}},
      ),
      TestLLM.text('Both ran'),
    )

    await engine.session.send('Run both')

    const [, second] = await engine.requests()
    expect(second?.messages.slice(-2)).toMatchObject([
      {role: 'tool', toolCallId: 'c1', content: expect.stringContaining('1')},
      {role: 'tool', toolCallId: 'c2', content: expect.stringContaining('2')},
    ])
  })
})

describe('a git project', () => {
  const run = promisify(execFile)

  test('an engine made with git: true runs in a repository with a first commit, and commit records an edit on top', async ({
    launch,
  }) => {
    const {engine} = await launch({}, {git: true})
    await engine.write('src/app.ts', 'export const answer = 42\n')

    await engine.commit('add the app')

    const {stdout: log} = await run('git', ['log', '--format=%s'], {cwd: engine.root})
    expect(log.trim().split('\n')).toEqual(['add the app', 'initial'])
    const {stdout: status} = await run('git', ['status', '--porcelain'], {cwd: engine.root})
    expect(status).toBe('')
  })

  test('commit on an engine made without git says how to get one', async ({engine}) => {
    await expect(engine.commit('nothing')).rejects.toThrow('this engine has no git project: make it with git: true')
  })
})

describe('waiting for an engine event that matches', () => {
  test('a wait with data to match passes over events whose data differs and resolves with the first one that matches', async ({
    engine,
  }) => {
    const other = await engine.newSession('Other')
    const wait = await engine.event('session.execution.succeeded', {data: {sessionID: other.id}})
    await engine.reply(TestLLM.text('First'), TestLLM.text('Second'))

    await engine.session.send('In the first session')
    await other.send('In the other session')

    expect(await wait.arrived).toEqual({type: 'session.execution.succeeded', data: {sessionID: other.id}})
  })
})

describe('token use from a scripted harness', () => {
  test("a harness given a context size and a context window reports both on the session after its run, as the pane's context meter reads them", async ({
    launch,
  }) => {
    const {engine, client} = await launch(
      {},
      {harnesses: [{id: 'engine', contextTokens: 1200, contextWindow: 200_000}]},
    )
    await engine.reply(TestLLM.text('Done'))

    await engine.session.send('Count me')

    const session = await client.sessions.get({sessionId: engine.session.id})
    expect(session.usage).toMatchObject({
      contextTokens: 1200,
      contextWindow: 200_000,
    })
  })
})

describe('a second engine on the same home', () => {
  test("an engine started on another engine's home reads the global settings that home saved, and a project setting stays with its own project", async ({
    launch,
  }) => {
    const first = await launch()
    await first.engine.setting({scope: 'global', namespace: 'kit', key: 'theme', value: 'dark'})
    await first.engine.setting({scope: 'project', namespace: 'kit', key: 'layout', value: 'wide'})
    await first.engine.restart()

    const second = await launch({}, {home: first.engine.home})

    expect(second.engine.home).toBe(first.engine.home)
    expect((await second.client.settings.all({scope: 'global', namespace: 'kit'})).value).toEqual({theme: 'dark'})
    expect((await second.client.settings.all({scope: 'project', namespace: 'kit'})).value).toEqual({})
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
  test("the engine lists this project's past sessions and pages their preview, and lists none when none are given", async ({
    launch,
  }) => {
    const plain = await launch()
    const plainListed = await plain.client.sessions.list({limit: 20})
    expect(plainListed.sessions.map((session) => session.origin)).toEqual(['conciv'])

    const {client} = await launch(
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
    const listed = await client.sessions.list({limit: 20})
    expect(listed.sessions.filter((session) => session.origin === 'external')).toEqual([
      expect.objectContaining({title: 'Fix the login form', native: expect.objectContaining({nativeId: 'past-here'})}),
    ])

    const latest = await client.sessions.preview({harness: 'engine', nativeId: 'past-here', before: null, limit: 2})
    expect(latest.messages.map((message) => message.id)).toEqual(['m3', 'm4'])
    expect(latest.earlier).not.toBeNull()

    const earlier = await client.sessions.preview({
      harness: 'engine',
      nativeId: 'past-here',
      before: latest.earlier,
      limit: 2,
    })
    expect(earlier).toEqual({
      messages: [expect.objectContaining({id: 'm1'}), expect.objectContaining({id: 'm2'})],
      earlier: null,
    })
  })
})
