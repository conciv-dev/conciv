import {describe, expect, it} from 'vitest'
import {reportRouteChanges} from './attachment.js'

describe('the tab stays attached', () => {
  it('subscribes to route changes without the Navigation API', () => {
    expect(() => reportRouteChanges(() => undefined, new AbortController().signal)).not.toThrow()
  })
})
