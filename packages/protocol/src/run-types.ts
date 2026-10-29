import {z} from 'zod'
import {EventType, type CustomEvent, type StreamChunk} from '@tanstack/ai'

export const RUN_LIFECYCLE_EVENT = 'conciv.run-lifecycle'

export const RunPhaseSchema = z.enum(['running', 'stopping', 'completed', 'failed', 'aborted'])

export type RunPhase = z.infer<typeof RunPhaseSchema>

export const RunLifecycleSchema = z.object({
  runId: z.string().min(1),
  phase: RunPhaseSchema,
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  serverNow: z.number(),
  error: z.string().nullable(),
})

export type RunLifecycle = z.infer<typeof RunLifecycleSchema>

export type RunClockSource = {lifecycle: RunLifecycle; receivedAt: number}

export function aguiRunLifecycleFor(lifecycle: RunLifecycle): CustomEvent {
  return {type: EventType.CUSTOM, name: RUN_LIFECYCLE_EVENT, value: RunLifecycleSchema.parse(lifecycle)}
}

export function runLifecycleOf(chunk: StreamChunk): RunLifecycle | null {
  if (chunk.type !== EventType.CUSTOM || chunk.name !== RUN_LIFECYCLE_EVENT) return null
  const parsed = RunLifecycleSchema.safeParse(chunk.value)
  return parsed.success ? parsed.data : null
}

export function isRunPhaseTerminal(phase: RunPhase): boolean {
  return phase === 'completed' || phase === 'failed' || phase === 'aborted'
}
