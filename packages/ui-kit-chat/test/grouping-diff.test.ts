import {describe, expect, it} from 'vitest'
import type {MessagePart, UIMessage} from '@tanstack/ai-client'
import {coalesceTurns, defaultGrouper, diffTurns, groupParts, type GroupNode} from '../src/store/grouping.js'

function user(id: string, text: string): UIMessage {
  return {id, role: 'user', parts: [{type: 'text', content: text}]}
}

function assistant(id: string, parts: MessagePart[]): UIMessage {
  return {id, role: 'assistant', parts}
}

function text(content: string): MessagePart {
  return {type: 'text', content}
}

const conversation = (): UIMessage[] => [
  user('u1', 'hello'),
  assistant('a1', [{type: 'thinking', content: 'hmm'}]),
  assistant('a2', [text('answer one')]),
  user('u2', 'more'),
  assistant('a3', [text('answer two')]),
]

describe('diffTurns equivalence', () => {
  const cases: Array<[string, UIMessage[]]> = [
    ['empty', []],
    ['single user', [user('u1', 'hi')]],
    ['single assistant', [assistant('a1', [text('yo')])]],
    ['merged assistant run', conversation()],
    ['leading assistant', [assistant('a1', [text('a')]), user('u1', 'b'), assistant('a2', [text('c')])]],
    [
      'system interleaved',
      [{id: 's1', role: 'system', parts: [text('sys')]}, user('u1', 'q'), assistant('a1', [text('r')])],
    ],
  ]

  for (const [name, messages] of cases) {
    it(`matches coalesceTurns for ${name}`, () => {
      expect(diffTurns([], [], messages)).toEqual(coalesceTurns(messages))
    })
  }

  it('matches coalesceTurns when diffing from any previous state', () => {
    const previousMessages = conversation()
    const previousTurns = diffTurns([], [], previousMessages)
    const next = [...conversation(), assistant('a4', [text('appended')])]
    expect(diffTurns(previousTurns, previousMessages, next)).toEqual(coalesceTurns(next))
  })
})

describe('diffTurns identity reuse', () => {
  it('reuses settled turns across a trailing append', () => {
    const previousMessages = conversation()
    const previousTurns = diffTurns([], [], previousMessages)
    const next = [...previousMessages, user('u3', 'again')]
    const turns = diffTurns(previousTurns, previousMessages, next)
    expect(turns[0]).toBe(previousTurns[0])
    expect(turns[1]).toBe(previousTurns[1])
    expect(turns[2]).toBe(previousTurns[2])
    expect(turns[3]).toBe(previousTurns[3])
    expect(turns[4]?.key).toBe('u3')
  })

  it('reuses settled turns while the last assistant turn streams', () => {
    const previousMessages = conversation()
    const previousTurns = diffTurns([], [], previousMessages)
    const streamed = [...previousMessages]
    streamed[4] = assistant('a3', [text('answer two grew longer')])
    const turns = diffTurns(previousTurns, previousMessages, streamed)
    expect(turns[0]).toBe(previousTurns[0])
    expect(turns[1]).toBe(previousTurns[1])
    expect(turns[2]).toBe(previousTurns[2])
    expect(turns[3]).not.toBe(previousTurns[3])
    expect(turns[3]?.parts[0]).toEqual(text('answer two grew longer'))
  })

  it('rebuilds a merged turn when a new assistant message joins it', () => {
    const previousMessages = conversation()
    const previousTurns = diffTurns([], [], previousMessages)
    const next = [...previousMessages, assistant('a4', [text('tail')])]
    const turns = diffTurns(previousTurns, previousMessages, next)
    expect(turns).toEqual(coalesceTurns(next))
    expect(turns[3]).not.toBe(previousTurns[3])
    expect(turns[3]?.parts).toHaveLength(2)
  })

  it('rebuilds edited mid-history turns and keeps unaffected neighbours', () => {
    const previousMessages = conversation()
    const previousTurns = diffTurns([], [], previousMessages)
    const edited = [...previousMessages]
    edited[0] = user('u1', 'hello edited')
    const turns = diffTurns(previousTurns, previousMessages, edited)
    expect(turns).toEqual(coalesceTurns(edited))
    expect(turns[0]).not.toBe(previousTurns[0])
    expect(turns[1]).toBe(previousTurns[1])
  })

  it('handles truncation', () => {
    const previousMessages = conversation()
    const previousTurns = diffTurns([], [], previousMessages)
    const truncated = previousMessages.slice(0, 3)
    const turns = diffTurns(previousTurns, previousMessages, truncated)
    expect(turns).toEqual(coalesceTurns(truncated))
    expect(turns).toHaveLength(2)
    expect(turns[0]).toBe(previousTurns[0])
  })

  it('keeps each turn identity through a wholesale branch replacement at the same position', () => {
    const previousMessages = conversation()
    const previousTurns = diffTurns([], [], previousMessages)
    const replaced = [user('x1', 'other'), assistant('x2', [text('branch')])]
    const turns = diffTurns(previousTurns, previousMessages, replaced)
    expect(turns.map((turn) => turn.parts)).toEqual(coalesceTurns(replaced).map((turn) => turn.parts))
    expect(turns.map((turn) => turn.key)).toEqual(previousTurns.slice(0, 2).map((turn) => turn.key))
    expect(turns[0]).not.toBe(previousTurns[0])
  })

  it('rebuilds when a role change moves a turn boundary', () => {
    const previousMessages = [user('u1', 'a'), assistant('a1', [text('b')]), assistant('a2', [text('c')])]
    const previousTurns = diffTurns([], [], previousMessages)
    const next: UIMessage[] = [user('u1', 'a'), user('a1', 'b'), assistant('a2', [text('c')])]
    const turns = diffTurns(previousTurns, previousMessages, next)
    expect(turns).toEqual(coalesceTurns(next))
  })
})

describe('group tree keys under append-only streaming', () => {
  const streamed: MessagePart[] = [
    {type: 'thinking', content: 'plan'},
    {type: 'tool-call', id: 't1', name: 'read', arguments: '{}', state: 'complete'},
    {type: 'tool-result', toolCallId: 't1', content: 'ok', state: 'complete'},
    {type: 'text', content: 'the answer'},
    {type: 'tool-call', id: 't2', name: 'confirm', arguments: '{}', state: 'complete'},
  ]

  const keysOf = (parts: MessagePart[]): Array<[string, string | undefined]> =>
    groupParts(parts, defaultGrouper, {}).map((node: GroupNode) => [node.nodeKey, node.idKey])

  it('keeps the keys of already-emitted nodes stable as parts append', () => {
    const prefixes = streamed.map((_part, index) => keysOf(streamed.slice(0, index + 1)))
    const final = keysOf(streamed)
    for (const prefix of prefixes) expect(final.slice(0, prefix.length)).toEqual(prefix)
  })

  it('keys a group by the identity of its first member, leaving id-less first members unkeyed', () => {
    expect(keysOf(streamed)).toEqual([
      ['0', undefined],
      ['1', undefined],
      ['2', 'id:t2'],
    ])
  })
})
