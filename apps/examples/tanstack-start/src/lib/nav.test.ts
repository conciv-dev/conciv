import {describe, expect, it} from 'vitest'
import {activeLink, NAV_LINKS} from './nav'

describe('activeLink', () => {
  it('returns the matching nav link for a known pathname', () => {
    expect(activeLink('/about')).toEqual(NAV_LINKS.find((l) => l.to === '/about'))
  })

  it('returns null for a pathname with no matching nav link', () => {
    expect(activeLink('/does-not-exist')).toBeNull()
  })
})
