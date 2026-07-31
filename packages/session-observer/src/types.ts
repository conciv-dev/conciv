import {z} from 'zod'
import type {UIMessage} from '@tanstack/ai'

export const PRESENCE_STATES = ['idle', 'launching', 'connected', 'working', 'stale'] as const
export type PresenceState = (typeof PRESENCE_STATES)[number]

export const EVIDENCE_SOURCES = ['launch', 'hook', 'mcp', 'external-write'] as const
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number]

export const HOOK_EVENT_NAMES = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Stop',
  'SessionEnd',
] as const
export type HookEventName = (typeof HOOK_EVENT_NAMES)[number]

export const TRANSCRIPT_FAILURES = ['missing', 'unreadable', 'corrupt'] as const
export type TranscriptFailureReason = (typeof TRANSCRIPT_FAILURES)[number]

export type TranscriptFailure = {reason: TranscriptFailureReason; detail: string}

export type TranscriptHealth = {ok: true} | {ok: false; reason: TranscriptFailureReason; detail: string; since: number}

export type SessionSnapshot = {
  state: PresenceState
  evidence: EvidenceSource
  lastEvidenceAt: number
  lastEvidenceWallAt: number
  health: TranscriptHealth
}

export type ObserverSignal =
  | {kind: 'launch'}
  | {kind: 'hook'; event: HookEventName}
  | {kind: 'mcp'}
  | {kind: 'external-write'}
  | {kind: 'detach'}

export const LOCAL_RUN_PHASES = ['start', 'end'] as const
export type LocalRunPhase = (typeof LOCAL_RUN_PHASES)[number]

export const SEND_POLICIES = ['allow', 'confirm', 'block'] as const
export type SendPolicy = (typeof SEND_POLICIES)[number]

export type SessionUpdate =
  | {kind: 'presence'; snapshot: SessionSnapshot}
  | {kind: 'transcript'; rev: string; messages: UIMessage[]}
  | {kind: 'transcript-error'; reason: TranscriptFailureReason; detail: string}

export type Clock = {monotonic(): number; wall(): number}

export const systemClock: Clock = {monotonic: () => Math.round(performance.now()), wall: () => Date.now()}

export const TranscriptHealthSchema = z.union([
  z.object({ok: z.literal(true)}),
  z.object({
    ok: z.literal(false),
    reason: z.enum(TRANSCRIPT_FAILURES),
    detail: z.string(),
    since: z.number(),
  }),
]) satisfies z.ZodType<TranscriptHealth>

export const SessionSnapshotSchema = z.object({
  state: z.enum(PRESENCE_STATES),
  evidence: z.enum(EVIDENCE_SOURCES),
  lastEvidenceAt: z.number(),
  lastEvidenceWallAt: z.number(),
  health: TranscriptHealthSchema,
}) satisfies z.ZodType<SessionSnapshot>

export const SessionUpdateSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('presence'), snapshot: SessionSnapshotSchema}),
  z.object({kind: z.literal('transcript'), rev: z.string(), messages: z.array(z.custom<UIMessage>())}),
  z.object({
    kind: z.literal('transcript-error'),
    reason: z.enum(TRANSCRIPT_FAILURES),
    detail: z.string(),
  }),
]) satisfies z.ZodType<SessionUpdate>
