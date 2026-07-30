import {mkdir, mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {beforeAll, describe, expect, it} from 'vitest'
import {opencode} from '../src/opencode/index.js'
import {storagePath} from '../src/opencode/history.js'

const PROJECT = '/workspace/demo'
const OTHER = '/workspace/other'
const SESSION = 'ses_05567821affeyuqQ2PYBLsfUj8'
const STRAY = 'ses_0556942b8ffeMdQJ7mgrX6NYLi'

const MESSAGES = [
  {id: 'msg_1', data: {role: 'user', time: {created: 1785273548288}, agent: 'build'}},
  {
    id: 'msg_2',
    data: {
      parentID: 'msg_1',
      role: 'assistant',
      mode: 'build',
      path: {cwd: PROJECT, root: PROJECT},
      modelID: 'gpt-5.6-sol',
      providerID: 'openai',
    },
  },
]

const PARTS = [
  {id: 'prt_1', message: 'msg_1', data: {type: 'text', text: 'count the files'}},
  {id: 'prt_2', message: 'msg_2', data: {snapshot: '5f0b32be', type: 'step-start'}},
  {
    id: 'prt_3',
    message: 'msg_2',
    data: {
      type: 'tool',
      callID: 'toolu_01E8',
      tool: 'grep',
      state: {
        status: 'completed',
        input: {pattern: 'Image', path: PROJECT},
        output: 'Found 1 matches',
        time: {start: 1770366532824, end: 1770366532837},
      },
    },
  },
  {id: 'prt_4', message: 'msg_2', data: {type: 'reasoning', text: ''}},
  {id: 'prt_5', message: 'msg_2', data: {type: 'text', text: 'One match.'}},
]

const state = {home: ''}

function seed(): void {
  const db = new DatabaseSync(storagePath(state.home))
  db.exec(
    `create table session (id text primary key, project_id text not null default '', directory text not null, title text not null, time_created integer not null, time_updated integer not null, time_archived integer, model text, tokens_input integer not null default 0, tokens_output integer not null default 0)`,
  )
  db.exec(
    `create table message (id text primary key, session_id text not null, time_created integer not null, time_updated integer not null, data text not null)`,
  )
  db.exec(
    `create table part (id text primary key, message_id text not null, session_id text not null, time_created integer not null, time_updated integer not null, data text not null)`,
  )
  const session = db.prepare(
    'insert into session (id, directory, title, time_created, time_updated, time_archived, model, tokens_input, tokens_output) values (?,?,?,?,?,?,?,?,?)',
  )
  session.run(SESSION, PROJECT, 'Count the files', 1785273548261, 1785305469728, null, 'openai/gpt-5.6-sol', 300, 120)
  session.run(STRAY, OTHER, 'Somewhere else', 1785273433416, 1785273519484, null, 'openai/gpt-5.6-sol', 10, 5)

  const message = db.prepare(
    'insert into message (id, session_id, time_created, time_updated, data) values (?,?,?,?,?)',
  )
  MESSAGES.forEach((row, index) => {
    message.run(row.id, SESSION, 1785273548288 + index, 1785273548288 + index, JSON.stringify(row.data))
  })
  const part = db.prepare(
    'insert into part (id, message_id, session_id, time_created, time_updated, data) values (?,?,?,?,?,?)',
  )
  PARTS.forEach((row, index) => {
    part.run(row.id, row.message, SESSION, 1785273548300 + index, 1785273548300 + index, JSON.stringify(row.data))
  })
  db.close()
}

const history = () => {
  const found = opencode.history
  if (!found) throw new Error('opencode harness has no history')
  return found
}

beforeAll(async () => {
  state.home = await mkdtemp(join(tmpdir(), 'opencode-history-'))
  await mkdir(join(state.home, '.local', 'share', 'opencode'), {recursive: true})
  seed()
})

describe('opencode history sidecar', () => {
  it('lists only the sessions opened in this directory', async () => {
    const sessions = await history().list(PROJECT, state.home)
    expect(sessions.map((session) => session.id)).toEqual([SESSION])
    expect(sessions[0]).toMatchObject({
      derivedTitle: 'Count the files',
      messageCount: 2,
      model: 'openai/gpt-5.6-sol',
      totalTokens: 420,
      updatedAt: 1785305469728,
      createdAt: 1785273548261,
    })
  })

  it('rebuilds the conversation from the message and part rows', async () => {
    expect(await history().messages(PROJECT, SESSION, state.home)).toEqual([
      {id: 'h1', role: 'user', parts: [{type: 'text', content: 'count the files'}]},
      {
        id: 'h2',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'toolu_01E8',
            name: 'grep',
            arguments: JSON.stringify({pattern: 'Image', path: PROJECT}),
            state: 'input-complete',
          },
          {type: 'tool-result', toolCallId: 'toolu_01E8', content: 'Found 1 matches', state: 'complete'},
          {type: 'text', content: 'One match.'},
        ],
      },
    ])
  })

  it('refuses a session that belongs to another directory', async () => {
    expect(await history().messages(PROJECT, STRAY, state.home)).toEqual([])
    expect(await history().transcriptStat(PROJECT, STRAY, state.home)).toBeNull()
  })

  it('reports the newest write and the part count for change detection', async () => {
    expect(await history().transcriptStat(PROJECT, SESSION, state.home)).toEqual({
      mtimeMs: 1785305469728,
      size: PARTS.length,
    })
  })

  it('returns nothing when there is no opencode database', async () => {
    expect(await history().list(PROJECT, join(state.home, 'missing'))).toEqual([])
    expect(await history().messages(PROJECT, SESSION, join(state.home, 'missing'))).toEqual([])
  })
})
