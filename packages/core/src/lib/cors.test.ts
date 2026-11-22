import {describe, expect, test} from 'vitest'
import {originAllowed} from './cors.js'

describe('origins', () => {
  test.each([
    ['a loopback page', 'http://localhost:5173', true],
    ['the loopback address', 'http://127.0.0.1:4100', true],
    ['the IPv6 loopback', 'http://[::1]:3000', true],
    ['an embedder origin the config lists', 'https://docs.example.com', true],
    ['a foreign origin', 'https://evil.example.com', false],
    ['a page that only names localhost in its subdomain', 'https://localhost.evil.example.com', false],
    ['a request without an origin', null, true],
  ])('%s is allowed: %s', (_label, origin, allowed) => {
    expect(originAllowed(origin, new Set(['https://docs.example.com']))).toBe(allowed)
  })
})
