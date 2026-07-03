import {describe, expect, it} from 'vitest'
import {detectTrigger} from '../src/primitives/composer/trigger/detect-trigger.js'

describe('detectTrigger', () => {
  it('detects a trigger at text start', () => {
    expect(detectTrigger('/comp', '/', 5)).toEqual({query: 'comp', offset: 0})
  })
  it('detects a trigger after whitespace', () => {
    expect(detectTrigger('hello @cl', '@', 9)).toEqual({query: 'cl', offset: 6})
  })
  it('returns null when the trigger is mid-word', () => {
    expect(detectTrigger('path/to', '/', 7)).toBeNull()
  })
  it('returns null when whitespace sits between trigger and cursor', () => {
    expect(detectTrigger('/cmd arg', '/', 8)).toBeNull()
  })
  it('only considers text before the cursor', () => {
    expect(detectTrigger('/cmd', '/', 2)).toEqual({query: 'c', offset: 0})
  })
  it('returns null without a trigger char', () => {
    expect(detectTrigger('plain text', '/', 10)).toBeNull()
  })
})
