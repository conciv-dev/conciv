import {describe, expect, it} from 'vitest'
import {reportRouteChanges} from '../../src/attachment.js'

describe('a browser without the Navigation API', () => {
  it('subscribes to route changes without throwing, so the tab still attaches', () => {
    expect(() => reportRouteChanges(() => undefined, new AbortController().signal)).not.toThrow()
  })
})
