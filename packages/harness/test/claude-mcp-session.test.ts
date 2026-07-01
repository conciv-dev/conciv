import {describe, it, expect} from 'vitest'
import {buildClaudeArgs, claudeMcpArgs, mcpServerConfig} from '../src/claude/args.js'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import type {HarnessTurn} from '@conciv/protocol/harness-types'

const base: HarnessTurn = {prompt: 'draw a box', cwd: '/repo', resumeSessionId: null, systemPrompt: ''}

// The agent reaches canvas.draw (and every session-scoped tool) over MCP-over-HTTP. Without the session
// header the server resolves sessionId '' and the AI writes into room `local:` while the widget canvas
// watches `local:<session>` — the draw never appears. The MCP config MUST carry the turn's session.
describe('claude MCP server config carries the turn session', () => {
  it('puts the conciv session header on the http server when a session is given', () => {
    const cfg = mcpServerConfig('http://x/api/mcp', 'conciv_abc')
    expect(cfg.conciv.headers?.[CONCIV_SESSION_HEADER]).toBe('conciv_abc')
  })

  it('omits headers when no session is given (interactive launch has no live room)', () => {
    const cfg = mcpServerConfig('http://x/api/mcp')
    expect(cfg.conciv.headers).toBeUndefined()
  })

  it('buildClaudeArgs threads turn.sessionId into the --mcp-config header', () => {
    const args = buildClaudeArgs({...base, mcpUrl: 'http://x/api/mcp', sessionId: 'conciv_xyz'})
    const cfg = JSON.parse(args[args.indexOf('--mcp-config') + 1] ?? '{}')
    expect(cfg.mcpServers.conciv.headers[CONCIV_SESSION_HEADER]).toBe('conciv_xyz')
  })

  it('claudeMcpArgs without a session emits a header-less config', () => {
    const cfg = JSON.parse(claudeMcpArgs('http://x/api/mcp')[1] ?? '{}')
    expect(cfg.mcpServers.conciv.headers).toBeUndefined()
  })
})

describe('claude PreToolUse gate covers extension MCP tools (G2)', () => {
  const turn: HarnessTurn = {...base, permissionUrl: 'http://x/api/chat/permission'}

  it('a PreToolUse matcher matches an mcp__conciv__ tool name and Bash', () => {
    const args = buildClaudeArgs({...turn, mcpUrl: 'http://x/api/mcp'})
    const settings = JSON.parse(args[args.indexOf('--settings') + 1] ?? '{}')
    const matchers: string[] = settings.hooks.PreToolUse.map((entry: {matcher: string}) => entry.matcher)
    expect(matchers.some((matcher) => new RegExp(matcher).test('mcp__conciv__canvas.delete'))).toBe(true)
    expect(matchers.some((matcher) => new RegExp(matcher).test('Bash'))).toBe(true)
  })

  it('does not blanket-allow conciv MCP tools so the gate fires', () => {
    expect(claudeMcpArgs('http://x/api/mcp')).not.toContain('--allowedTools')
    expect(buildClaudeArgs({...turn, mcpUrl: 'http://x/api/mcp'})).not.toContain('--allowedTools')
  })
})
