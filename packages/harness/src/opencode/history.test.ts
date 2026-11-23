import {once} from 'node:events'
import {mkdirSync, realpathSync} from 'node:fs'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {Worker} from 'node:worker_threads'
import {ConfigProvider} from 'effect'
import {describe, expect, it} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {opencode} from './index.js'

describe('history', () => {
  const LOCK_HOLDER = `
const {workerData} = require('node:worker_threads')
const {DatabaseSync} = require('node:sqlite')
const db = new DatabaseSync(workerData.path)
db.exec('begin exclusive')
Atomics.store(workerData.state, 0, 1)
Atomics.notify(workerData.state, 0)
Atomics.wait(workerData.state, 0, 1)
Atomics.wait(workerData.state, 0, 2, 100)
db.exec('commit')
db.close()
`

  async function readWhileLockedBriefly<T>(path: string, read: () => Promise<T>): Promise<T> {
    const state = new Int32Array(new SharedArrayBuffer(4))
    const holder = new Worker(LOCK_HOLDER, {eval: true, workerData: {path, state}})
    const exited = once(holder, 'exit')
    expect(Atomics.wait(state, 0, 0, 5000)).toBe('ok')
    Atomics.store(state, 0, 2)
    Atomics.notify(state, 0)
    const [result] = await Promise.all([read(), exited])
    return result
  }

  it('a session in opencode.db lists for its project with its title, its tail reads back, and opening it reads back the whole conversation, tool calls and results included, with its token total, and the list still reads while another connection briefly holds a lock', async () => {
    const dataHome = tempDir('opencode-data-')
    const project = realpathSync(tempDir('opencode-project-'))
    const sessionId = HarnessSessionId.parse('ses_1')
    mkdirSync(join(dataHome, 'opencode'))
    const db = new DatabaseSync(join(dataHome, 'opencode', 'opencode.db'))
    db.exec(
      'create table session (id text, directory text, title text, time_created integer, time_updated integer, time_archived integer, model text, tokens_input integer, tokens_output integer)',
    )
    db.exec('create table message (id text, session_id text, data text, time_created integer, time_updated integer)')
    db.exec('create table part (id text, message_id text, session_id text, data text, time_created integer)')
    const session = db.prepare('insert into session values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    session.run('ses_1', project, 'Fix the login button', 1000, 2000, null, 'anthropic/claude-sonnet-4-5', 300, 200)
    session.run('ses_2', project, 'Old work', 500, 900, 950, null, 0, 0)
    const message = db.prepare('insert into message values (?, ?, ?, ?, ?)')
    message.run('msg_1', 'ses_1', JSON.stringify({role: 'user'}), 1000, 1000)
    message.run('msg_2', 'ses_1', JSON.stringify({role: 'assistant'}), 1500, 2000)
    const part = db.prepare('insert into part values (?, ?, ?, ?, ?)')
    part.run('prt_1', 'msg_1', 'ses_1', JSON.stringify({type: 'text', text: 'Fix the login button'}), 1000)
    part.run(
      'prt_2',
      'msg_2',
      'ses_1',
      JSON.stringify({
        type: 'tool',
        callID: 'call_1',
        tool: 'bash',
        state: {status: 'completed', input: {command: 'ls'}, output: 'src'},
      }),
      1500,
    )
    part.run('prt_3', 'msg_2', 'ses_1', JSON.stringify({type: 'text', text: 'The button now submits'}), 1600)
    db.close()
    const history = opencode(ConfigProvider.fromEnvRecord({XDG_DATA_HOME: dataHome})).history
    const conversation = [
      {id: 'msg_1', role: 'user', parts: [{type: 'text', content: 'Fix the login button'}]},
      {
        id: 'msg_2',
        role: 'assistant',
        parts: [
          {type: 'tool-call', id: 'call_1', name: 'bash', arguments: '{"command":"ls"}', state: 'input-complete'},
          {type: 'tool-result', toolCallId: 'call_1', content: 'src', state: 'complete'},
          {type: 'text', content: 'The button now submits'},
        ],
      },
    ]

    expect(await history.list({cwd: project}, {after: null, limit: 10})).toEqual({
      sessions: [
        expect.objectContaining({
          id: 'ses_1',
          cwd: project,
          derivedTitle: 'Fix the login button',
          model: 'anthropic/claude-sonnet-4-5',
          totalTokens: 500,
          updatedAt: 2000,
        }),
      ],
      next: null,
    })
    expect(await history.tail(project, sessionId, {limit: 10, before: null})).toEqual({
      messages: conversation,
      earlier: null,
    })
    expect(await history.messages(project, sessionId)).toEqual(conversation)
    expect((await history.meta(project, sessionId))?.totalTokens).toBe(500)
    const listedWhileLocked = await readWhileLockedBriefly(join(dataHome, 'opencode', 'opencode.db'), () =>
      history.list({cwd: project}, {after: null, limit: 10}),
    )
    expect(listedWhileLocked.sessions.map((listed) => listed.id)).toEqual(['ses_1'])
  })
})
