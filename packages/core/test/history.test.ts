import {describe, expect, it} from 'vitest'
import {createHistory} from '../src/history/history.js'

describe('history', () => {
  it('undoes the last recorded entry per session and supports redo', async () => {
    const log: string[] = []
    const h = createHistory()
    h.record({sessionId: 's', label: 'create', inverse: async () => void log.push('undo-create')})
    expect(await h.undo('s')).toEqual({label: 'create'})
    expect(log).toEqual(['undo-create'])
    expect(await h.redo('s')).toEqual({label: 'create'})
  })

  it('isolates stacks per session and bounds to the limit', async () => {
    const h = createHistory({limit: 1})
    h.record({sessionId: 'a', label: 'x', inverse: async () => {}})
    h.record({sessionId: 'a', label: 'y', inverse: async () => {}})
    expect(await h.undo('a')).toEqual({label: 'y'})
    expect(await h.undo('a')).toBeNull()
  })
})
