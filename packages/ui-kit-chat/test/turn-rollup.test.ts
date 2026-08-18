import {describe, expect, it} from 'vitest'
import {createRoot} from 'solid-js'
import type {MessagePart} from '@tanstack/ai-client'
import type {Turn} from '../src/store/grouping.js'
import {sessionTotals, summaryLine, turnRollup, type TurnRollup} from '../src/store/turn-rollup.js'

function turn(key: string, parts: MessagePart[]): Turn {
  return {key, role: 'assistant', parts, start: 0, end: 0}
}

function applyPatchCall(id: string, files: Array<{path: string; kind: 'Update' | 'Add' | 'Delete'}>): MessagePart {
  const body = files
    .map((file) => `*** ${file.kind} File: ${file.path}\n@@\n+line one\n+line two\n-old line`)
    .join('\n')
  return {
    type: 'tool-call',
    id,
    name: 'apply_patch',
    arguments: JSON.stringify({patchText: body}),
    state: 'complete',
  }
}

function bashCall(id: string, state: 'complete' | 'input-streaming' = 'complete'): MessagePart {
  return {type: 'tool-call', id, name: 'Bash', arguments: '{}', state}
}

function bashResult(callId: string, exitCode: number): MessagePart {
  return {
    type: 'tool-result',
    toolCallId: callId,
    content: JSON.stringify({stdout: '', stderr: '', exitCode}),
    state: 'complete',
  }
}

describe('turnRollup', () => {
  it('sums adds and dels across apply-patch calls and dedupes repeated files', () => {
    const rollup = turnRollup(
      turn('t1', [
        applyPatchCall('c1', [{path: 'src/a.ts', kind: 'Update'}]),
        applyPatchCall('c2', [
          {path: 'src/a.ts', kind: 'Update'},
          {path: 'src/b.ts', kind: 'Add'},
        ]),
      ]),
    )
    expect(rollup.files.toSorted()).toEqual(['a.ts', 'b.ts'])
    expect(rollup.adds).toBe(6)
    expect(rollup.dels).toBe(3)
    expect(rollup.toolCalls).toBe(2)
  })

  it('counts a bash call with nonzero exit code as failed', () => {
    const rollup = turnRollup(turn('t1', [bashCall('b1'), bashResult('b1', 1)]))
    expect(rollup.failed).toBe(1)
    expect(rollup.live).toBe(false)
  })

  it('does not count a successful bash call as failed', () => {
    const rollup = turnRollup(turn('t1', [bashCall('b1'), bashResult('b1', 0)]))
    expect(rollup.failed).toBe(0)
  })

  it('marks a turn awaiting approval when a call is unresolved approval-requested', () => {
    const rollup = turnRollup(
      turn('t1', [{type: 'tool-call', id: 'p1', name: 'Bash', arguments: '{}', state: 'approval-requested'}]),
    )
    expect(rollup.awaitingApproval).toBe(true)
    expect(rollup.live).toBe(false)
  })

  it('marks a turn live when a call has no settled result', () => {
    const rollup = turnRollup(turn('t1', [bashCall('b1', 'input-streaming')]))
    expect(rollup.live).toBe(true)
  })

  it('reports no files changed when nothing touched a file', () => {
    const rollup = turnRollup(turn('t1', [bashCall('b1'), bashResult('b1', 0)]))
    expect(rollup.files).toEqual([])
  })

  it('tallies calls under their short tool label', () => {
    const rollup = turnRollup(
      turn('t1', [
        bashCall('b1'),
        bashResult('b1', 0),
        {type: 'tool-call', id: 'r1', name: 'Read', arguments: '{}', state: 'complete'},
        {type: 'tool-call', id: 'r2', name: 'Read', arguments: '{}', state: 'complete'},
      ]),
    )
    expect(rollup.tools).toEqual({bash: 1, read: 2})
  })
})

function rollup(overrides: Partial<TurnRollup>): TurnRollup {
  return {
    files: [],
    adds: 0,
    dels: 0,
    toolCalls: 0,
    tools: {},
    failed: 0,
    awaitingApproval: false,
    live: false,
    ...overrides,
  }
}

describe('summaryLine', () => {
  it('formats a files-changed summary with add/del counts', () => {
    expect(summaryLine(rollup({files: ['a.ts', 'b.ts', 'c.ts'], adds: 38, dels: 16, toolCalls: 3}))).toBe(
      '3 files · +38 −16',
    )
  })

  it('says nothing about files for a turn that never touched one', () => {
    expect(summaryLine(rollup({toolCalls: 1, tools: {bash: 1}}))).toBe('1 bash')
  })

  it('tallies the tools a file-less turn ran, singular and plural', () => {
    expect(summaryLine(rollup({toolCalls: 4, tools: {exec: 1, read: 3}}))).toBe('1 exec · 3 reads')
  })

  it('pluralises a sibilant tool label with es rather than a bare s', () => {
    expect(summaryLine(rollup({toolCalls: 2, tools: {bash: 2}}))).toBe('2 bashes')
    expect(summaryLine(rollup({toolCalls: 2, tools: {search: 2}}))).toBe('2 searches')
  })

  it('reports only the failure count for a file-less turn with failures', () => {
    expect(summaryLine(rollup({toolCalls: 2, tools: {bash: 2}, failed: 1}))).toBe('1 failed')
  })

  it('appends a failed count to a files-changed summary', () => {
    expect(summaryLine(rollup({files: ['a.ts'], adds: 1, dels: 0, toolCalls: 2, tools: {edit: 2}, failed: 1}))).toBe(
      '1 file · +1 −0 · 1 failed',
    )
  })

  it('appends awaiting approval when a call is unresolved', () => {
    expect(summaryLine(rollup({toolCalls: 1, tools: {bash: 1}, awaitingApproval: true}))).toBe(
      '1 bash · awaiting approval',
    )
  })

  it('is empty for a segment that ran no tools at all', () => {
    expect(summaryLine(rollup({}))).toBe('')
  })
})

describe('sessionTotals', () => {
  it('sums adds/dels and dedupes files across turns', () => {
    const turns = [
      turn('t1', [applyPatchCall('c1', [{path: 'src/a.ts', kind: 'Update'}])]),
      turn('t2', [
        applyPatchCall('c2', [
          {path: 'src/a.ts', kind: 'Update'},
          {path: 'src/b.ts', kind: 'Add'},
        ]),
      ]),
    ]
    const totals = createRoot((dispose) => {
      const result = sessionTotals(() => turns)()
      dispose()
      return result
    })
    expect(totals.files).toBe(2)
    expect(totals.adds).toBe(6)
    expect(totals.dels).toBe(3)
  })
})
