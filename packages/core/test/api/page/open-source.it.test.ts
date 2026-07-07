import {describe, it, expect, afterEach} from 'vitest'
import {Hono} from 'hono'
import {testClient} from 'hono/testing'
import {tmpdir} from 'node:os'
import openSourceApp, {type OpenSourceVars} from '../../../src/api/page/open-source.js'
import {chunkWithInlineMap, cleanupChunks} from '../../page/fixtures.js'

afterEach(async () => {
  await cleanupChunks()
})

function openSourceClient(open: (file: string, line?: number) => void) {
  const app = new Hono<{Variables: OpenSourceVars}>()
    .use(async (c, next) => {
      c.set('openSource', {open, root: tmpdir()})
      await next()
    })
    .route('/api/page', openSourceApp)
  return testClient(app).api.page['open-source']
}

describe('POST /api/page/open-source', () => {
  it('symbolicates frames and opens the resolved file', async () => {
    const opened: {file?: string; line?: number} = {}
    const client = openSourceClient((file, line) => {
      opened.file = file
      opened.line = line
    })
    const chunk = await chunkWithInlineMap('app/page.tsx', 17, 4)
    const res = await client.$post({json: {frames: [{fileName: `file://${chunk}`, line: 2, column: 1}]}})
    expect(await res.json()).toEqual({status: 'opened'})
    expect(opened).toEqual({file: 'app/page.tsx', line: 17})
  })

  it('returns no-source when no frame resolves', async () => {
    const opened: {file?: string} = {}
    const client = openSourceClient((file) => {
      opened.file = file
    })
    const res = await client.$post({json: {frames: [{fileName: 'file:///does-not-exist.js', line: 1, column: 1}]}})
    expect(await res.json()).toEqual({status: 'no-source'})
    expect(opened.file).toBeUndefined()
  })
})
