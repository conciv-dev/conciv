import type {StreamChunk} from '@tanstack/ai'
import {isRunPhaseTerminal, runLifecycleOf, type RunPhase} from '@conciv/protocol/run-types'

export async function collectChunks(source: AsyncIterable<StreamChunk>, into: StreamChunk[]): Promise<void> {
  try {
    for await (const chunk of source) into.push(chunk)
  } catch {}
}

function runIdsAtPhase(chunks: StreamChunk[], match: (phase: RunPhase) => boolean): Set<string> {
  const seen = new Set<string>()
  for (const chunk of chunks) {
    const lifecycle = runLifecycleOf(chunk)
    if (lifecycle && match(lifecycle.phase)) seen.add(lifecycle.runId)
  }
  return seen
}

export function runsStarted(chunks: StreamChunk[]): number {
  return runIdsAtPhase(chunks, (phase) => phase === 'running').size
}

export function runsFinished(chunks: StreamChunk[]): number {
  return runIdsAtPhase(chunks, isRunPhaseTerminal).size
}

export function peakLiveRuns(chunks: StreamChunk[]): number {
  const open = new Set<string>()
  const tally = {peak: 0}
  for (const chunk of chunks) {
    const lifecycle = runLifecycleOf(chunk)
    if (!lifecycle) continue
    if (isRunPhaseTerminal(lifecycle.phase)) open.delete(lifecycle.runId)
    if (lifecycle.phase === 'running') open.add(lifecycle.runId)
    tally.peak = Math.max(tally.peak, open.size)
  }
  return tally.peak
}
