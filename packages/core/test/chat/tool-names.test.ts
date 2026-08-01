import {describe, expect, test} from 'vitest'
import type {UIMessage} from '@tanstack/ai'
import {makeToolNameNormalizer, normalizeHistoryToolNames} from '../../src/chat/tool-names.js'

const REGISTERED = new Set(['canvas.read', 'probe.ping', 'conciv_ui', 'recording_start'])

describe('makeToolNameNormalizer', () => {
  const normalize = makeToolNameNormalizer(REGISTERED)

  test('registered names pass through untouched', () => {
    expect(normalize('canvas.read')).toBe('canvas.read')
    expect(normalize('conciv_ui')).toBe('conciv_ui')
  })

  test('claude bridge form: underscores map back to the registered dotted name', () => {
    expect(normalize('probe_ping')).toBe('probe.ping')
    expect(normalize('canvas_read')).toBe('canvas.read')
  })

  test('opencode form: tanstack_ prefix stripped then underscores mapped', () => {
    expect(normalize('tanstack_probe_ping')).toBe('probe.ping')
    expect(normalize('tanstack_conciv_ui')).toBe('conciv_ui')
  })

  test('mcp server prefixes stripped against registered names', () => {
    expect(normalize('mcp__tanstack__probe_ping')).toBe('probe.ping')
    expect(normalize('mcp__conciv__canvas_read')).toBe('canvas.read')
    expect(normalize('mcp__conciv__conciv_ui')).toBe('conciv_ui')
  })

  test('underscore-only registered names never get remapped to dotted ones', () => {
    expect(normalize('recording_start')).toBe('recording_start')
  })

  test('unknown and CLI-native names stay untouched', () => {
    expect(normalize('Bash')).toBe('Bash')
    expect(normalize('mcp__playwright__click')).toBe('mcp__playwright__click')
    expect(normalize('tanstack_unknown_tool')).toBe('tanstack_unknown_tool')
  })

  test('ambiguous sanitized collisions stay untouched', () => {
    const collide = makeToolNameNormalizer(new Set(['canvas.read', 'canvas_read']))
    expect(collide('canvas.read')).toBe('canvas.read')
    expect(collide('canvas_read')).toBe('canvas_read')
    const ambiguous = makeToolNameNormalizer(new Set(['a.b', 'a:b', 'x.y']))
    expect(ambiguous('mcp__tanstack__a_b')).toBe('mcp__tanstack__a_b')
    expect(ambiguous('x_y')).toBe('x.y')
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
    expect(parts[1]).toMatchObject({type: 'tool-call', name: 'canvas.read'})
    expect(parts[0]).toEqual({type: 'text', content: 'ok'})
    expect(normalized[0]).toBe(history[0])
  })
})
