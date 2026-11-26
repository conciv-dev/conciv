import {describe, expect} from 'vitest'
import {test} from '../utils/engine-test.js'

describe('editor', () => {
  test('the agent opens a file at a line once, a repeat click is dropped, another line opens', async ({
    createEngine,
  }) => {
    const engine = await createEngine()
    const open = engine.session.tool('open')

    await open.call({file: 'src/app.ts', line: 12, column: 4})
    await open.call({file: 'src/app.ts', line: 12, column: 4})
    await open.call({file: 'src/app.ts', line: 30})

    expect(await engine.opened()).toEqual([
      {file: 'src/app.ts', line: 12, column: 4},
      {file: 'src/app.ts', line: 30},
    ])
  })
})
