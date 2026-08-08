import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import type {ElementCapture, ElementCaptureKind} from '@conciv/protocol/element-capture-types'
import {deleteSessionCaptures, sessionCaptures, writeToolCapture} from '../src/capture-queries.js'
import {openDb} from '../src/db.js'

function side(kind: ElementCaptureKind, name: string): ElementCapture {
  return {
    kind,
    ts: 7,
    descriptor: {tagName: 'input', selectorPath: `#${name}`, role: 'textbox', value: '***'},
    node: {type: 2, tagName: 'input', attributes: {'data-rr-target': 'true'}, childNodes: [], id: 3},
    cssBundleId: 'cssabc',
  }
}

function freshRoot(): string {
  return mkdtempSync(join(tmpdir(), 'conciv-captures-'))
}

describe('tool captures outlive the run that produced them', () => {
  it('keeps both sides of one tool call and hands them back after the database is reopened', async () => {
    const root = freshRoot()
    await writeToolCapture(openDb(root), {
      sessionId: 's1',
      toolCallId: 'call-1',
      bundle: {before: side('before', 'email'), after: side('after', 'email'), cssBundle: {hash: 'cssabc', css: 'i{}'}},
    })

    const reopened = await sessionCaptures(openDb(root), 's1')
    expect(reopened.captures.map((row) => row.kind).toSorted()).toEqual(['after', 'before'])
    expect(new Set(reopened.captures.map((row) => row.toolCallId))).toEqual(new Set(['call-1']))
    expect(reopened.cssBundles['cssabc']).toBe('i{}')
  })

  it('replaces a side rather than duplicating it when the same call reports twice', async () => {
    const root = freshRoot()
    const db = openDb(root)
    await writeToolCapture(db, {sessionId: 's1', toolCallId: 'call-1', bundle: {after: side('after', 'first')}})
    await writeToolCapture(db, {sessionId: 's1', toolCallId: 'call-1', bundle: {after: side('after', 'second')}})
    const stored = await sessionCaptures(db, 's1')
    expect(stored.captures).toHaveLength(1)
    expect(stored.captures[0]?.capture.descriptor.selectorPath).toBe('#second')
  })

  it('drops a session capture and only the css bundles nothing else references', async () => {
    const root = freshRoot()
    const db = openDb(root)
    await writeToolCapture(db, {
      sessionId: 's1',
      toolCallId: 'call-1',
      bundle: {after: side('after', 'a'), cssBundle: {hash: 'cssabc', css: 'i{}'}},
    })
    await writeToolCapture(db, {sessionId: 's2', toolCallId: 'call-2', bundle: {after: side('after', 'b')}})

    await deleteSessionCaptures(db, 's1')
    expect((await sessionCaptures(db, 's1')).captures).toEqual([])
    const survivor = await sessionCaptures(db, 's2')
    expect(survivor.captures).toHaveLength(1)
    expect(survivor.cssBundles['cssabc']).toBe('i{}')
  })
})
