import {describe, expect, it} from 'vitest'
import type {MessagePart} from '@tanstack/ai-client'
import {PAGE_SESSION_GROUP_KEY, type ToolCallPartWithParent} from '../src/store/grouping.js'
import {createPageSessionGrouper} from '../src/store/page-session.js'

const SMALL_UNITS = 200
const LARGE_UNITS = 1600
const GROWTH = LARGE_UNITS / SMALL_UNITS
const LINEAR_HEADROOM = 1.5

const config = {actNames: new Set(['page_fill']), toolPrefix: 'page_'}

function actChildOf(index: number): ToolCallPartWithParent {
  return {
    type: 'tool-call',
    id: `c${index}`,
    name: 'page_fill',
    arguments: '{}',
    state: 'complete',
    metadata: {parentToolCallId: `p${index}`},
  }
}

function unitParts(index: number): MessagePart[] {
  return [
    {type: 'tool-call', id: `p${index}`, name: 'execute_typescript', arguments: '{}', state: 'complete'},
    {type: 'tool-call', id: `b${index}`, name: 'grep', arguments: '{}', state: 'complete'},
    actChildOf(index),
    {type: 'text', content: `reply ${index}`},
    {type: 'tool-call', id: `d${index}`, name: 'grep', arguments: '{}', state: 'complete'},
  ]
}

function sessionShapedParts(units: number): MessagePart[] {
  return Array.from({length: units}, (_, index) => index).flatMap(unitParts)
}

function typeVisitCountingParts(units: number): {parts: MessagePart[]; visits: () => number} {
  const raw = sessionShapedParts(units)
  let visits = 0
  const parts = raw.map(
    (part) =>
      new Proxy(part, {
        get(target, prop, receiver) {
          if (prop === 'type') visits += 1
          return Reflect.get(target, prop, receiver)
        },
      }),
  )
  return {parts, visits: () => visits}
}

function classifyVisits(units: number): number {
  const {parts, visits} = typeVisitCountingParts(units)
  const grouper = createPageSessionGrouper(config)
  grouper(parts, {toolEntries: [], live: false})
  return visits()
}

describe('page session classification cost', () => {
  it('classifies a session-shaped transcript touching each part a bounded number of times, not its square', () => {
    const small = classifyVisits(SMALL_UNITS)
    const large = classifyVisits(LARGE_UNITS)

    expect(large).toBeLessThanOrEqual(small * GROWTH * LINEAR_HEADROOM)
  })

  it('keeps every act parent, session run and reply boundary that the shape declares', () => {
    const parts = sessionShapedParts(3)
    const grouper = createPageSessionGrouper(config)
    const paths = grouper(parts, {toolEntries: [], live: false})
    const unit = ['group-chain', 'group-chain', PAGE_SESSION_GROUP_KEY, null, 'group-chain']

    expect(paths.map((path) => path?.[0] ?? null)).toEqual([...unit, ...unit, ...unit])
  })
})
