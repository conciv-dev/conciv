import {describe, expect, it} from 'vitest'
import {defaultDirectiveFormatter} from '../src/primitives/composer/trigger/directive-formatter.js'

describe('defaultDirectiveFormatter', () => {
  it('serializes with name attribute when id differs from label', () => {
    expect(defaultDirectiveFormatter.serialize({id: 'u1', type: 'user', label: 'Ada'})).toBe(':user[Ada]{name=u1}')
  })
  it('omits name attribute when id equals label', () => {
    expect(defaultDirectiveFormatter.serialize({id: 'Ada', type: 'user', label: 'Ada'})).toBe(':user[Ada]')
  })
  it('round-trips serialize then parse', () => {
    const text = `before ${defaultDirectiveFormatter.serialize({id: 'u1', type: 'user', label: 'Ada'})} after`
    expect(defaultDirectiveFormatter.parse(text)).toEqual([
      {kind: 'text', text: 'before '},
      {kind: 'mention', type: 'user', label: 'Ada', id: 'u1'},
      {kind: 'text', text: ' after'},
    ])
  })
  it('parses plain text as a single segment', () => {
    expect(defaultDirectiveFormatter.parse('no directives')).toEqual([{kind: 'text', text: 'no directives'}])
  })
})
