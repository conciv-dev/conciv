import {describe, expect, test} from 'vitest'
import type {UIMessage} from '@tanstack/ai'
import {makeToolNameNormalizer, normalizeHistoryToolNames} from '../../src/chat/tool-names.js'

const REGISTERED = new Set(['canvas_read', 'probe_ping', 'conciv_ui', 'recording_start'])

describe('makeToolNameNormalizer', () => {
  const normalize = makeToolNameNormalizer(REGISTERED)

  test('registered names pass through untouched', () => {
    expect(normalize('canvas_read')).toBe('canvas_read')
    expect(normalize('conciv_ui')).toBe('conciv_ui')
  })

  test('the opencode bridge prefix is stripped back to the registered name', () => {
    expect(normalize('tanstack_probe_ping')).toBe('probe_ping')
    expect(normalize('tanstack_conciv_ui')).toBe('conciv_ui')
  })

  test('an mcp server prefix is stripped back to the registered name', () => {
    expect(normalize('mcp__tanstack__probe_ping')).toBe('probe_ping')
    expect(normalize('mcp__conciv__canvas_read')).toBe('canvas_read')
    expect(normalize('mcp__conciv__conciv_ui')).toBe('conciv_ui')
  })

  test('unknown and CLI-native names stay untouched', () => {
    expect(normalize('Bash')).toBe('Bash')
    expect(normalize('mcp__playwright__click')).toBe('mcp__playwright__click')
    expect(normalize('tanstack_unknown_tool')).toBe('tanstack_unknown_tool')
  })

  test('a legacy dotted name from an old transcript is left exactly as stored', () => {
    expect(normalize('canvas.read')).toBe('canvas.read')
    expect(normalize('mcp__conciv__canvas.read')).toBe('mcp__conciv__canvas.read')
  })

  test('only a whole registered name is recovered, never a punctuation-folded near match', () => {
    const strict = makeToolNameNormalizer(new Set(['canvas_read']))
    expect(strict('canvas-read')).toBe('canvas-read')
    expect(strict('mcp__tanstack__canvas-read')).toBe('mcp__tanstack__canvas-read')
  })
})

describe('normalizeHistoryToolNames', () => {
  test('rewrites tool-call part names, leaves other parts alone', () => {
    const history: UIMessage[] = [
      {id: 'u1', role: 'user', parts: [{type: 'text', content: 'draw'}]},
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {type: 'text', content: 'ok'},
          {type: 'tool-call', id: 't1', name: 'mcp__tanstack__canvas_read', arguments: '{}', state: 'input-complete'},
          {type: 'tool-result', toolCallId: 't1', content: '{}', state: 'complete'},
        ],
      },
    ]
    const normalized = normalizeHistoryToolNames(history, REGISTERED)
    const parts = normalized[1]?.parts ?? []
    expect(parts[1]).toMatchObject({type: 'tool-call', name: 'canvas_read'})
    expect(parts[0]).toEqual({type: 'text', content: 'ok'})
    expect(normalized[0]).toBe(history[0])
  })
})
