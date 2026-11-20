import {test as base} from 'vitest'

const test = base.extend<{server: string}>({
  server: [
    // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
    async ({}, use) => {
      await use('listening')
      console.warn('the server did not stop cleanly')
    },
    {scope: 'file'},
  ],
})

test('a file fixture logs a warning after the last test', ({server}) => {
  void server
})
