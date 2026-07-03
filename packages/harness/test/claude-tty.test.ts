import {describe, expect, it} from 'vitest'
import {claudeTtyCommand} from '../src/claude/tty.js'

describe('claudeTtyCommand', () => {
  it('resumes an existing session', () => {
    const cmd = claudeTtyCommand({cwd: '/tmp/p', harnessSessionId: 'abc-123', resume: true})
    expect(cmd.bin).toBe('claude')
    expect(cmd.args).toEqual(['--resume', 'abc-123'])
    expect(cmd.env.TERM).toBe('xterm-256color')
  })

  it('pins the session id for a fresh session', () => {
    const cmd = claudeTtyCommand({cwd: '/tmp/p', harnessSessionId: 'abc-123', resume: false})
    expect(cmd.args).toEqual(['--session-id', 'abc-123'])
  })

  it('passes the model through', () => {
    const cmd = claudeTtyCommand({cwd: '/tmp/p', harnessSessionId: 'abc-123', resume: true, model: 'opus'})
    expect(cmd.args).toEqual(['--resume', 'abc-123', '--model', 'opus'])
  })
})
