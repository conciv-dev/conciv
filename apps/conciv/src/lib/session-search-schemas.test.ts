import {describe, expect, it} from 'vitest'
import {sessionPickerSearchSchema} from './session-search-schemas.js'

describe('reading the session search params', () => {
  it.each([
    ['no params give the defaults', {}, {sessionSearch: '', allProjects: false}],
    ['a digit-only search term stays a string', {sessionSearch: 42}, {sessionSearch: '42', allProjects: false}],
    ['a bad all projects value falls back to off', {allProjects: 'yes'}, {sessionSearch: '', allProjects: false}],
    [
      'an open value other than true is dropped',
      {open: false},
      {open: undefined, sessionSearch: '', allProjects: false},
    ],
  ])('%s', (_case, search, params) => {
    expect(sessionPickerSearchSchema.parse(search)).toStrictEqual(params)
  })
})
