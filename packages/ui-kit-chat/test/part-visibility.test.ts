import {describe, expect, it} from 'vitest'
import {partIsModelOnly} from '../src/primitives/message-part/part-visibility.js'
import type {MessagePart} from '@tanstack/ai-client'
import {defaultGrouper, groupParts} from '../src/store/grouping.js'

function modelOnlyText(content: string): MessagePart {
  const part: MessagePart & {metadata?: unknown} = {type: 'text', content, metadata: {modelOnly: true}}
  return part
}

describe('partIsModelOnly', () => {
  it('detects the marker', () => {
    expect(partIsModelOnly({type: 'text', content: 'x', metadata: {modelOnly: true}})).toBe(true)
  })

  it('is false without the marker or with other metadata', () => {
    expect(partIsModelOnly({type: 'text', content: 'x'})).toBe(false)
    expect(partIsModelOnly({type: 'text', content: 'x', metadata: {other: 1}})).toBe(false)
  })
})

describe('model-only parts in the group tree', () => {
  it('gives a model-only part no node and no group membership', () => {
    const nodes = groupParts(
      [modelOnlyText('hidden from the reader'), {type: 'text', content: 'visible'}],
      defaultGrouper,
      {},
    )
    expect(nodes).toEqual([{type: 'part', index: 1, nodeKey: '0', idKey: undefined}])
  })
})
