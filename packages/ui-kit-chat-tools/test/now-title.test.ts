import {describe, expect, it} from 'vitest'
import type {ToolCallPart} from '@tanstack/ai-client'
import {humanToolName, nowTitle} from '../src/primitives/tools/now-title.js'

function call(name: string, input?: unknown): ToolCallPart {
  return {type: 'tool-call', id: 't1', name, arguments: '{}', input, state: 'input-complete'}
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
    expect(nowTitle(call('mcp__tanstack__canvas_preview'))).toBe('canvas preview')
  })

  it('keeps the built-in verb titles', () => {
    expect(nowTitle(call('Bash', {command: 'ls'}))).toBe('Running ls')
  })

  it('prefers a supplied stream title', () => {
    expect(nowTitle(call('mcp__tanstack__canvas_svg'), {mcp__tanstack__canvas_svg: 'Drawing on canvas'})).toBe(
      'Drawing on canvas',
    )
  })
})
