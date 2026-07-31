import {mkdtemp, mkdir, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {beforeAll, describe, expect, it} from 'vitest'
import {codex} from '../src/codex/index.js'

const PROJECT = '/workspace/demo'
const OTHER = '/workspace/other'
const SESSION = '019fb331-4da4-7960-8197-c43d6205c10b'
const STRAY = '019fb328-153e-7da1-8d38-36286c97d0ab'

const ROLLOUT_LINES = [
  {
    timestamp: '2026-07-30T13:23:05.125Z',
    type: 'session_meta',
    payload: {session_id: SESSION, id: SESSION, cwd: PROJECT, originator: 'codex_exec', cli_version: '0.145.0'},
  },
  {timestamp: '2026-07-30T13:23:05.200Z', type: 'turn_context', payload: {cwd: PROJECT, model: 'gpt-5.5'}},
  {
    timestamp: '2026-07-30T13:23:06.744Z',
    type: 'event_msg',
    payload: {type: 'user_message', message: 'list the files', images: [], text_elements: []},
  },
  {
    timestamp: '2026-07-30T13:23:07.100Z',
    type: 'response_item',
    payload: {
      type: 'function_call',
      id: 'fc_1',
      name: 'search',
      namespace: 'conciv',
      arguments: '{"query":"files"}',
      call_id: 'call_1',
    },
  },
  {
    timestamp: '2026-07-30T13:23:07.400Z',
    type: 'response_item',
    payload: {type: 'function_call_output', call_id: 'call_1', output: 'README.md\npackage.json'},
  },
  {
    timestamp: '2026-07-30T13:23:07.500Z',
    type: 'response_item',
    payload: {type: 'custom_tool_call', id: 'ctc_1', name: 'apply_patch', input: '*** Begin Patch', call_id: 'call_2'},
  },
  {
    timestamp: '2026-07-30T13:23:07.600Z',
    type: 'response_item',
    payload: {type: 'custom_tool_call_output', call_id: 'call_2', output: 'Exit code: 0'},
  },
  {
    timestamp: '2026-07-30T13:23:07.982Z',
    type: 'event_msg',
    payload: {type: 'agent_message', message: 'Two files.', phase: 'final_answer'},
  },
  {
    timestamp: '2026-07-30T13:23:08.039Z',
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {input_tokens: 15989, cached_input_tokens: 9600, output_tokens: 5, total_tokens: 15994},
        model_context_window: 258400,
      },
    },
  },
]

const rollout = (lines: unknown[]): string => `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`

const state = {home: ''}

async function seedRollout(name: string, lines: unknown[]): Promise<string> {
  const dir = join(state.home, '.codex', 'sessions', '2026', '07', '30')
  await mkdir(dir, {recursive: true})
  const path = join(dir, name)
  await writeFile(path, rollout(lines), 'utf8')
  return path
}

function seedThreads(rows: {id: string; path: string; cwd: string; archived?: number; updated: number}[]): void {
  const db = new DatabaseSync(join(state.home, '.codex', 'state_5.sqlite'))
  db.exec(
    `create table threads (id text primary key, rollout_path text not null, cwd text not null, title text not null default '', first_user_message text not null default '', preview text not null default '', model text, tokens_used integer not null default 0, archived integer not null default 0, created_at integer not null, updated_at integer not null, created_at_ms integer, updated_at_ms integer)`,
  )
  const insert = db.prepare(
    'insert into threads (id, rollout_path, cwd, title, first_user_message, preview, model, tokens_used, archived, created_at, updated_at, created_at_ms, updated_at_ms) values (?,?,?,?,?,?,?,?,?,?,?,?,?)',
  )
  for (const row of rows) {
    insert.run(
      row.id,
      row.path,
      row.cwd,
      'List the files',
      'list the files',
      'Two files.',
      'gpt-5.5',
      32017,
      row.archived ?? 0,
      Math.round(row.updated / 1000) - 20,
      Math.round(row.updated / 1000),
      row.updated - 20_000,
      row.updated,
    )
  }
  db.close()
}

beforeAll(async () => {
  state.home = await mkdtemp(join(tmpdir(), 'codex-history-'))
  await mkdir(join(state.home, '.codex'), {recursive: true})
  const main = await seedRollout(`rollout-2026-07-30T16-23-00-${SESSION}.jsonl`, ROLLOUT_LINES)
  const stray = await seedRollout(
    `rollout-2026-07-30T16-12-56-${STRAY}.jsonl`,
    ROLLOUT_LINES.map((line) =>
      line.type === 'session_meta' ? {...line, payload: {...line.payload, cwd: OTHER}} : line,
    ),
  )
  seedThreads([
    {id: SESSION, path: main, cwd: PROJECT, updated: 1785417797467},
    {id: STRAY, path: stray, cwd: OTHER, updated: 1785417209607},
  ])
})

const history = () => {
  const found = codex.history
  if (!found) throw new Error('codex harness has no history')
  return found
}

describe('codex rollout parsing', () => {
  it('builds a user/assistant spine with tool calls and their outputs', async () => {
    expect(await history().messages(PROJECT, SESSION, state.home)).toEqual([
      {id: 'h1', role: 'user', parts: [{type: 'text', content: 'list the files'}]},
      {
        id: 'h2',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'call_1',
            name: 'conciv__search',
            arguments: '{"query":"files"}',
            state: 'input-complete',
          },
          {type: 'tool-result', toolCallId: 'call_1', content: 'README.md\npackage.json', state: 'complete'},
          {
            type: 'tool-call',
            id: 'call_2',
            name: 'apply_patch',
            arguments: JSON.stringify({input: '*** Begin Patch'}),
            state: 'input-complete',
          },
          {type: 'tool-result', toolCallId: 'call_2', content: 'Exit code: 0', state: 'complete'},
          {type: 'text', content: 'Two files.'},
        ],
      },
    ])
  })

  it('reads the context tokens from the last token_count event', () => {
    expect(history().contextTokens?.(rollout(ROLLOUT_LINES))).toBe(15994)
  })
})

describe('codex history sidecar', () => {
  it('lists only the sessions recorded for this cwd', async () => {
    const sessions = await history().list(PROJECT, state.home)
    expect(sessions.map((session) => session.id)).toEqual([SESSION])
    expect(sessions[0]).toMatchObject({
      derivedTitle: 'List the files',
      lastMessage: 'Two files.',
      messageCount: 2,
      model: 'gpt-5.5',
      totalTokens: 32017,
      updatedAt: 1785417797467,
      createdAt: 1785417777467,
    })
  })

  it('parses the rollout of a session that belongs to the cwd', async () => {
    const messages = await history().messages(PROJECT, SESSION, state.home)
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant'])
  })

  it('returns nothing when the session was recorded in another cwd', async () => {
    expect(await history().messages(PROJECT, STRAY, state.home)).toEqual([])
    const handle = history().observe(PROJECT, STRAY, state.home)
    const read = await handle.read()
    expect(read.ok).toBe(false)
    handle.close()
  })

  it('revises the resolved rollout file without reading it', async () => {
    const handle = history().observe(PROJECT, SESSION, state.home)
    const revision = await handle.revision()
    expect('ok' in revision).toBe(false)
    if ('ok' in revision) throw new Error(revision.detail)
    expect(revision.changedAt).toBeGreaterThan(0)
    expect(revision.rev).toMatch(/^\d+:/)
    handle.close()
  })
})
