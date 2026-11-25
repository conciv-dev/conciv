import {delimiter} from 'node:path'
import {ConfigProvider} from 'effect'
import {describe, expect, it} from 'vitest'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {HarnessSessionId, SessionId} from '@conciv/types/chat-types'
import {hungClaudeOnPath, recordedClaudeOnPath} from '../utils/claude-sdk-env.js'
import {claude, claudeTtyCommand} from '../../src/claude/claude.js'

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
              headers: {'conciv-session-id': 'ses_one'},
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
        concivSessionId: SessionId.parse('ses_one'),
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

describe('the claude login check', () => {
  it('answers not installed with no probe for a PATH with no claude, runs the claude on PATH, answers a check from the held login at once even while its CLI hangs, and a re-check started by a logged-out check or a refresh replaces the held answer', async () => {
    const signal = new AbortController().signal
    const notLoggedIn = {
      loggedIn: false,
      message: 'Claude Code is not logged in. Run `claude auth login` in a terminal.',
    }
    const claudeOnPath = recordedClaudeOnPath()
    const configDir = tempDir('claude-config-')
    const notInstalled = {
      loggedIn: false,
      message: 'Claude Code is not installed. Install it, then run `claude auth login`.',
    }
    const missing = claude(ConfigProvider.fromEnvRecord({PATH: tempDir('no-claude-'), CLAUDE_CONFIG_DIR: configDir}))
    expect(await missing.login({signal})).toEqual(notInstalled)
    expect(await missing.login({signal, refresh: true})).toEqual(notInstalled)
    await expect(missing.models()).rejects.toThrow(notInstalled.message)
    expect(claudeOnPath.started()).toBe(false)

    expect(
      await claude(ConfigProvider.fromEnvRecord({PATH: claudeOnPath.path, CLAUDE_CONFIG_DIR: configDir})).login({
        signal,
      }),
    ).toEqual(notLoggedIn)
    expect(claudeOnPath.started()).toBe(true)

    const hungClaude = hungClaudeOnPath()
    const hung = claude(ConfigProvider.fromEnvRecord({PATH: hungClaude.path, CLAUDE_CONFIG_DIR: configDir}))
    expect(await hung.login({signal})).toEqual(notLoggedIn)
    hungClaude.release()
    await expect(hung.models()).rejects.toThrow()

    const loggedIn = claude(
      ConfigProvider.fromEnvRecord({
        PATH: claudeOnPath.path,
        CLAUDE_CONFIG_DIR: configDir,
        ANTHROPIC_API_KEY: 'sk-ant-test-not-a-real-key',
      }),
    )
    expect(await loggedIn.login({signal})).toEqual(notLoggedIn)
    await loggedIn.models()
    expect(await loggedIn.login({signal})).toEqual({loggedIn: true})

    const loggedOut = claude(ConfigProvider.fromEnvRecord({PATH: claudeOnPath.path, CLAUDE_CONFIG_DIR: configDir}))
    expect(await loggedOut.login({signal})).toEqual({loggedIn: true})
    expect(await loggedOut.login({signal, refresh: true})).toEqual({loggedIn: true})
    await loggedOut.models()
    expect(await loggedOut.login({signal})).toEqual(notLoggedIn)

    const claudeInCwd = recordedClaudeOnPath()
    const emptyEntry = claude(
      ConfigProvider.fromEnvRecord({PATH: `${delimiter}/usr/bin${delimiter}/bin`, CLAUDE_CONFIG_DIR: configDir}),
    )
    const commands = emptyEntry.commands({cwd: claudeInCwd.bin, sessionId: SessionId.parse('ses_one')})
    await expect(commands).resolves.toEqual(expect.any(Array))
    expect(claudeInCwd.started()).toBe(true)

    const claudeInRelativeEntry = recordedClaudeOnPath()
    const relativeEntry = claude(
      ConfigProvider.fromEnvRecord({PATH: `.${delimiter}/usr/bin${delimiter}/bin`, CLAUDE_CONFIG_DIR: configDir}),
    )
    const relativeCommands = relativeEntry.commands({
      cwd: claudeInRelativeEntry.bin,
      sessionId: SessionId.parse('ses_one'),
    })
    await expect(relativeCommands).resolves.toEqual(expect.any(Array))
    expect(claudeInRelativeEntry.started()).toBe(true)
  })
})
