import {describe, it, expect, afterEach} from 'vitest'
import {tmpdir} from 'node:os'
import {openSourceFromFrames} from '../../../src/editor/open-source.js'
import {chunkWithInlineMap, cleanupChunks} from '../../editor/fixtures.js'

afterEach(async () => {
  await cleanupChunks()
})

describe('openSourceFromFrames', () => {
  it('symbolicates frames and opens the resolved file', async () => {
    const opened: {file?: string; line?: number} = {}
    const chunk = await chunkWithInlineMap('app/page.tsx', 17, 4)
    const result = await openSourceFromFrames(
      [{fileName: `file://${chunk}`, line: 2, column: 1}],
      tmpdir(),
      (file, line) => {
        opened.file = file
        opened.line = line
      },
    )
    expect(result).toEqual({status: 'opened'})
    expect(opened).toEqual({file: 'app/page.tsx', line: 17})
  })

  it('returns no-source when no frame resolves', async () => {
    const opened: {file?: string} = {}
    const result = await openSourceFromFrames(
      [{fileName: 'file:///does-not-exist.js', line: 1, column: 1}],
      tmpdir(),
      (file) => {
        opened.file = file
      },
    )
    expect(result).toEqual({status: 'no-source'})
    expect(opened.file).toBeUndefined()
  })
})
