import {describe, expect, it} from 'vitest'
import type {MessagePart, UIMessage} from '@tanstack/ai-client'
import {
  childCallsFor,
  coalesceTurns,
  groupSegments,
  pairResults,
  parentToolCallIdOf,
  type ToolCallPartWithParent,
} from '../src/store/grouping.js'

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

describe('groupSegments page-session', () => {
  const pageOptions = {pageActNames: new Set(['page.click', 'page.fill']), pageToolPrefix: 'page.'}

  it('folds acts and their paired results into one page-session segment', () => {
    const segments = groupSegments(
      [
        {type: 'tool-call', id: 'p1', name: 'page.click', arguments: '{}', state: 'complete'},
        {type: 'tool-result', toolCallId: 'p1', content: 'ok', state: 'complete'},
        {type: 'tool-call', id: 'p2', name: 'page.fill', arguments: '{}', state: 'complete'},
      ],
      pageOptions,
    )
    expect(segments).toEqual([{kind: 'page-session', indices: [0, 1, 2]}])
  })

  it('folds interleaved page reads and blank text into an open session', () => {
    const segments = groupSegments(
      [
        {type: 'tool-call', id: 'p1', name: 'page.click', arguments: '{}', state: 'complete'},
        {type: 'tool-call', id: 'r1', name: 'page.text', arguments: '{}', state: 'complete'},
        {type: 'text', content: '  '},
        {type: 'tool-call', id: 'p2', name: 'page.fill', arguments: '{}', state: 'complete'},
      ],
      pageOptions,
    )
    expect(segments).toEqual([{kind: 'page-session', indices: [0, 1, 2, 3]}])
  })

  it('folds the result of a folded read into the open session', () => {
    const segments = groupSegments(
      [
        {type: 'tool-call', id: 'p1', name: 'page.click', arguments: '{}', state: 'complete'},
        {type: 'tool-result', toolCallId: 'p1', content: 'ok', state: 'complete'},
        {type: 'tool-call', id: 'r1', name: 'page.text', arguments: '{}', state: 'complete'},
        {type: 'tool-result', toolCallId: 'r1', content: 'body text', state: 'complete'},
        {type: 'tool-call', id: 'p2', name: 'page.fill', arguments: '{}', state: 'complete'},
      ],
      pageOptions,
    )
    expect(segments).toEqual([{kind: 'page-session', indices: [0, 1, 2, 3, 4]}])
  })

  it('keeps a lone read and a foreign result as chain', () => {
    const segments = groupSegments(
      [
        {type: 'tool-call', id: 'r1', name: 'page.text', arguments: '{}', state: 'complete'},
        {type: 'tool-result', toolCallId: 'other', content: 'ok', state: 'complete'},
      ],
      pageOptions,
    )
    expect(segments).toEqual([{kind: 'chain', indices: [0, 1]}])
  })

  it('closes the session on reply text and non-page tools', () => {
    const segments = groupSegments(
      [
        {type: 'tool-call', id: 'p1', name: 'page.click', arguments: '{}', state: 'complete'},
        {type: 'text', content: 'clicked it'},
        {type: 'tool-call', id: 'b1', name: 'bash', arguments: '{}', state: 'complete'},
        {type: 'tool-call', id: 'p2', name: 'page.fill', arguments: '{}', state: 'complete'},
      ],
      pageOptions,
    )
    expect(segments).toEqual([
      {kind: 'page-session', indices: [0]},
      {kind: 'reply', index: 1},
      {kind: 'chain', indices: [2]},
      {kind: 'page-session', indices: [3]},
    ])
  })

  it('leaves a result for a call outside the open session in the chain', () => {
    const segments = groupSegments(
      [
        {type: 'tool-call', id: 'p1', name: 'page.click', arguments: '{}', state: 'complete'},
        {type: 'tool-result', toolCallId: 'foreign', content: 'ok', state: 'complete'},
      ],
      pageOptions,
    )
    expect(segments).toEqual([
      {kind: 'page-session', indices: [0]},
      {kind: 'chain', indices: [1]},
    ])
  })

  it('does not resume a session closed by a foreign tool through its stale call ids', () => {
    const segments = groupSegments(
      [
        {type: 'tool-call', id: 'p1', name: 'page.click', arguments: '{}', state: 'complete'},
        {type: 'tool-call', id: 'b1', name: 'bash', arguments: '{}', state: 'complete'},
        {type: 'tool-result', toolCallId: 'p1', content: 'ok', state: 'complete'},
      ],
      pageOptions,
    )
    expect(segments).toEqual([
      {kind: 'page-session', indices: [0]},
      {kind: 'chain', indices: [1, 2]},
    ])
  })

  it('groups page parts as plain chain when no options are passed', () => {
    const parts: MessagePart[] = [
      {type: 'tool-call', id: 'p1', name: 'page.click', arguments: '{}', state: 'complete'},
      {type: 'tool-result', toolCallId: 'p1', content: 'ok', state: 'complete'},
      {type: 'text', content: 'done'},
    ]
    expect(groupSegments(parts)).toEqual([
      {kind: 'chain', indices: [0, 1]},
      {kind: 'reply', index: 2},
    ])
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

function childPart(id: string, parent: string): MessagePart {
  const part: ToolCallPartWithParent = {
    type: 'tool-call',
    id,
    name: 'canvas.svg',
    arguments: '{}',
    state: 'complete',
    metadata: {parentToolCallId: parent},
  }
  return part
}

describe('parentToolCallIdOf', () => {
  it('reads the parent id from tool-call metadata', () => {
    expect(parentToolCallIdOf(childPart('c1', 'p1'))).toBe('p1')
  })

  it('returns null for parts without parent metadata', () => {
    expect(parentToolCallIdOf({type: 'tool-call', id: 't1', name: 'read', arguments: '{}', state: 'complete'})).toBe(
      null,
    )
    expect(parentToolCallIdOf({type: 'text', content: 'hi'})).toBe(null)
  })
})

describe('childCallsFor', () => {
  it('collects tool-call parts whose parent matches, in order', () => {
    const parts: MessagePart[] = [
      {type: 'tool-call', id: 'p1', name: 'execute_typescript', arguments: '{}', state: 'complete'},
      childPart('c1', 'p1'),
      childPart('c2', 'p1'),
      childPart('other', 'p2'),
      {type: 'text', content: 'done'},
    ]
    expect(childCallsFor(parts, 'p1').map((part) => part.id)).toEqual(['c1', 'c2'])
    expect(childCallsFor(parts, 'p2').map((part) => part.id)).toEqual(['other'])
    expect(childCallsFor(parts, 'none')).toEqual([])
  })
})
