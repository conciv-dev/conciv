import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import type {ElementCapture, ElementCaptureKind} from '@conciv/protocol/element-capture-types'
import {deleteSessionCaptures, sessionCaptures, writeToolCapture} from '../src/capture-queries.js'
import {openDb} from '../src/db.js'

function side(kind: ElementCaptureKind, name: string, cssBundleId = 'cssabc'): ElementCapture {
  return {
    kind,
    ts: 7,
    descriptor: {tagName: 'input', selectorPath: `#${name}`, role: 'textbox', value: '***'},
    node: {type: 2, tagName: 'input', attributes: {'data-rr-target': 'true'}, childNodes: [], id: 3},
    cssBundleId,
  }
}

function unserializableSide(kind: ElementCaptureKind, name: string): ElementCapture {
  return {
    kind,
    ts: 7,
    descriptor: {tagName: 'input', selectorPath: `#${name}`, role: 'textbox', value: '***'},
    node: 10n,
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
      bundle: {
        before: side('before', 'email'),
        after: side('after', 'email'),
        cssBundles: [{hash: 'cssabc', css: 'i{}'}],
      },
    })

    const reopened = await sessionCaptures(openDb(root), 's1')
    expect(reopened.captures.map((row) => row.kind).toSorted()).toEqual(['after', 'before'])
    expect(new Set(reopened.captures.map((row) => row.toolCallId))).toEqual(new Set(['call-1']))
    expect(reopened.cssBundles['cssabc']).toBe('i{}')
  })

  it('stores every css bundle a single call reports, one per side', async () => {
    const root = freshRoot()
    await writeToolCapture(openDb(root), {
      sessionId: 's1',
      toolCallId: 'call-1',
      bundle: {
        before: side('before', 'email', 'cssbefore'),
        after: side('after', 'email', 'cssafter'),
        cssBundles: [
          {hash: 'cssbefore', css: '.a{}'},
          {hash: 'cssafter', css: '.a{}.b{}'},
        ],
      },
    })

    const stored = await sessionCaptures(openDb(root), 's1')
    expect(stored.cssBundles['cssbefore']).toBe('.a{}')
    expect(stored.cssBundles['cssafter']).toBe('.a{}.b{}')
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
      bundle: {after: side('after', 'a'), cssBundles: [{hash: 'cssabc', css: 'i{}'}]},
    })
    await writeToolCapture(db, {sessionId: 's2', toolCallId: 'call-2', bundle: {after: side('after', 'b')}})

    await deleteSessionCaptures(db, 's1')
    expect((await sessionCaptures(db, 's1')).captures).toEqual([])
    const survivor = await sessionCaptures(db, 's2')
    expect(survivor.captures).toHaveLength(1)
    expect(survivor.cssBundles['cssabc']).toBe('i{}')
  })

  it('leaves no orphan css bundle behind when a capture in the same call fails to write', async () => {
    const root = freshRoot()
    const db = openDb(root)
    await expect(
      writeToolCapture(db, {
        sessionId: 's1',
        toolCallId: 'call-1',
        bundle: {
          before: side('before', 'email'),
          after: unserializableSide('after', 'email'),
          cssBundles: [{hash: 'cssabc', css: 'i{}'}],
        },
      }),
    ).rejects.toThrow()

    const stored = await sessionCaptures(db, 's1')
    expect(stored.captures).toEqual([])
    expect(stored.cssBundles).toEqual({})
  })
})
