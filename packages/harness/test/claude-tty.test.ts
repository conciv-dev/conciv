import {describe, expect, it} from 'vitest'
import {claudeTtyCommand} from '../src/claude/tty.js'

describe('claudeTtyCommand', () => {
  it('resumes an existing session', () => {
    const cmd = claudeTtyCommand({cwd: '/tmp/p', harnessSessionId: 'abc-123', resume: true})
    expect(cmd.bin).toBe('claude')
    expect(cmd.args).toEqual(['--resume', 'abc-123'])
    expect(cmd.env.TERM).toBe('xterm-256color')
  })

  it('strips nested claude session markers so transcripts persist', () => {
    const cmd = claudeTtyCommand({cwd: '/tmp/p', harnessSessionId: 'abc-123', resume: false})
    expect(cmd.unsetEnvPrefixes).toContain('CLAUDECODE')
    expect(cmd.unsetEnvPrefixes).toContain('CLAUDE_CODE_')
  })

  it('pins the session id for a fresh session', () => {
    const cmd = claudeTtyCommand({cwd: '/tmp/p', harnessSessionId: 'abc-123', resume: false})
    expect(cmd.args).toEqual(['--session-id', 'abc-123'])
  })

  it('passes the model through', () => {
    const cmd = claudeTtyCommand({cwd: '/tmp/p', harnessSessionId: 'abc-123', resume: true, model: 'opus'})
    expect(cmd.args).toEqual(['--resume', 'abc-123', '--model', 'opus'])
  })

  it('appends conciv mcp args when mcpUrl provided', () => {
    const cmd = claudeTtyCommand({
      cwd: '/tmp/p',
      harnessSessionId: 'tok-1',
      resume: false,
      mcpUrl: 'http://localhost:4111/api/mcp',
      concivSessionId: 'conciv-1',
    })
    const joined = cmd.args.join(' ')
    expect(joined).toContain('--mcp-config')
    expect(joined).toContain('--strict-mcp-config')
    expect(joined).toContain('http://localhost:4111/api/mcp')
    expect(joined).toContain('conciv-1')
  })

  it('omits mcp args without mcpUrl', () => {
    const cmd = claudeTtyCommand({cwd: '/tmp/p', harnessSessionId: 'tok-1', resume: true})
    expect(cmd.args.join(' ')).not.toContain('--mcp-config')
  })
})
