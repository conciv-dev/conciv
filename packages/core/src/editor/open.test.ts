import {describe, expect, test} from 'vitest'
import {createEngine} from '../../test/engine.js'
import {makeEditorOpener} from './open.js'

describe('editor', () => {
  test('the agent opens a file at a line once, a repeat click is dropped, another line opens', async () => {
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

  test('the same file opens again once the repeat window has passed', () => {
    const clock = {now: 0}
    const launched: string[] = []
    const open = makeEditorOpener(
      (file, line) => launched.push(`${file}:${line}`),
      4000,
      () => clock.now,
    )

    open('src/app.ts', 12)
    clock.now = 3999
    open('src/app.ts', 12)
    clock.now = 4000
    open('src/app.ts', 12)

    expect(launched).toEqual(['src/app.ts:12', 'src/app.ts:12'])
  })
})
