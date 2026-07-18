import {describe, expect, it} from 'vitest'
import {stepStates} from '../src/shared/try-steps.js'

describe('stepStates', () => {
  it('starts with copy active', () => {
    expect(stepStates({copied: false, connected: false})).toEqual({copy: 'active', run: 'pending', approve: 'pending'})
  })
  it('advances to run after copying', () => {
    expect(stepStates({copied: true, connected: false})).toEqual({copy: 'done', run: 'active', approve: 'pending'})
  })
  it('marks everything done on connect, even without a copy click', () => {
    expect(stepStates({copied: false, connected: true})).toEqual({copy: 'done', run: 'done', approve: 'done'})
  })
})
