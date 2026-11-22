import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect} from 'vitest'
import {makeOpenInEditor} from './open-editor.js'
import {test} from '../../test/unplugin-test.js'

describe('opening a file in the editor', () => {
  test('a project file opens in the editor, a path that climbs out of the project root does not, and an absolute path that exists does', async ({
    project,
    editor,
  }) => {
    const root = project('app')
    const outside = join(root, '..', 'outside.js')
    writeFileSync(outside, 'export const secret = 1\n')
    const open = makeOpenInEditor(root)

    const opened = editor.next()
    open('../outside.js', 1)
    open('src/app.jsx', 3, 5)
    expect(await opened).toBe(join(root, 'src', 'app.jsx'))

    const absolute = editor.next()
    open(outside, 1)
    expect(await absolute).toBe(outside)
  })
})
