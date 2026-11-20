import {test as base} from 'vitest'

const test = base.extend<{session: string}>({
  // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
  session: async ({}, use) => {
    await use('open')
    console.error('the session could not close')
  },
})

test('a fixture logs an error while it tears down', ({session}) => {
  void session
})
