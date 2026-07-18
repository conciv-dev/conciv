import {describe, expect, it} from 'vitest'
import {partIsModelOnly} from '../src/primitives/message-part/part-visibility.js'

describe('partIsModelOnly', () => {
  it('detects the marker', () => {
    expect(partIsModelOnly({type: 'text', content: 'x', metadata: {modelOnly: true}})).toBe(true)
  })

  it('is false without the marker or with other metadata', () => {
    expect(partIsModelOnly({type: 'text', content: 'x'})).toBe(false)
    expect(partIsModelOnly({type: 'text', content: 'x', metadata: {other: 1}})).toBe(false)
  })
})
