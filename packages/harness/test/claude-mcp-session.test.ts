import {describe, it, expect} from 'vitest'
import {claudeMcpArgs, mcpServerConfig} from '../src/claude/args.js'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'

describe('claude MCP server config carries the session (launch path)', () => {
  it('puts the conciv session header on the http server when a session is given', () => {
    const cfg = mcpServerConfig('http://x/api/mcp', 'conciv_abc')
    expect(cfg.conciv.headers?.[CONCIV_SESSION_HEADER]).toBe('conciv_abc')
  })

  it('omits headers when no session is given (interactive launch has no live room)', () => {
    const cfg = mcpServerConfig('http://x/api/mcp')
    expect(cfg.conciv.headers).toBeUndefined()
  })

  it('claudeMcpArgs without a session emits a header-less config with --strict-mcp-config', () => {
    const args = claudeMcpArgs('http://x/api/mcp')
    const cfg = JSON.parse(args[1] ?? '{}')
    expect(cfg.mcpServers.conciv.headers).toBeUndefined()
    expect(args).toContain('--strict-mcp-config')
  })

  it('does not blanket-allow conciv MCP tools so the gate fires', () => {
    expect(claudeMcpArgs('http://x/api/mcp')).not.toContain('--allowedTools')
  })
})
