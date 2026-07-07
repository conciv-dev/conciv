import {Hono} from 'hono'
import {zValidator} from '@hono/zod-validator'
import {OpenSourceSchema} from '@conciv/protocol/page-types'
import {symbolicateFrames, type RawFrame} from '../../page/symbolicate.js'
import type {OpenInEditor} from '../../editor/open.js'

export function makeOpenSourceRoute(deps: {openInEditor: OpenInEditor; root: string}) {
  return new Hono().post('/open-source', zValidator('json', OpenSourceSchema), async (c) => {
    const {frames} = c.req.valid('json')
    const resolved: RawFrame[] = frames
      .filter((f): f is typeof f & {fileName: string} => typeof f.fileName === 'string')
      .map((f) => ({fileName: f.fileName, line: f.line ?? 0, column: f.column, fn: f.fn}))
    const source = await symbolicateFrames(resolved, deps.root)
    if (!source) return c.json({status: 'no-source' as const})
    try {
      deps.openInEditor(source.file, source.line)
      return c.json({status: 'opened' as const})
    } catch {
      return c.json({status: 'failed' as const})
    }
  })
}
