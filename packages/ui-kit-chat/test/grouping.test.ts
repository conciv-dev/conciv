import {describe, expect, it} from 'vitest'
import type {MessagePart, UIMessage} from '@tanstack/ai-client'
import {coalesceTurns, groupSegments, pairResults} from '../src/store/grouping.js'

function assistant(id: string, parts: MessagePart[]): UIMessage {
  return {id, role: 'assistant', parts}
}

describe('coalesceTurns', () => {
  it('merges consecutive assistant messages into one turn', () => {
    const turns = coalesceTurns([
      {id: 'u1', role: 'user', parts: [{type: 'text', content: 'hi'}]},
      assistant('a1', [{type: 'thinking', content: 'hmm'}]),
      assistant('a2', [{type: 'text', content: 'done'}]),
    ])
    expect(turns).toHaveLength(2)
    expect(turns[1]?.role).toBe('assistant')
    expect(turns[1]?.parts).toHaveLength(2)
  })
})

describe('groupSegments', () => {
  it('folds consecutive thinking + tool parts into one chain, broken by reply text', () => {
    const segments = groupSegments([
      {type: 'thinking', content: 'plan'},
      {type: 'tool-call', id: 't1', name: 'read', arguments: '{}', state: 'complete'},
      {type: 'text', content: 'the answer'},
    ])
    expect(segments).toEqual([
      {kind: 'chain', indices: [0, 1]},
      {kind: 'reply', index: 2},
    ])
  })

  it('ignores blank text as a reply break', () => {
    const segments = groupSegments([
      {type: 'text', content: '   '},
      {type: 'tool-call', id: 't1', name: 'read', arguments: '{}', state: 'complete'},
    ])
    expect(segments).toEqual([{kind: 'chain', indices: [0, 1]}])
  })
})

describe('pairResults', () => {
  it('pairs a tool-result with its call and hides the standalone result', () => {
    const pairing = pairResults([
      {type: 'tool-call', id: 't1', name: 'read', arguments: '{}', state: 'complete'},
      {type: 'tool-result', toolCallId: 't1', content: 'ok', state: 'complete'},
    ])
    expect(pairing.byCallId.get('t1')?.content).toBe('ok')
    expect(pairing.hiddenResultIds.has('t1')).toBe(true)
  })

  it('leaves an orphan result visible', () => {
    const pairing = pairResults([{type: 'tool-result', toolCallId: 'x', content: 'ok', state: 'complete'}])
    expect(pairing.hiddenResultIds.has('x')).toBe(false)
  })
})
