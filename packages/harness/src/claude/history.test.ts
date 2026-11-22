import {mkdirSync, realpathSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {ConfigProvider} from 'effect'
import {describe, expect, it} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {listClaudeSessionsInChild} from '../../test/claude-sdk-env.js'
import {claude} from './index.js'

describe('history', () => {
  it('a transcript in the CLAUDE_CONFIG_DIR lists for its project with its title, and its tail reads back', async () => {
    const configDir = tempDir('claude-config-')
    const project = realpathSync(tempDir('claude-project-'))
    const sessionId = HarnessSessionId.parse('5b1c2d3e-0000-4000-8000-000000000001')
    const folder = join(configDir, 'projects', project.replace(/[^a-zA-Z0-9]/g, '-'))
    mkdirSync(folder, {recursive: true})
    writeFileSync(
      join(folder, `${sessionId}.jsonl`),
      [
        {
          type: 'user',
          uuid: 'u1',
          sessionId,
          cwd: project,
          timestamp: '2026-11-21T10:00:00.000Z',
          message: {role: 'user', content: 'Fix the login button'},
        },
        {
          type: 'assistant',
          uuid: 'a1',
          sessionId,
          cwd: project,
          timestamp: '2026-11-21T10:00:05.000Z',
          message: {id: 'msg_1', role: 'assistant', content: [{type: 'text', text: 'The button now submits'}]},
        },
      ]
        .map((record) => JSON.stringify(record))
        .join('\n'),
    )
    const history = claude(ConfigProvider.fromEnvRecord({CLAUDE_CONFIG_DIR: configDir})).history

    const page = await listClaudeSessionsInChild(configDir, project)
    const tail = await history.tail(project, sessionId, {limit: 10, before: null})

    expect(page).toEqual({
      sessions: [expect.objectContaining({id: sessionId, derivedTitle: 'Fix the login button'})],
      next: null,
    })
    expect(tail.messages).toEqual([
      {id: 'u1', role: 'user', parts: [{type: 'text', content: 'Fix the login button'}]},
      {id: 'a1', role: 'assistant', parts: [{type: 'text', content: 'The button now submits'}]},
    ])
  })
})
