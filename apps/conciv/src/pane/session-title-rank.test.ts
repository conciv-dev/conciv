import {describe, expect, it} from 'vitest'
import {rankSessionTitle} from './session-title-rank.js'

describe('ranking a session title', () => {
  it.each([
    ['an exact match', 'Fix login bug', 'Fix login bug', 0],
    ['an exact match in another case', 'Fix Login Bug', 'fix login bug', 0],
    ['a prefix of the first word', 'Fix login bug', 'fi', 1],
    ['prefixes of the first words in a row', 'Fix login bug', 'fix log', 1],
    ['a prefix of a later word', 'Fix login bug', 'login', 2],
    ['no word it starts', 'Fix login bug', 'deploy', undefined],
    ['a word found inside a title word but not at its start', 'Fix login bug', 'ogin', undefined],
  ])('%s ranks the title %s for %s as %s', (_case, title, query, rank) => {
    expect(rankSessionTitle(title, query)).toBe(rank)
  })
})
