import {mkdtempSync, readFileSync, readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'
import {claudeChatConfig, claudeExecutable} from '../src/claude/chat.js'

const deps = (over: Partial<HarnessChatDeps> = {}): HarnessChatDeps => ({
  cwd: process.cwd(),
  sessionId: 's1',
  resumeSessionId: null,
  env: {},
  kind: 'chat',
  decide: async () => 'allow',
  ...over,
})

describe('claudeExecutable', () => {
  it('always carries exec (so the sandbox kill hits claude, not a wrapper shell) and --strict-mcp-config', () => {
    expect(claudeExecutable(null)).toBe('exec claude --strict-mcp-config')
  })

  it('adds a quoted --plugin-dir when a plugin dir exists', () => {
    expect(claudeExecutable('/x/plug ins')).toBe("exec claude --strict-mcp-config --plugin-dir '/x/plug ins'")
  })
})

describe('claudeChatConfig', () => {
  it('returns their claude-code adapter for the requested model', () => {
    const config = claudeChatConfig(deps({model: 'opus'}))
    expect(config.adapter.name).toBe('claude-code')
    expect(config.adapter.model).toBe('opus')
  })

  it('keeps permissionMode default so claude consults the approval_prompt bridge (acceptEdits silently runs write commands)', () => {
    const config = claudeChatConfig(deps())
    expect(Reflect.get(config.adapter, 'adapterConfig')).toMatchObject({permissionMode: 'default'})
  })

  it('threads the resume session id through modelOptions and leaves the workdir to the sandbox', () => {
    expect(claudeChatConfig(deps()).modelOptions).toEqual({})
    expect(claudeChatConfig(deps({resumeSessionId: 'r-9'})).modelOptions).toEqual({sessionId: 'r-9'})
  })

  it('caps MCP tool calls above the 120s ui-ask window so blocking conciv_ui times out gracefully first', () => {
    const config = claudeChatConfig(deps())
    expect(Reflect.get(config.adapter, 'adapterConfig')).toMatchObject({env: {MCP_TOOL_TIMEOUT: '150000'}})
  })

  it('caller env wins over the MCP_TOOL_TIMEOUT default', () => {
    const config = claudeChatConfig(deps({env: {MCP_TOOL_TIMEOUT: '999000'}}))
    expect(Reflect.get(config.adapter, 'adapterConfig')).toMatchObject({env: {MCP_TOOL_TIMEOUT: '999000'}})
  })

  it('rewrites a compact turn to /compact', () => {
    const config = claudeChatConfig(deps({kind: 'compact'}))
    const prepared = config.prepareMessages?.([
      {role: 'user', content: 'earlier'},
      {role: 'assistant', content: 'reply'},
      {role: 'user', content: 'please compact'},
    ])
    expect(prepared?.at(-1)).toEqual({role: 'user', content: '/compact'})
  })

  it('writes image parts to @path fileRefs inside .conciv/tmp, never the workspace root', () => {
    const dir = mkdtempSync(join(tmpdir(), 'claude-chat-'))
    const config = claudeChatConfig(deps({cwd: dir}))
    const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const prepared = config.prepareMessages?.([
      {
        role: 'user',
        content: [
          {type: 'text', content: 'look at this'},
          {type: 'image', source: {type: 'data', value: pixel, mimeType: 'image/png'}},
        ],
      },
    ])
    const last = prepared?.at(-1)
    const text =
      last && Array.isArray(last.content)
        ? last.content.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join('\n')
        : ''
    expect(readdirSync(dir).filter((name) => name.startsWith('.conciv-img-'))).toHaveLength(0)
    const tmpDir = join(dir, '.conciv', 'tmp')
    const written = readdirSync(tmpDir).filter((name) => name.startsWith('img-'))
    expect(written).toHaveLength(1)
    expect(text).toContain(`@${join(tmpDir, written[0] ?? '')}`)
    expect(readFileSync(join(tmpDir, written[0] ?? '')).toString('base64')).toBe(pixel)
  })
})
