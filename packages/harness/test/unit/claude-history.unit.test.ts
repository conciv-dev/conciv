import {copyFileSync, mkdirSync, realpathSync, symlinkSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {ConfigProvider} from 'effect'
import {foldJsonlFile} from '../../src/_shared/fold-jsonl-file.js'
import {describe, expect, it} from 'vitest'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {HarnessSessionId} from '@conciv/types/chat-types'
import {listClaudeSessionsInChild} from '../utils/claude-sdk-env.js'
import {claude} from '../../src/claude/claude.js'

describe('history', () => {
  it('a transcript in the CLAUDE_CONFIG_DIR lists for its project with its title, its tail reads back, and opening it reads back the whole conversation, tool calls and results included, with its context size, while a transcript linked in from outside the config dir reads back nothing', async () => {
    const configDir = tempDir('claude-config-')
    const project = realpathSync(tempDir('claude-project-'))
    const sessionId = HarnessSessionId.parse('5b1c2d3e-0000-4000-8000-000000000001')
    const folder = join(configDir, 'projects', project.replace(/[^a-zA-Z0-9]/g, '-'))
    const transcript = join(folder, `${sessionId}.jsonl`)
    mkdirSync(folder, {recursive: true})
    writeFileSync(
      transcript,
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
          timestamp: '2026-11-21T10:00:02.000Z',
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
          cwd: project,
          timestamp: '2026-11-21T10:00:03.000Z',
          message: {role: 'user', content: [{type: 'tool_result', tool_use_id: 'toolu_1', content: 'src'}]},
        },
        {
          type: 'assistant',
          uuid: 'a2',
          sessionId,
          cwd: project,
          timestamp: '2026-11-21T10:00:05.000Z',
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
    const conversation = [
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
    ]

    expect(await listClaudeSessionsInChild(configDir, project)).toEqual({
      sessions: [expect.objectContaining({id: sessionId, derivedTitle: 'Fix the login button'})],
      next: null,
    })
    expect((await history.tail(project, sessionId, {limit: 10, before: null})).messages).toEqual(conversation)
    expect(await history.messages(project, sessionId)).toEqual(conversation)
    expect(
      await foldJsonlFile(
        transcript,
        undefined,
        (found: number | undefined, line) => history.contextTokens?.(line) ?? found,
      ),
    ).toBe(2400)

    const outside = join(tempDir('claude-elsewhere-'), 'planted.jsonl')
    copyFileSync(transcript, outside)
    const linkedId = HarnessSessionId.parse('5b1c2d3e-0000-4000-8000-000000000002')
    symlinkSync(outside, join(folder, `${linkedId}.jsonl`))
    expect(await history.messages(project, linkedId)).toEqual([])
  })
})
