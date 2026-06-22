import {describe, it, expect} from 'vitest'
import {buildClaudeArgs, claudeMcpArgs, mcpServerConfig} from '../src/claude/args.js'
import {MANDARAX_SESSION_HEADER} from '@mandarax/protocol/chat-types'
import type {HarnessTurn} from '@mandarax/protocol/harness-types'

const base: HarnessTurn = {prompt: 'draw a box', cwd: '/repo', resumeSessionId: null, systemPrompt: ''}

// The agent reaches canvas.draw (and every session-scoped tool) over MCP-over-HTTP. Without the session
// header the server resolves sessionId '' and the AI writes into room `local:` while the widget canvas
// watches `local:<session>` — the draw never appears. The MCP config MUST carry the turn's session.
describe('claude MCP server config carries the turn session', () => {
  it('puts the mandarax session header on the http server when a session is given', () => {
    const cfg = mcpServerConfig('http://x/api/mcp', 'mandarax_abc')
    expect(cfg.mandarax.headers?.[MANDARAX_SESSION_HEADER]).toBe('mandarax_abc')
  })

  it('omits headers when no session is given (interactive launch has no live room)', () => {
    const cfg = mcpServerConfig('http://x/api/mcp')
    expect(cfg.mandarax.headers).toBeUndefined()
  })

  it('buildClaudeArgs threads turn.sessionId into the --mcp-config header', () => {
    const args = buildClaudeArgs({...base, mcpUrl: 'http://x/api/mcp', sessionId: 'mandarax_xyz'})
    const cfg = JSON.parse(args[args.indexOf('--mcp-config') + 1] ?? '{}')
    expect(cfg.mcpServers.mandarax.headers[MANDARAX_SESSION_HEADER]).toBe('mandarax_xyz')
  })

  it('claudeMcpArgs without a session emits a header-less config', () => {
    const cfg = JSON.parse(claudeMcpArgs('http://x/api/mcp')[1] ?? '{}')
    expect(cfg.mcpServers.mandarax.headers).toBeUndefined()
  })
})
