import {test, expect} from 'vitest'
import {assertValidTag} from '../src/guards.ts'

test('accepts plain dist-tags', () => {
  expect(() => assertValidTag('beta')).not.toThrow()
  expect(() => assertValidTag('next-11')).not.toThrow()
})

test('rejects flag-like or injecting tags (argument injection)', () => {
  for (const bad of ['--otp=999', '--ignore=@conciv/core', '-rm', '', 'Beta', 'a b', 'a;b']) {
    expect(() => assertValidTag(bad), bad).toThrow(/invalid dist-tag/)
  }
})
