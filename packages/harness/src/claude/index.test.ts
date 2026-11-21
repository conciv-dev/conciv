import {ConfigProvider} from 'effect'
import {describe, expect, it} from 'vitest'
import {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {claude, claudeTtyCommand} from './index.js'

describe('claude', () => {
  it('the resume and terminal commands carry the session, the model and the conciv tools', () => {
    const nativeId = HarnessSessionId.parse('5b1c2d3e-0000-4000-8000-000000000001')
    const harness = claude(ConfigProvider.fromEnvRecord({}))

    expect(harness.resume.command({cwd: '/workspace', nativeId})).toEqual({
      bin: 'claude',
      args: ['--resume', nativeId],
    })
    expect(
      claudeTtyCommand({
        cwd: '/workspace',
        stateDir: '/workspace/.conciv',
        concivSessionId: SessionId.parse('conciv_one'),
        harnessSessionId: nativeId,
        resume: true,
        model: 'opus',
        mcpUrl: 'http://127.0.0.1:4100/api/mcp',
      }),
    ).toEqual({
      bin: 'claude',
      args: [
        '--resume',
        nativeId,
        '--model',
        'opus',
        '--mcp-config',
        JSON.stringify({
          mcpServers: {
            conciv: {
              type: 'http',
              url: 'http://127.0.0.1:4100/api/mcp',
              headers: {'conciv-session-id': 'conciv_one'},
            },
          },
        }),
        '--strict-mcp-config',
      ],
      env: {TERM: 'xterm-256color', COLORTERM: 'truecolor'},
      unsetEnvPrefixes: ['CLAUDECODE', 'CLAUDE_CODE_', 'CLAUDE_EFFORT', 'AI_AGENT'],
    })
  })

  it('a new terminal session starts with its id and without a model or tools', () => {
    const nativeId = HarnessSessionId.parse('5b1c2d3e-0000-4000-8000-000000000002')

    const command = claudeTtyCommand({
      cwd: '/workspace',
      stateDir: '/workspace/.conciv',
      concivSessionId: SessionId.parse('conciv_two'),
      harnessSessionId: nativeId,
      resume: false,
      model: null,
      mcpUrl: null,
    })

    expect(command.args).toEqual(['--session-id', nativeId])
  })
})
