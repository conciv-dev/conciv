import {type H3, readValidatedBody} from 'h3'
import {OpenSourceSchema} from '@mandarax/protocol/page-types'
import {symbolicateFrames, type RawFrame} from '../../page/symbolicate.js'
import type {OpenInEditor} from '../../editor/open.js'

export function registerOpenSourceRoute(app: H3, deps: {openInEditor: OpenInEditor; root: string}): void {
  app.post('/api/page/open-source', async (event) => {
    const {frames} = await readValidatedBody(event, OpenSourceSchema)
    const resolved: RawFrame[] = frames
      .filter((f): f is typeof f & {fileName: string} => typeof f.fileName === 'string')
      .map((f) => ({fileName: f.fileName, line: f.line ?? 0, column: f.column, fn: f.fn}))
    const source = await symbolicateFrames(resolved, deps.root)
    if (!source) return {status: 'no-source' as const}
    try {
      deps.openInEditor(source.file, source.line)
      return {status: 'opened' as const}
    } catch {
      return {status: 'failed' as const}
    }
  })
}
