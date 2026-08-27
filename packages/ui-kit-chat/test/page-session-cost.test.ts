import {describe, expect, it} from 'vitest'
import type {MessagePart} from '@tanstack/ai-client'
import {PAGE_SESSION_GROUP_KEY, type ToolCallPartWithParent} from '../src/store/grouping.js'
import {createPageSessionGrouper} from '../src/store/page-session.js'

const SMALL_UNITS = 200
const LARGE_UNITS = 1600
const GROWTH = LARGE_UNITS / SMALL_UNITS
const LINEAR_HEADROOM = 1.5
const SAMPLES = 7

const config = {actNames: new Set(['page.fill']), toolPrefix: 'page.'}

function actChildOf(index: number): ToolCallPartWithParent {
  return {
    type: 'tool-call',
    id: `c${index}`,
    name: 'page.fill',
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

function classifyCost(units: number): number {
  const parts = sessionShapedParts(units)
  const grouper = createPageSessionGrouper(config)
  const samples = Array.from({length: SAMPLES}, () => {
    const start = performance.now()
    grouper(parts, {toolEntries: [], live: false})
    return performance.now() - start
  })
  return Math.min(...samples)
}

describe('page session classification cost', () => {
  it('classifies a session-shaped transcript in time that grows with its length, not its square', () => {
    const small = classifyCost(SMALL_UNITS)
    const large = classifyCost(LARGE_UNITS)

    expect(large / small).toBeLessThanOrEqual(GROWTH * LINEAR_HEADROOM)
  })

  it('keeps every act parent, session run and reply boundary that the shape declares', () => {
    const parts = sessionShapedParts(3)
    const grouper = createPageSessionGrouper(config)
    const paths = grouper(parts, {toolEntries: [], live: false})
    const unit = ['group-chain', 'group-chain', PAGE_SESSION_GROUP_KEY, null, 'group-chain']

    expect(paths.map((path) => path?.[0] ?? null)).toEqual([...unit, ...unit, ...unit])
  })
})
