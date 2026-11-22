import {mkdirSync, readFileSync, realpathSync, writeFileSync} from 'node:fs'
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
  it('opening the session reads back the whole conversation, tool calls and results included, with its context size', async () => {
    const configDir = tempDir('claude-config-')
    const project = realpathSync(tempDir('claude-project-'))
    const sessionId = HarnessSessionId.parse('5b1c2d3e-0000-4000-8000-000000000002')
    const folder = join(configDir, 'projects', project.replace(/[^a-zA-Z0-9]/g, '-'))
    const transcript = join(folder, `${sessionId}.jsonl`)
    mkdirSync(folder, {recursive: true})
    writeFileSync(
      transcript,
      [
        {type: 'user', uuid: 'u1', sessionId, message: {role: 'user', content: 'Fix the login button'}},
        {
          type: 'assistant',
          uuid: 'a1',
          sessionId,
          message: {
            id: 'msg_1',
            role: 'assistant',
            content: [{type: 'tool_use', id: 'toolu_1', name: 'Bash', input: {command: 'ls'}}],
          },
        },
        {
          type: 'user',
          uuid: 'u2',
          sessionId,
          message: {role: 'user', content: [{type: 'tool_result', tool_use_id: 'toolu_1', content: 'src'}]},
        },
        {
          type: 'assistant',
          uuid: 'a2',
          sessionId,
          message: {
            id: 'msg_2',
            role: 'assistant',
            content: [{type: 'text', text: 'The button now submits'}],
            usage: {input_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 300},
          },
        },
      ]
        .map((record) => JSON.stringify(record))
        .join('\n'),
    )
    const history = claude(ConfigProvider.fromEnvRecord({CLAUDE_CONFIG_DIR: configDir})).history

    const messages = await history.messages(project, sessionId)

    expect(messages).toEqual([
      {id: 'u1', role: 'user', parts: [{type: 'text', content: 'Fix the login button'}]},
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {type: 'tool-call', id: 'toolu_1', name: 'Bash', arguments: '{"command":"ls"}', state: 'input-complete'},
          {type: 'tool-result', toolCallId: 'toolu_1', content: 'src', state: 'complete'},
        ],
      },
      {id: 'a2', role: 'assistant', parts: [{type: 'text', content: 'The button now submits'}]},
    ])
    expect(history.contextTokens?.(readFileSync(transcript, 'utf8'))).toBe(2400)
  })
})
