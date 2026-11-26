import {describe, expect, test} from 'vitest'
import {makeEditorOpener} from '../../src/engine/editor/open.js'

describe('editor', () => {
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
