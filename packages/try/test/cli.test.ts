import {describe, expect, it} from 'vitest'
import {attachCommand, plainLines} from '../src/cli.js'

describe('plainLines', () => {
  it('keeps the greppable connected line and prints the mcp attach command', () => {
    const lines = plainLines({type: 'started', port: 4732, harness: 'claude'}, 'tok-1')
    expect(lines[0]).toBe('connected: conciv core on 127.0.0.1:4732 (harness: claude)')
    expect(lines[1]).toBe('return to your browser tab and keep this command running')
    expect(lines[3]).toBe(`  ${attachCommand(4732, 'tok-1')}`)
  })
  it('renders both seed outcomes', () => {
    expect(plainLines({type: 'seeded', seeded: true}, 'tok-1')).toEqual([
      'workspace seeded with the landing-page source',
    ])
    expect(plainLines({type: 'seeded', seeded: false}, 'tok-1')).toEqual([
      'no source manifest found, continuing unseeded',
    ])
  })
  it('announces browser pairing', () => {
    expect(plainLines({type: 'client-connected'}, 'tok-1')).toEqual(['browser paired: the widget is live'])
  })
})

describe('attachCommand', () => {
  it('builds a session-scoped claude --continue command with the token-gated mcp url', () => {
    const command = attachCommand(4733, 'tok-abc')
    expect(command).toContain('claude --continue --mcp-config ')
    expect(command).toContain('http://127.0.0.1:4733/t/tok-abc/api/mcp')
    expect(command).toContain('"alwaysLoad":true')
    expect(command).not.toContain('--strict-mcp-config')
  })
})
