import {realpathSync} from 'node:fs'
import {basename, dirname, isAbsolute, join, relative, resolve} from 'node:path'
import type {HarnessHistory} from '@conciv/protocol/harness-types'
import type {HarnessSessionId} from '@conciv/protocol/chat-types'

function realOrResolved(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function realLeaf(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return join(realOrResolved(dirname(path)), basename(path))
  }
}

export function containedPath(root: string, candidate: string): string | null {
  const realRoot = realOrResolved(root)
  const realCandidate = realLeaf(candidate)
  const step = relative(realRoot, realCandidate)
  if (step === '' || step.startsWith('..') || isAbsolute(step)) return null
  return realCandidate
}

export function transcriptPathWithin(
  history: HarnessHistory,
  cwd: string,
  sessionId: HarnessSessionId,
  home?: string,
): string | null {
  const build = history.transcriptPath
  if (build === undefined) return null
  if (history.withinProject && !history.withinProject(cwd, sessionId, home)) return null
  return containedPath(history.transcriptRoot(cwd, home), build(cwd, sessionId, home))
}
