import {mkdirSync, realpathSync} from 'node:fs'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {ConfigProvider} from 'effect'
import {describe, expect, it} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {opencode} from './index.js'

describe('history', () => {
  it('a session in opencode.db lists for its project with its title, and its tail reads back', async () => {
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
    part.run('prt_2', 'msg_2', 'ses_1', JSON.stringify({type: 'text', text: 'The button now submits'}), 1500)
    db.close()
    const history = opencode(ConfigProvider.fromEnvRecord({XDG_DATA_HOME: dataHome})).history

    const page = await history.list({cwd: project}, {after: null, limit: 10})
    const tail = await history.tail(project, sessionId, {limit: 10, before: null})

    expect(page).toEqual({
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
    expect(tail).toEqual({
      messages: [
        {id: 'msg_1', role: 'user', parts: [{type: 'text', content: 'Fix the login button'}]},
        {id: 'msg_2', role: 'assistant', parts: [{type: 'text', content: 'The button now submits'}]},
      ],
      earlier: null,
    })
  })
})
