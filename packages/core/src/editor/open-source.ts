import type {z} from 'zod'
import type {OpenSourceResultSchema, OpenSourceSchema} from '@conciv/protocol/page-types'
import {symbolicateFrames, type RawFrame} from './symbolicate.js'
import type {OpenInEditor} from './open.js'

export type OpenSourceFrames = z.infer<typeof OpenSourceSchema>['frames']
export type OpenSourceStatus = z.infer<typeof OpenSourceResultSchema>

export async function openSourceFromFrames(
  frames: OpenSourceFrames,
  root: string,
  open: OpenInEditor,
): Promise<OpenSourceStatus> {
  const resolved: RawFrame[] = frames
    .filter((f): f is typeof f & {fileName: string} => typeof f.fileName === 'string')
    .map((f) => ({fileName: f.fileName, line: f.line ?? 0, column: f.column, fn: f.fn}))
  const source = await symbolicateFrames(resolved, root)
  if (!source) return {status: 'no-source' as const}
  try {
    open(source.file, source.line)
    return {status: 'opened' as const}
  } catch {
    return {status: 'failed' as const}
  }
}
