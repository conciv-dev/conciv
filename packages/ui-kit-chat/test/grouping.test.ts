import {describe, expect, it} from 'vitest'
import type {MessagePart, UIMessage} from '@tanstack/ai-client'
import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {
  childCallsFor,
  coalesceTurns,
  defaultGrouper,
  groupParts,
  pairResults,
  parentToolCallIdOf,
  standaloneToolNames,
  type GroupByContext,
  type GroupNode,
  type Grouper,
  type ToolCallPartWithParent,
} from '../src/store/grouping.js'
import {createPageSessionGrouper} from '../src/store/page-session.js'

function modelOnlyText(content: string): MessagePart {
  const part: MessagePart & {metadata?: unknown} = {type: 'text', content, metadata: {modelOnly: true}}
  return part
}

function assistant(id: string, parts: MessagePart[]): UIMessage {
  return {id, role: 'assistant', parts}
}

type Shape = {group: string; indices: number[]} | {part: number}

function shape(nodes: readonly GroupNode[]): Shape[] {
  return nodes.map((node) =>
    node.type === 'group' ? {group: node.key, indices: [...node.indices]} : {part: node.index},
  )
}

function group(parts: MessagePart[], grouper: Grouper = defaultGrouper, context: GroupByContext = {}): Shape[] {
  return shape(groupParts(parts, grouper, context))
}

const CONFIRM_ENTRY: ToolCardEntry = {names: ['confirm_ui'], render: () => null, display: 'standalone'}
const STANDALONE_CONTEXT: GroupByContext = {toolEntries: [CONFIRM_ENTRY]}

const pageGrouper = createPageSessionGrouper({
  actNames: new Set(['page.click', 'page.fill']),
  toolPrefix: 'page.',
})

const chain = (...indices: number[]): Shape => ({group: 'group-chain', indices})
const session = (...indices: number[]): Shape => ({group: 'group-page-session', indices})
const leaf = (index: number): Shape => ({part: index})

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

describe('default grouper', () => {
  it('folds consecutive thinking + tool parts into one chain group, broken by reply text', () => {
    expect(
      group([
        {type: 'thinking', content: 'plan'},
        {type: 'tool-call', id: 't1', name: 'read', arguments: '{}', state: 'complete'},
        {type: 'text', content: 'the answer'},
      ]),
    ).toEqual([chain(0, 1), leaf(2)])
  })

  it('gives blank text no node of its own and no group membership', () => {
    expect(
      group([
        {type: 'text', content: '   '},
        {type: 'tool-call', id: 't1', name: 'read', arguments: '{}', state: 'complete'},
      ]),
    ).toEqual([chain(1)])
  })

  it('gives a blank thinking part no node, so no group is created for it alone', () => {
    expect(
      group([
        {type: 'thinking', content: ' \n '},
        {type: 'text', content: 'done'},
      ]),
    ).toEqual([leaf(1)])
  })

  it('gives unrenderable data parts no node at all', () => {
    expect(
      group([
        {type: 'structured-output', status: 'complete', raw: '{}'},
        {type: 'structured-output', status: 'complete', raw: '{}'},
        {type: 'text', content: 'done'},
      ]),
    ).toEqual([leaf(2)])
  })

  it('gives a model-only text part no node', () => {
    expect(group([modelOnlyText('for the model'), {type: 'text', content: 'done'}])).toEqual([leaf(1)])
  })

  it('creates no group at all for a run of only unrenderable parts', () => {
    expect(
      group([
        {type: 'structured-output', status: 'complete', raw: '{}'},
        {type: 'thinking', content: '  '},
        {type: 'tool-result', toolCallId: 't1', content: 'ok', state: 'complete'},
      ]),
    ).toEqual([])
  })

  it('never emits a group node without members', () => {
    const nodes = groupParts(
      [
        {type: 'thinking', content: 'plan'},
        {type: 'structured-output', status: 'complete', raw: '{}'},
        {type: 'text', content: 'done'},
      ],
      defaultGrouper,
      {},
    )
    for (const node of nodes) if (node.type === 'group') expect(node.indices.length).toBeGreaterThan(0)
  })
})

describe('page-session grouper', () => {
  it('folds acts into one page-session group and drops their paired results', () => {
    expect(
      group(
        [
          {type: 'tool-call', id: 'p1', name: 'page.click', arguments: '{}', state: 'complete'},
          {type: 'tool-result', toolCallId: 'p1', content: 'ok', state: 'complete'},
          {type: 'tool-call', id: 'p2', name: 'page.fill', arguments: '{}', state: 'complete'},
        ],
        pageGrouper,
      ),
    ).toEqual([session(0, 2)])
  })

  it('folds interleaved page reads and blank text into an open session', () => {
    expect(
      group(
        [
          {type: 'tool-call', id: 'p1', name: 'page.click', arguments: '{}', state: 'complete'},
          {type: 'tool-call', id: 'r1', name: 'page.text', arguments: '{}', state: 'complete'},
          {type: 'text', content: '  '},
          {type: 'tool-call', id: 'p2', name: 'page.fill', arguments: '{}', state: 'complete'},
        ],
        pageGrouper,
      ),
    ).toEqual([session(0, 1, 3)])
  })

  it('keeps a lone read and a foreign result as chain', () => {
    expect(
      group(
        [
          {type: 'tool-call', id: 'r1', name: 'page.text', arguments: '{}', state: 'complete'},
          {type: 'tool-result', toolCallId: 'other', content: 'ok', state: 'complete'},
        ],
        pageGrouper,
      ),
    ).toEqual([chain(0)])
  })

  it('closes the session on reply text and non-page tools', () => {
    expect(
      group(
        [
          {type: 'tool-call', id: 'p1', name: 'page.click', arguments: '{}', state: 'complete'},
          {type: 'text', content: 'clicked it'},
          {type: 'tool-call', id: 'b1', name: 'bash', arguments: '{}', state: 'complete'},
          {type: 'tool-call', id: 'p2', name: 'page.fill', arguments: '{}', state: 'complete'},
        ],
        pageGrouper,
      ),
    ).toEqual([session(0), leaf(1), chain(2), session(3)])
  })

  it('does not resume a session closed by a foreign tool through its stale call ids', () => {
    expect(
      group(
        [
          {type: 'tool-call', id: 'p1', name: 'page.click', arguments: '{}', state: 'complete'},
          {type: 'tool-call', id: 'b1', name: 'bash', arguments: '{}', state: 'complete'},
          {type: 'tool-result', toolCallId: 'p1', content: 'ok', state: 'complete'},
        ],
        pageGrouper,
      ),
    ).toEqual([session(0), chain(1)])
  })

  const codeCall = (id: string, name: string): MessagePart => ({
    type: 'tool-call',
    id,
    name,
    arguments: '{}',
    state: 'complete',
  })

  const subAct = (id: string, parent: string, name = 'page.fill'): MessagePart => {
    const part: ToolCallPartWithParent = {
      type: 'tool-call',
      id,
      name,
      arguments: '{}',
      state: 'complete',
      metadata: {parentToolCallId: parent},
    }
    return part
  }

  it('folds code-mode parent runs, thinking and act subcalls into one session', () => {
    expect(
      group(
        [
          codeCall('p1', 'execute_typescript'),
          {type: 'thinking', content: 'plan the first edit'},
          subAct('s1', 'p1'),
          {type: 'tool-result', toolCallId: 's1', content: 'ok', state: 'complete'},
          {type: 'tool-result', toolCallId: 'p1', content: 'ok', state: 'complete'},
          codeCall('p2', 'execute_typescript'),
          {type: 'thinking', content: 'plan the second edit'},
          subAct('s2', 'p2'),
          {type: 'tool-result', toolCallId: 's2', content: 'ok', state: 'complete'},
          {type: 'tool-result', toolCallId: 'p2', content: 'ok', state: 'complete'},
        ],
        pageGrouper,
      ),
    ).toEqual([session(0, 1, 2, 5, 6, 7)])
  })

  it('keeps a code run without act children in the chain', () => {
    expect(
      group(
        [
          codeCall('q1', 'execute_typescript'),
          subAct('r1', 'q1', 'page.text'),
          {type: 'tool-result', toolCallId: 'r1', content: 'body', state: 'complete'},
          {type: 'tool-call', id: 'f1', name: 'page.fill', arguments: '{}', state: 'complete'},
        ],
        pageGrouper,
      ),
    ).toEqual([chain(0, 1), session(3)])
  })

  it('still closes a code-mode session on reply text', () => {
    expect(
      group(
        [
          codeCall('p1', 'execute_typescript'),
          subAct('s1', 'p1'),
          {type: 'tool-result', toolCallId: 's1', content: 'ok', state: 'complete'},
          {type: 'tool-result', toolCallId: 'p1', content: 'ok', state: 'complete'},
          {type: 'text', content: 'first stretch done'},
          {type: 'tool-call', id: 'f2', name: 'page.fill', arguments: '{}', state: 'complete'},
        ],
        pageGrouper,
      ),
    ).toEqual([session(0, 1), leaf(4), session(5)])
  })

  it('folds thinking between bare acts instead of splitting the session', () => {
    expect(
      group(
        [
          {type: 'tool-call', id: 'f1', name: 'page.fill', arguments: '{}', state: 'complete'},
          {type: 'thinking', content: 'next field'},
          {type: 'tool-call', id: 'f2', name: 'page.fill', arguments: '{}', state: 'complete'},
        ],
        pageGrouper,
      ),
    ).toEqual([session(0, 1, 2)])
  })

  it('keeps non-page subcalls of an absorbed parent inside the session', () => {
    expect(
      group(
        [
          codeCall('p1', 'execute_typescript'),
          subAct('s1', 'p1'),
          {type: 'tool-result', toolCallId: 's1', content: 'ok', state: 'complete'},
          subAct('b1', 'p1', 'bash'),
          {type: 'tool-result', toolCallId: 'b1', content: 'ok', state: 'complete'},
          subAct('s2', 'p1'),
          {type: 'tool-result', toolCallId: 's2', content: 'ok', state: 'complete'},
          {type: 'tool-result', toolCallId: 'p1', content: 'ok', state: 'complete'},
        ],
        pageGrouper,
      ),
    ).toEqual([session(0, 1, 3, 5)])
  })

  it('does not open a session for a parent separated from its act child by reply text', () => {
    expect(
      group(
        [codeCall('p1', 'execute_typescript'), {type: 'text', content: 'let me explain first'}, subAct('s1', 'p1')],
        pageGrouper,
      ),
    ).toEqual([chain(0), leaf(1), session(2)])
  })

  it('leaves an unstamped act child beside its code run instead of correlating them by proximity', () => {
    expect(
      group(
        [
          codeCall('p1', 'execute_typescript'),
          {type: 'tool-call', id: 's1', name: 'page.fill', arguments: '{}', state: 'complete'},
          {type: 'tool-result', toolCallId: 's1', content: 'ok', state: 'complete'},
          {type: 'tool-result', toolCallId: 'p1', content: 'ok', state: 'complete'},
        ],
        pageGrouper,
      ),
    ).toEqual([chain(0), session(1)])
  })

  it('never folds an approval-requested call into a session', () => {
    expect(
      group(
        [
          {type: 'tool-call', id: 'f1', name: 'page.fill', arguments: '{}', state: 'complete'},
          {type: 'tool-result', toolCallId: 'f1', content: 'ok', state: 'complete'},
          {type: 'tool-call', id: 'f2', name: 'page.fill', arguments: '{}', state: 'approval-requested'},
        ],
        pageGrouper,
      ),
    ).toEqual([session(0), chain(2)])
  })

  it('leaves leading thinking before any session member in the chain', () => {
    expect(
      group(
        [
          {type: 'thinking', content: 'survey the page first'},
          {type: 'tool-call', id: 'f1', name: 'page.fill', arguments: '{}', state: 'complete'},
        ],
        pageGrouper,
      ),
    ).toEqual([chain(0), session(1)])
  })

  it('creates no session group for page reads with no act among them', () => {
    expect(
      group(
        [
          {type: 'tool-call', id: 'r1', name: 'page.text', arguments: '{}', state: 'complete'},
          {type: 'tool-result', toolCallId: 'r1', content: 'ok', state: 'complete'},
        ],
        pageGrouper,
      ),
    ).toEqual([chain(0)])
  })

  it('groups page parts as a plain chain under the default grouper', () => {
    expect(
      group([
        {type: 'tool-call', id: 'p1', name: 'page.click', arguments: '{}', state: 'complete'},
        {type: 'tool-result', toolCallId: 'p1', content: 'ok', state: 'complete'},
        {type: 'text', content: 'done'},
      ]),
    ).toEqual([chain(0), leaf(2)])
  })
})

describe('standalone tool calls', () => {
  it('places a standalone tool call as a root leaf', () => {
    expect(
      group(
        [{type: 'tool-call', id: 's1', name: 'confirm_ui', arguments: '{}', state: 'complete'}],
        defaultGrouper,
        STANDALONE_CONTEXT,
      ),
    ).toEqual([leaf(0)])
  })

  it('drops the paired result of a standalone call instead of opening a chain', () => {
    expect(
      group(
        [
          {type: 'tool-call', id: 's1', name: 'confirm_ui', arguments: '{}', state: 'complete'},
          {type: 'tool-result', toolCallId: 's1', content: 'ok', state: 'complete'},
        ],
        defaultGrouper,
        STANDALONE_CONTEXT,
      ),
    ).toEqual([leaf(0)])
  })

  it('still chains a call whose tool is not registered standalone', () => {
    expect(
      group(
        [
          {type: 'tool-call', id: 't1', name: 'read', arguments: '{}', state: 'complete'},
          {type: 'tool-result', toolCallId: 't1', content: 'ok', state: 'complete'},
        ],
        defaultGrouper,
        STANDALONE_CONTEXT,
      ),
    ).toEqual([chain(0)])
  })

  it('keeps a standalone call out of the chain when calls complete out of order', () => {
    expect(
      group(
        [
          {type: 'tool-call', id: 'n1', name: 'read', arguments: '{}', state: 'complete'},
          {type: 'tool-call', id: 's1', name: 'confirm_ui', arguments: '{}', state: 'complete'},
          {type: 'tool-result', toolCallId: 'n1', content: 'ok', state: 'complete'},
          {type: 'tool-result', toolCallId: 's1', content: 'ok', state: 'complete'},
        ],
        defaultGrouper,
        STANDALONE_CONTEXT,
      ),
    ).toEqual([chain(0), leaf(1)])
  })

  it('skips an orphan result with no paired call anywhere', () => {
    expect(
      group([{type: 'tool-result', toolCallId: 'nobody', content: 'ok', state: 'complete'}], defaultGrouper, {}),
    ).toEqual([])
  })

  it('keeps a standalone call as a root leaf under page-session grouping', () => {
    expect(
      group(
        [
          {type: 'tool-call', id: 's1', name: 'confirm_ui', arguments: '{}', state: 'complete'},
          {type: 'tool-result', toolCallId: 's1', content: 'ok', state: 'complete'},
        ],
        pageGrouper,
        STANDALONE_CONTEXT,
      ),
    ).toEqual([leaf(0)])
  })
})

describe('group tree keys', () => {
  it('gives sibling nodes structural keys and claims the identity key from the first member', () => {
    const nodes = groupParts(
      [
        {type: 'thinking', content: 'plan'},
        {type: 'tool-call', id: 't1', name: 'read', arguments: '{}', state: 'complete'},
        {type: 'text', content: 'done'},
      ],
      defaultGrouper,
      {},
    )
    expect(nodes.map((node) => node.nodeKey)).toEqual(['0', '1'])
    expect(nodes.map((node) => node.idKey)).toEqual([undefined, undefined])
  })

  it('claims the identity key of a group from its first tool call', () => {
    const nodes = groupParts(
      [
        {type: 'tool-call', id: 't1', name: 'read', arguments: '{}', state: 'complete'},
        {type: 'tool-call', id: 't2', name: 'read', arguments: '{}', state: 'complete'},
      ],
      defaultGrouper,
      {},
    )
    expect(nodes.map((node) => node.idKey)).toEqual(['id:t1'])
    const [first] = nodes
    expect(first?.type === 'group' && first.children.map((child) => child.idKey)).toEqual(['id:t1', 'id:t2'])
  })
})

describe('nested group paths', () => {
  const nestedGrouper: Grouper = (parts) =>
    parts.map((part) => {
      if (part.type === 'thinking') return ['group-outer', 'group-inner']
      if (part.type === 'tool-call') return ['group-outer']
      return []
    })

  it('coalesces adjacent parts by shared path prefix into one nested tree', () => {
    const nodes = groupParts(
      [
        {type: 'thinking', content: 'first'},
        {type: 'thinking', content: 'second'},
        {type: 'tool-call', id: 't1', name: 'read', arguments: '{}', state: 'complete'},
        {type: 'thinking', content: 'third'},
      ],
      nestedGrouper,
      {},
    )
    expect(nodes).toHaveLength(1)
    const [outer] = nodes
    if (outer?.type !== 'group') throw new Error('expected a group node')
    expect(outer.key).toBe('group-outer')
    expect([...outer.indices]).toEqual([0, 1, 2, 3])
    expect(outer.children.map((child) => child.type)).toEqual(['group', 'part', 'group'])
    const [firstInner, , secondInner] = outer.children
    if (firstInner?.type !== 'group' || secondInner?.type !== 'group') throw new Error('expected inner groups')
    expect(firstInner.key).toBe('group-inner')
    expect([...firstInner.indices]).toEqual([0, 1])
    expect([...secondInner.indices]).toEqual([3])
  })

  it('assigns structural node keys per depth and claims identity keys at every level', () => {
    const nodes = groupParts(
      [
        {type: 'tool-call', id: 'p1', name: 'run', arguments: '{}', state: 'complete'},
        {type: 'thinking', content: 'plan'},
      ],
      nestedGrouper,
      {},
    )
    const [outer] = nodes
    if (outer?.type !== 'group') throw new Error('expected a group node')
    expect(outer.nodeKey).toBe('0')
    expect(outer.idKey).toBe('id:p1')
    expect(outer.children.map((child) => child.nodeKey)).toEqual(['0.0', '0.1'])
    const [leaf, inner] = outer.children
    expect(leaf?.type).toBe('part')
    if (inner?.type !== 'group') throw new Error('expected an inner group')
    expect(inner.children.map((child) => child.nodeKey)).toEqual(['0.1.0'])
  })

  it('closes only the unshared suffix when the path prefix changes', () => {
    const nodes = groupParts(
      [
        {type: 'thinking', content: 'deep'},
        {type: 'tool-call', id: 't1', name: 'read', arguments: '{}', state: 'complete'},
        {type: 'thinking', content: 'deep again'},
        {type: 'text', content: 'done'},
      ],
      nestedGrouper,
      {},
    )
    expect(shape(nodes)).toEqual([{group: 'group-outer', indices: [0, 1, 2]}, leaf(3)])
  })

  it('keeps a two-level path as one top-level node so the turn estimator treats nested groups flat', () => {
    const nodes = groupParts(
      [
        {type: 'thinking', content: 'first'},
        {type: 'thinking', content: 'second'},
      ],
      nestedGrouper,
      {},
    )
    expect(nodes).toHaveLength(1)
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

describe('image parts', () => {
  it('places an image part as a root leaf so the grouped primitive path still renders it', () => {
    expect(
      group([
        {type: 'thinking', content: 'looking'},
        {type: 'image', source: {type: 'url', value: 'https://example.com/diagram.png'}},
        {type: 'text', content: 'here it is'},
      ]),
    ).toEqual([chain(0), leaf(1), leaf(2)])
  })
})

describe('standaloneToolNames', () => {
  it('lets the first entry claiming a name decide, matching card resolution', () => {
    const inlineFirst: ToolCardEntry = {names: ['confirm_ui'], render: () => null}
    const context: GroupByContext = {toolEntries: [inlineFirst, CONFIRM_ENTRY]}
    expect([...standaloneToolNames(context)]).toEqual([])
    expect(
      group(
        [{type: 'tool-call', id: 's1', name: 'confirm_ui', arguments: '{}', state: 'complete'}],
        defaultGrouper,
        context,
      ),
    ).toEqual([chain(0)])
  })

  it('marks the name standalone when the first entry claiming it is standalone', () => {
    const context: GroupByContext = {toolEntries: [CONFIRM_ENTRY, {names: ['confirm_ui'], render: () => null}]}
    expect([...standaloneToolNames(context)]).toEqual(['confirm_ui'])
  })
})
