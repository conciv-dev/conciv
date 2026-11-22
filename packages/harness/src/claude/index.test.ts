import {ConfigProvider} from 'effect'
import {describe, expect, it} from 'vitest'
import {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {claude, claudeTtyCommand} from './index.js'

describe('claude', () => {
  it.each([
    {
      terminal: 'a resumed terminal session carries the session, the model and the conciv tools',
      resume: true,
      model: 'opus',
      mcpUrl: 'http://127.0.0.1:4100/api/mcp',
      args: [
        '--resume',
        '5b1c2d3e-0000-4000-8000-000000000001',
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
    },
    {
      terminal: 'a new terminal session starts with its id and without a model or tools',
      resume: false,
      model: null,
      mcpUrl: null,
      args: ['--session-id', '5b1c2d3e-0000-4000-8000-000000000001'],
    },
  ])('the resume command carries the session, and $terminal', ({resume, model, mcpUrl, args}) => {
    const nativeId = HarnessSessionId.parse('5b1c2d3e-0000-4000-8000-000000000001')

    expect(claude(ConfigProvider.fromEnvRecord({})).resume.command({cwd: '/workspace', nativeId})).toEqual({
      bin: 'claude',
      args: ['--resume', nativeId],
    })
    expect(
      claudeTtyCommand({
        cwd: '/workspace',
        stateDir: '/workspace/.conciv',
        concivSessionId: SessionId.parse('conciv_one'),
        harnessSessionId: nativeId,
        resume,
        model,
        mcpUrl,
      }),
    ).toEqual({
      bin: 'claude',
      args,
      env: {TERM: 'xterm-256color', COLORTERM: 'truecolor'},
      unsetEnvPrefixes: ['CLAUDECODE', 'CLAUDE_CODE_', 'CLAUDE_EFFORT', 'AI_AGENT'],
    })
  })
})
