import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {makeTranscriptWatch} from '../src/transcript-watch.js'

type Stat = {mtimeMs: number; size: number}

function makeStats(initial: Record<string, Stat | null>) {
  const files = new Map(Object.entries(initial))
  return {
    files,
    keys: () => [...files.keys()],
    stat: (key: string) => Promise.resolve(files.get(key) ?? null),
  }
}

async function flush(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

function startWatch(initial: Record<string, Stat | null>) {
  const files = makeStats(initial)
  const changed: string[] = []
  const watch = makeTranscriptWatch({...files, onChange: (key) => changed.push(key), intervalMs: 100})
  return {files: files.files, changed, dispose: watch.start()}
}

describe('transcript watch', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('takes a baseline on the first observation and stays silent', async () => {
    const {changed, dispose} = startWatch({a: {mtimeMs: 1, size: 10}})
    await flush(300)
    expect(changed).toEqual([])
    dispose()
  })

  it('fires when the fingerprint changes', async () => {
    const {files, changed, dispose} = startWatch({a: {mtimeMs: 1, size: 10}})
    await flush(100)
    files.set('a', {mtimeMs: 2, size: 20})
    await flush(100)
    expect(changed).toEqual(['a'])
    await flush(200)
    expect(changed).toEqual(['a'])
    files.set('a', {mtimeMs: 2, size: 21})
    await flush(100)
    expect(changed).toEqual(['a', 'a'])
    dispose()
  })

  it('watches keys that appear later', async () => {
    const {files, changed, dispose} = startWatch({a: {mtimeMs: 1, size: 10}})
    await flush(100)
    files.set('b', {mtimeMs: 5, size: 1})
    await flush(100)
    expect(changed).toEqual([])
    files.set('b', {mtimeMs: 6, size: 2})
    await flush(100)
    expect(changed).toEqual(['b'])
    dispose()
  })

  it('ignores keys with no transcript file', async () => {
    const {changed, dispose} = startWatch({a: null})
    await flush(500)
    expect(changed).toEqual([])
    dispose()
  })

  it('stops polling after dispose', async () => {
    const files = makeStats({a: {mtimeMs: 1, size: 10}})
    const calls: string[] = []
    const changed: string[] = []
    const watch = makeTranscriptWatch({
      keys: files.keys,
      stat: (key) => {
        calls.push(key)
        return files.stat(key)
      },
      onChange: (key) => changed.push(key),
      intervalMs: 100,
    })
    const dispose = watch.start()
    await flush(200)
    const before = calls.length
    dispose()
    files.files.set('a', {mtimeMs: 9, size: 99})
    await flush(500)
    expect(calls.length).toBe(before)
    expect(changed).toEqual([])
  })

  it('skips a tick while the previous one is still running', async () => {
    const files = makeStats({a: {mtimeMs: 1, size: 10}})
    const started: number[] = []
    const gate: {release: () => void} = {release: () => {}}
    const watch = makeTranscriptWatch({
      keys: files.keys,
      stat: () => {
        started.push(started.length)
        return new Promise((resolve) => {
          gate.release = () => resolve({mtimeMs: 1, size: 10})
        })
      },
      onChange: () => {},
      intervalMs: 100,
    })
    const dispose = watch.start()
    await flush(500)
    expect(started.length).toBe(1)
    gate.release()
    await flush(100)
    expect(started.length).toBe(2)
    dispose()
  })
})
