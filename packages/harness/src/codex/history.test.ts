import {mkdirSync, realpathSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {ConfigProvider} from 'effect'
import {describe, expect, it} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {codex} from './index.js'

describe('history', () => {
  it('a session in the CLI store lists for its project with its title and preview, archived ones left out', async () => {
    const home = tempDir('codex-home-')
    const project = realpathSync(tempDir('codex-project-'))
    const rollout = join(home, 'sessions', '2026', '11', '21', 'rollout-thread-1.jsonl')
    mkdirSync(join(home, 'sessions', '2026', '11', '21'), {recursive: true})
    writeFileSync(
      rollout,
      `${JSON.stringify({type: 'session_meta', payload: {cwd: project, session_id: 'thread-1'}})}\n`,
    )
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
    db.close()

    const page = await codex(ConfigProvider.fromEnvRecord({CODEX_HOME: home})).history.list(
      {cwd: project},
      {after: null, limit: 10},
    )

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
  })
})
