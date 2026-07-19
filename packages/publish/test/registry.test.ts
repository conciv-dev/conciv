import {test, expect} from 'vitest'
import {stateFromDocument} from '../src/registry.ts'

const trustedUser = {
  name: 'GitHub Actions',
  email: 'npm-oidc-no-reply@github.com',
  trustedPublisher: {id: 'github', oidcConfigId: 'oidc:5264430c-88ce-42e0-bb20-090669cc97d1'},
}

test('latest published via trusted publisher reads as trusted', () => {
  const document = {
    'dist-tags': {latest: '0.0.14'},
    versions: {
      '0.0.9': {_npmUser: {name: 'omridevk', email: 'x@y.dev'}},
      '0.0.14': {_npmUser: trustedUser},
    },
  }
  expect(stateFromDocument(document)).toBe('trusted')
})

test('latest published by a human reads as untrusted', () => {
  const document = {
    'dist-tags': {latest: '0.0.14'},
    versions: {'0.0.14': {_npmUser: {name: 'omridevk', email: 'x@y.dev'}}},
  }
  expect(stateFromDocument(document)).toBe('untrusted')
})

test('regression: old versions without trustedPublisher must not fail the parse', () => {
  const document = {
    'dist-tags': {latest: '0.0.14'},
    versions: {
      '0.0.9': {_npmUser: {name: 'omridevk', email: 'x@y.dev'}},
      '0.0.11': {_npmUser: {name: 'omridevk', email: 'x@y.dev'}},
      '0.0.12': {},
      '0.0.14': {_npmUser: trustedUser},
    },
  }
  expect(stateFromDocument(document)).toBe('trusted')
})

test('documents without dist-tags or versions read as untrusted, not a crash', () => {
  expect(stateFromDocument({})).toBe('untrusted')
  expect(stateFromDocument({'dist-tags': {}})).toBe('untrusted')
  expect(stateFromDocument({'dist-tags': {latest: '1.0.0'}})).toBe('untrusted')
})

test('non-object registry responses throw a parse error', () => {
  expect(() => stateFromDocument('nope')).toThrow()
  expect(() => stateFromDocument(null)).toThrow()
})
