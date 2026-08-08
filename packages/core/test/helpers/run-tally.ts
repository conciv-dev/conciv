import {EventType, type StreamChunk} from '@tanstack/ai'

type RunEndChunk = Extract<StreamChunk, {type: EventType.RUN_FINISHED}>

export async function collectChunks(source: AsyncIterable<StreamChunk>, into: StreamChunk[]): Promise<void> {
  try {
    for await (const chunk of source) into.push(chunk)
  } catch {}
}

export function isRunEnd(chunk: StreamChunk): chunk is RunEndChunk {
  return chunk.type === EventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls'
}

export function runsStarted(chunks: StreamChunk[]): number {
  return chunks.filter((chunk) => chunk.type === EventType.RUN_STARTED).length
}

export function runsFinished(chunks: StreamChunk[]): number {
  return chunks.filter(isRunEnd).length
}

export function peakLiveRuns(chunks: StreamChunk[]): number {
  const open = new Set<string>()
  const tally = {peak: 0}
  for (const chunk of chunks) {
    if (chunk.type === EventType.RUN_STARTED) open.add(chunk.runId)
    if (chunk.type === EventType.RUN_FINISHED) open.delete(chunk.runId)
    tally.peak = Math.max(tally.peak, open.size)
  }
  return tally.peak
}
