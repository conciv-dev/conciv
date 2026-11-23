import {realpathSync} from 'node:fs'
import {realpath} from 'node:fs/promises'
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

function insideRoot(realRoot: string, realCandidate: string): string | null {
  const step = relative(realRoot, realCandidate)
  if (step === '' || step.startsWith('..') || isAbsolute(step)) return null
  return realCandidate
}

export function containedPath(root: string, candidate: string): string | null {
  return insideRoot(realOrResolved(root), realLeaf(candidate))
}

export async function resolveRealPath(path: string): Promise<string> {
  return realpath(path).catch(() => resolve(path))
}

export async function containedRealPath(realRoot: string, candidate: string): Promise<string | null> {
  const realCandidate = await realpath(candidate).catch(async () =>
    join(await resolveRealPath(dirname(candidate)), basename(candidate)),
  )
  return insideRoot(realRoot, realCandidate)
}

export function transcriptPathWithin(history: HarnessHistory, cwd: string, sessionId: HarnessSessionId): string | null {
  const build = history.transcriptPath
  if (build === undefined) return null
  if (history.withinProject && !history.withinProject(cwd, sessionId)) return null
  return containedPath(history.transcriptRoot(cwd), build(cwd, sessionId))
}
