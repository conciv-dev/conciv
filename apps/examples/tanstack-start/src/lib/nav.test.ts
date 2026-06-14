import {describe, it, expect} from 'vitest'
import {activeLink, NAV_LINKS} from './nav.js'

describe('activeLink', () => {
  it('matches a known path', () => {
    expect(activeLink('/about')).toEqual({to: '/about', label: 'About'})
  })

  it('returns null for an unknown path', () => {
    expect(activeLink('/nope')).toBeNull()
  })

  it('has a home link first', () => {
    expect(NAV_LINKS[0]?.to).toBe('/')
  })
})
