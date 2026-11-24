import {mkdirSync, realpathSync, symlinkSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {ConfigProvider} from 'effect'
import {foldJsonlFile} from '../_shared/fold-jsonl-file.js'
import {describe, expect, it} from 'vitest'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {codex} from './index.js'

describe('history', () => {
  it('a session in the CLI store lists for its project with its title and preview through a symlinked home, archived ones and rollouts outside the home left out, and opening it reads back the whole conversation, tool calls and results included, with its context size', async () => {
    const home = join(tempDir('codex-home-link-'), 'home')
    symlinkSync(tempDir('codex-home-'), home)
    const outside = join(tempDir('codex-outside-'), 'rollout-thread-3.jsonl')
    const project = realpathSync(tempDir('codex-project-'))
    const sessionId = HarnessSessionId.parse('thread-1')
    const rollout = join(home, 'sessions', '2026', '11', '21', 'rollout-2026-11-21T10-00-00-thread-1.jsonl')
    mkdirSync(join(home, 'sessions', '2026', '11', '21'), {recursive: true})
    const lines = [
      {type: 'session_meta', payload: {cwd: project, session_id: 'thread-1'}},
      {type: 'event_msg', payload: {type: 'user_message', message: 'Fix the login button'}},
      {
        type: 'response_item',
        payload: {type: 'function_call', name: 'shell', arguments: '{"command":"ls"}', call_id: 'call_1'},
      },
      {type: 'response_item', payload: {type: 'function_call_output', call_id: 'call_1', output: 'src'}},
      {type: 'event_msg', payload: {type: 'agent_message', message: 'The button now submits'}},
      {type: 'event_msg', payload: {type: 'token_count', info: {total_token_usage: {total_tokens: 4321}}}},
    ].map((line) => JSON.stringify(line))
    writeFileSync(rollout, `${lines.join('\n')}\n`)
    writeFileSync(outside, `${lines.join('\n')}\n`)
    const offsets = lines.map((_, index) => lines.slice(0, index).reduce((sum, line) => sum + line.length + 1, 0))
    const db = new DatabaseSync(join(home, 'state_5.sqlite'))
    db.exec(
      'create table threads (id text, rollout_path text, cwd text, title text, first_user_message text, preview text, model text, tokens_used integer, created_at integer, updated_at integer, created_at_ms integer, updated_at_ms integer, archived integer)',
    )
    const insert = db.prepare('insert into threads values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    insert.run(
      'thread-1',
      rollout,
      project,
      'Fix the login button',
      'fix it',
      'The button now submits',
      'gpt-5.5',
      1200,
      0,
      0,
      1000,
      2000,
      0,
    )
    insert.run('thread-2', rollout, project, 'Old work', null, null, 'gpt-5.5', 0, 0, 0, 500, 900, 1)
    insert.run('thread-3', outside, project, 'Outside the home', null, null, 'gpt-5.5', 0, 0, 0, 500, 900, 0)
    db.close()
    const history = codex(ConfigProvider.fromEnvRecord({CODEX_HOME: home})).history

    const page = await history.list({cwd: project}, {after: null, limit: 10})
    expect(page).toEqual({
      sessions: [
        expect.objectContaining({
          id: 'thread-1',
          cwd: project,
          derivedTitle: 'Fix the login button',
          lastMessage: 'The button now submits',
          model: 'gpt-5.5',
          totalTokens: 1200,
          updatedAt: 2000,
        }),
      ],
      next: null,
    })

    const messages = await history.messages(project, sessionId)
    expect(messages).toEqual([
      {id: `thread-1:o${offsets[1]}`, role: 'user', parts: [{type: 'text', content: 'Fix the login button'}]},
      {
        id: `thread-1:o${offsets[2]}`,
        role: 'assistant',
        parts: [
          {type: 'tool-call', id: 'call_1', name: 'shell', arguments: '{"command":"ls"}', state: 'input-complete'},
          {type: 'tool-result', toolCallId: 'call_1', content: 'src', state: 'complete'},
          {type: 'text', content: 'The button now submits'},
        ],
      },
    ])
    expect(
      await foldJsonlFile(
        rollout,
        undefined,
        (found: number | undefined, line) => history.contextTokens?.(line) ?? found,
      ),
    ).toBe(4321)
  })
})
