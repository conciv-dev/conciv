import {describe, expect, it} from 'vitest'
import {createConciv, mountConciv} from '../src/mount.js'

describe('createConciv outside a browser', () => {
  it('unmount before mount is a no-op', () => {
    expect(() => createConciv().unmount()).not.toThrow()
  })

  it('mountConciv is safe to call without document', () => {
    expect(() => mountConciv([])).not.toThrow()
  })
})
