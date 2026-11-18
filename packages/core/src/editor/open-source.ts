import type {z} from 'zod'
import type {OpenSourceResultSchema} from '@conciv/protocol/page-types'
import type {OpenSourceSchema, RawFrame, SourceLoc} from '@conciv/contract'
import type {OpenInEditor} from './open.js'

export type OpenSourceFrames = z.infer<typeof OpenSourceSchema>['frames']
export type OpenSourceStatus = z.infer<typeof OpenSourceResultSchema>

export async function openSourceFromFrames(
  frames: OpenSourceFrames,
  symbolicate: (frames: RawFrame[]) => Promise<SourceLoc | null>,
  open: OpenInEditor,
): Promise<OpenSourceStatus> {
  const resolved = frames
    .filter((f): f is typeof f & {fileName: string} => typeof f.fileName === 'string')
    .map((f) => ({fileName: f.fileName, line: f.line ?? 0, column: f.column, fn: f.fn}))
  const first = resolved[0]
  const source = await symbolicate(resolved).catch(() =>
    first ? {file: first.fileName, line: first.line, column: first.column ?? 0} : null,
  )
  if (!source) return {status: 'no-source' as const}
  try {
    open(source.file, source.line)
    return {status: 'opened' as const}
  } catch {
    return {status: 'failed' as const}
  }
}
