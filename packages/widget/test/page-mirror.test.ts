import {describe, it, expect} from 'vitest'
import {mirrorsKind} from '../src/page/page-mirror.js'

// The mirror's testable contract is WHICH verbs animate: visual actions get the cursor+ring, silent
// reads/lookups don't (a ring on a non-visual read is noise). The cursor/ring drawing itself is a
// decorative overlay with no semantic handle — verified visually, not via DOM hooks.
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
