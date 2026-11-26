import {execFile} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {promisify} from 'node:util'
import {describe, expect} from 'vitest'
import {test} from '../utils/engine-test.js'
import {makeRpcClient} from '@conciv/client'
import {browserClient} from '@internal/engine-kit'
import {TestLLM} from '../utils/engine.js'
import {CONTEXT_OVERFLOW_CODE} from '@conciv/types/chat-event-types'

describe('start', () => {
  test('a malformed access token is refused at start, a started engine answers its token on http and the socket only, and its Effect logs land in the log file in its home once it stops', async ({
    createEngine,
  }) => {
    await expect(createEngine({}, {port: 'connect', token: 'not-a-uuid'})).rejects.toThrow(
      'conciv: accessToken must be a UUID pairing token',
    )

    const engine = await createEngine()
    const {apiBase, token} = engine.address
    await expect(makeRpcClient(apiBase, {token}).meta.harnesses()).resolves.toMatchObject({
      harnesses: expect.any(Array),
    })
    expect(await makeRpcClient(apiBase, {token}).auth.issueCode()).toEqual({
      code: expect.any(String),
      expiresAt: expect.any(Number),
    })
    const socket = browserClient(apiBase, {token})
    try {
      await expect(socket.rpc.meta.harnesses()).resolves.toMatchObject({harnesses: expect.any(Array)})
      expect(await socket.rpc.auth.issueCode()).toEqual({code: expect.any(String), expiresAt: expect.any(Number)})
    } finally {
      socket.close()
    }
    const legacyPath = await fetch(new URL(`/t/${token}/rpc/meta/harnesses`, apiBase), {method: 'POST'})
    expect(legacyPath.status).toBe(401)
    const bearer = await fetch(new URL('/rpc/meta/harnesses', apiBase), {
      method: 'POST',
      headers: {authorization: `Bearer ${token}`},
    })
    expect(bearer.status).toBe(401)

    const logged = await createEngine({}, {fs: {filewatcher: true}})
    await logged.restart()
    expect(readFileSync(join(logged.home, 'log', 'conciv-local.log'), 'utf8')).toMatch(
      /^timestamp=\S+ level=INFO run=\S+ message="watcher started"/m,
    )
  })
})
describe('the test engine kit', () => {
  const run = promisify(execFile)

  test('scripted replies run in order and carry their error code, a wait outlives a restart and matches on data, a held reply stops cleanly, reasoning stays ahead of the answer, git projects commit, a second engine shares the home, the real clock refuses clock calls, a tool name that is not an identifier is refused, and past sessions are listed and paged', async ({
    launch,
  }) => {
    const {engine: scripted} = await launch()
    await scripted.reply(TestLLM.text('First answer'), TestLLM.text('Second answer'))
    await scripted.session.send('one')
    await scripted.session.send('two')
    await expect(scripted.session.send('three')).rejects.toThrow('the scripted harness has no reply for request 3')

    const {engine: failing} = await launch()
    await failing.reply(
      TestLLM.failAfter(Object.assign(new Error('prompt is too long'), {code: CONTEXT_OVERFLOW_CODE})),
    )
    await expect(failing.session.send('one')).rejects.toMatchObject({
      message: 'prompt is too long',
      code: CONTEXT_OVERFLOW_CODE,
    })

    const {engine: restarted} = await launch()
    const succeeded = await restarted.event('session.execution.succeeded')
    await restarted.restart()
    await restarted.reply(TestLLM.text('After the restart'))
    await restarted.session.send('one')
    expect(await succeeded.arrived).toMatchObject({type: 'session.execution.succeeded'})

    const {engine: held} = await launch()
    const gate = await held.gate()
    await held.reply(TestLLM.text('never sent'), TestLLM.text('Second answer'))
    const turn = held.session.send('one')
    await gate.started
    await held.session.stop()
    await expect(turn).resolves.toBeUndefined()
    await held.session.send('two')
    expect(await held.requests()).toHaveLength(2)

    const thinking = await launch()
    await thinking.engine.reply(TestLLM.thinking('The user wants a greeting', 'Hello there'))
    await thinking.engine.session.send('Say hello')
    const {messages} = await thinking.client.chat.hydrate({sessionId: thinking.engine.session.id})
    expect(messages.at(-1)?.parts).toMatchObject([
      {type: 'thinking', content: 'The user wants a greeting'},
      {type: 'text', content: 'Hello there'},
    ])

    const {engine: versioned} = await launch({}, {git: true})
    await versioned.write('src/app.ts', 'export const answer = 42\n')
    await versioned.commit('add the app')
    const {stdout: log} = await run('git', ['log', '--format=%s'], {cwd: versioned.root})
    expect(log.trim().split('\n')).toEqual(['add the app', 'initial'])
    const {stdout: status} = await run('git', ['status', '--porcelain'], {cwd: versioned.root})
    expect(status).toBe('')

    const {engine: unversioned} = await launch()
    await expect(unversioned.commit('nothing')).rejects.toThrow(
      'this engine has no git project: make it with git: true',
    )

    const {engine: matching} = await launch()
    const other = await matching.newSession('Other')
    const wait = await matching.event('session.execution.succeeded', {data: {sessionID: other.id}})
    await matching.reply(TestLLM.text('First'), TestLLM.text('Second'))
    await matching.session.send('In the first session')
    await other.send('In the other session')
    expect(await wait.arrived).toEqual({type: 'session.execution.succeeded', data: {sessionID: other.id}})

    const first = await launch()
    await first.engine.setting({scope: 'global', namespace: 'kit', key: 'theme', value: 'dark'})
    await first.engine.setting({scope: 'project', namespace: 'kit', key: 'layout', value: 'wide'})
    await first.engine.restart()
    const second = await launch({}, {home: first.engine.home})
    expect(second.engine.home).toBe(first.engine.home)
    expect((await second.client.settings.all({scope: 'global', namespace: 'kit'})).value).toEqual({theme: 'dark'})
    expect((await second.client.settings.all({scope: 'project', namespace: 'kit'})).value).toEqual({})

    const {engine: realClock} = await launch()
    await expect(realClock.clock.advance(Promise.resolve())).rejects.toThrow(
      "this engine runs on the real clock: make it with clock: 'test'",
    )
    await expect(realClock.clock.drain()).rejects.toThrow(
      "this engine runs on the real clock: make it with clock: 'test'",
    )

    const {engine: coded} = await launch()
    for (const name of ['two-words', '9lives', 'x(1)']) {
      await expect(coded.session.tool(name).call({})).rejects.toThrow(
        `the tool name "${name}" is not a plain identifier`,
      )
      await expect(coded.outside().call(name, {})).rejects.toThrow(`the tool name "${name}" is not a plain identifier`)
    }

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
      expect.objectContaining({
        title: 'Fix the login form',
        native: expect.objectContaining({nativeId: 'past-here'}),
      }),
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
