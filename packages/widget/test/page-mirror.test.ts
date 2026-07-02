import {describe, it, expect} from 'vitest'
import {mirrorsKind} from '../src/page/page-mirror.js'

describe('mirrorsKind', () => {
  it('animates visual page-action verbs', () => {
    for (const verb of ['click', 'fill', 'select', 'check', 'uncheck', 'press', 'hover', 'scroll', 'submit'] as const) {
      expect(mirrorsKind(verb)).toBe(true)
    }
  })

  it('does not animate non-visual verbs (reads, lookups, programmatic edits)', () => {
    for (const verb of ['text', 'value', 'attr', 'locate', 'inspect', 'override', 'tree', 'wait', 'eval'] as const) {
      expect(mirrorsKind(verb)).toBe(false)
    }
  })
})
