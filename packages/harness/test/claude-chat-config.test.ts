import {mkdtempSync, readFileSync, readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {concivStateDir} from '@conciv/protocol/state-types'
import {describe, expect, it} from 'vitest'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'
import {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {claudeChatConfig, claudeExecutable} from '../src/claude/chat.js'
import {CLAUDE_ASK_RULES} from '../src/claude/ask-rules.js'
import {CHAT_SYSTEM_PROMPT} from '../src/claude/system-prompt.js'

const deps = (over: Partial<HarnessChatDeps> = {}): HarnessChatDeps => ({
  cwd: process.cwd(),
  sessionId: SessionId.parse('conciv_s1'),
  resumeSessionId: null,
  env: {},
  kind: 'chat',
  ...over,
})

describe('CHAT_SYSTEM_PROMPT', () => {
  it('points the agent at discover_tools, the tool that exists', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain('`discover_tools`')
    expect(CHAT_SYSTEM_PROMPT).not.toContain('external_catalog')
  })
})

describe('claudeExecutable', () => {
  it('carries the bare claude binary name and --strict-mcp-config', () => {
    expect(claudeExecutable(null)).toBe('claude --strict-mcp-config')
  })

  it('adds an unquoted --plugin-dir when a plugin dir exists (the adapter argv-splits on plain spaces, not a shell)', () => {
    expect(claudeExecutable('/x/plugins')).toBe('claude --strict-mcp-config --plugin-dir /x/plugins')
  })

  it('throws when the plugin dir contains whitespace, since the adapter splits its executable string on spaces', () => {
    expect(() => claudeExecutable('/x/plug ins')).toThrow(/\/x\/plug ins/)
    expect(() => claudeExecutable('/x/plug ins')).toThrow(/whitespace/)
  })

  it('adds --settings after the plugin dir and refuses a settings path with whitespace', () => {
    expect(claudeExecutable('/x/plugins', '/t/s.json')).toBe(
      'claude --strict-mcp-config --plugin-dir /x/plugins --settings /t/s.json',
    )
    expect(() => claudeExecutable(null, '/t/my s.json')).toThrow(/whitespace/)
  })
})

describe('claudeChatConfig', () => {
  it('returns their claude-code adapter for the requested model', () => {
    const config = claudeChatConfig(deps({model: 'opus'}))
    expect(config.adapter.name).toBe('claude-code')
    expect(config.adapter.model).toBe('opus')
  })

  it('leaves command permissions to the auto mode of the CLI, which escalates through the approval_prompt bridge', () => {
    const config = claudeChatConfig(deps())
    expect(config.modelOptions).toMatchObject({permissionMode: 'auto'})
    expect(Reflect.get(config.adapter, 'adapterConfig')).not.toHaveProperty('permissionMode')
  })

  it('hands claude native ask rules for risky commands through a --settings file, so auto mode escalates them', () => {
    const executable: unknown = Reflect.get(
      Reflect.get(claudeChatConfig(deps()).adapter, 'adapterConfig'),
      'claudeExecutable',
    )
    const settingsPath = String(executable).split(' ').at(-1) ?? ''
    expect(String(executable).split(' ').at(-2)).toBe('--settings')
    const settings: unknown = JSON.parse(readFileSync(settingsPath, 'utf8'))
    expect(settings).toEqual({permissions: {ask: [...CLAUDE_ASK_RULES]}})
    expect(CLAUDE_ASK_RULES).toEqual(
      expect.arrayContaining([
        'Bash(git push * --force*)',
        'Bash(git * push --force*)',
        'Bash(git * push * --force*)',
        'Bash(git * reset --hard*)',
        'Bash(git * clean*)',
        'Bash(git * branch -D*)',
        'Bash(git * gc --prune*)',
        'Bash(git push * --delete*)',
        'Bash(git push * :**)',
        'Bash(git reset --hard*)',
        'Bash(git clean*)',
        'Bash(git branch -D*)',
        'Bash(git gc --prune*)',
        'Bash(rm -r*)',
        'Bash(chmod -R*)',
        'Bash(chown -R*)',
        'Bash(sudo *)',
      ]),
    )
  })

  it('disables the native AskUserQuestion, which has no channel back to the widget and self-answers as declined', () => {
    const config = claudeChatConfig(deps())
    expect(Reflect.get(config.adapter, 'adapterConfig')).toMatchObject({disallowedTools: ['AskUserQuestion']})
  })

  it('allows the bridged conciv tools so claude does not ask a second time before the conciv gate', () => {
    const config = claudeChatConfig(deps())
    expect(Reflect.get(config.adapter, 'adapterConfig')).toMatchObject({allowedTools: ['mcp__tanstack']})
  })

  it('threads the resume session id through modelOptions and leaves the workdir to the sandbox', () => {
    expect(claudeChatConfig(deps()).modelOptions).not.toHaveProperty('sessionId')
    expect(claudeChatConfig(deps({resumeSessionId: HarnessSessionId.parse('r-9')})).modelOptions).toMatchObject({
      sessionId: 'r-9',
    })
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
    const tmpDir = join(concivStateDir(dir), 'tmp')
    const written = readdirSync(tmpDir).filter((name) => name.startsWith('img-'))
    expect(written).toHaveLength(1)
    expect(text).toContain(`@${join(tmpDir, written[0] ?? '')}`)
    expect(readFileSync(join(tmpDir, written[0] ?? '')).toString('base64')).toBe(pixel)
  })
})
