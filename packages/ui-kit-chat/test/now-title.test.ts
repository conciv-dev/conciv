import {describe, expect, it} from 'vitest'
import type {ToolCallPart} from '@tanstack/ai-client'
import {INERT_TOOL_CATALOG} from '@conciv/protocol/tool-view-types'
import {humanToolName, nowTitle} from '../src/tools/primitives/now-title.js'

function call(name: string, input?: unknown): ToolCallPart {
  return {type: 'tool-call', id: 't1', name, arguments: '{}', input, state: 'input-complete'}
}

function streamingCall(name: string, args: string): ToolCallPart {
  return {type: 'tool-call', id: 't1', name, arguments: args, state: 'input-complete'}
}

describe('humanToolName', () => {
  it('strips the mcp prefix and server segment', () => {
    expect(humanToolName('mcp__tanstack__canvas_svg')).toBe('canvas svg')
    expect(humanToolName('mcp__tanstack__canvas_commit')).toBe('canvas commit')
  })

  it('leaves plain tool names untouched', () => {
    expect(humanToolName('Bash')).toBe('Bash')
    expect(humanToolName('ToolSearch')).toBe('ToolSearch')
  })
})

describe('nowTitle', () => {
  it('humanizes unknown mcp tools', () => {
    expect(nowTitle(call('mcp__tanstack__canvas_preview'), INERT_TOOL_CATALOG)).toBe('canvas preview')
  })

  it('keeps the built-in verb titles', () => {
    expect(nowTitle(call('Bash', {command: 'ls'}), INERT_TOOL_CATALOG)).toBe('Running ls')
  })

  it('reads the streamed arguments when the parsed input is not materialized yet', () => {
    expect(nowTitle(streamingCall('Bash', '{"command":"pnpm test"}'), INERT_TOOL_CATALOG)).toBe('Running pnpm test')
  })

  it('prefers a supplied stream title', () => {
    expect(
      nowTitle(call('mcp__tanstack__canvas_svg'), INERT_TOOL_CATALOG, {mcp__tanstack__canvas_svg: 'Drawing on canvas'}),
    ).toBe('Drawing on canvas')
  })
})
