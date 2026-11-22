import {realpath} from 'node:fs/promises'
import {basename, dirname, isAbsolute, join, relative, resolve} from 'node:path'
import type {HarnessHistory} from '@conciv/protocol/harness-types'
import type {HarnessSessionId} from '@conciv/protocol/chat-types'

function realOrResolved(path: string): Promise<string> {
  return realpath(path).catch(() => resolve(path))
}

function realLeaf(path: string): Promise<string> {
  return realpath(path).catch(async () => join(await realOrResolved(dirname(path)), basename(path)))
}

export async function containedPath(root: string, candidate: string): Promise<string | null> {
  const [realRoot, realCandidate] = await Promise.all([realOrResolved(root), realLeaf(candidate)])
  const step = relative(realRoot, realCandidate)
  if (step === '' || step.startsWith('..') || isAbsolute(step)) return null
  return realCandidate
}

export async function transcriptPathWithin(
  history: HarnessHistory,
  cwd: string,
  sessionId: HarnessSessionId,
): Promise<string | null> {
  if (history.transcriptPath === undefined) return null
  if (history.withinProject && !(await history.withinProject(cwd, sessionId))) return null
  const [root, path] = await Promise.all([history.transcriptRoot(cwd), history.transcriptPath(cwd, sessionId)])
  return containedPath(root, path)
}
