// @vitest-environment happy-dom
import {describe, expect, it} from 'vitest'
import {reportBrowserTabChanges} from '../../src/runtime/browser-tab/open-browser-tab.js'

describe('a browser without the Navigation API', () => {
  it('subscribes to route changes without throwing, so the tab still attaches', () => {
    expect(() => reportBrowserTabChanges(() => undefined, new AbortController().signal)).not.toThrow()
  })
})
