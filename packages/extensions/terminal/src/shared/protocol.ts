import {z} from 'zod'

export const TERMINAL_NAME = 'terminal'

export const TerminalOpenRequestSchema = z.object({
  cols: z.number().int().min(2).max(500).optional(),
  rows: z.number().int().min(2).max(500).optional(),
  model: z.string().min(1).max(200).optional(),
})

export type TerminalOpenRequest = z.infer<typeof TerminalOpenRequestSchema>

export const TerminalStateSchema = z.object({alive: z.boolean(), busy: z.boolean()})
export type TerminalState = z.infer<typeof TerminalStateSchema>

export const HOOK_EVENT_NAMES = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Stop',
  'SessionEnd',
] as const

export const HookBodySchema = z
  .object({
    session_id: z.string(),
    transcript_path: z.string().optional(),
    cwd: z.string().optional(),
    hook_event_name: z.enum(HOOK_EVENT_NAMES),
  })
  .passthrough()

export type HookBody = z.infer<typeof HookBodySchema>

export const PresenceSnapshotSchema = z.object({
  state: z.enum(['idle', 'launching', 'connected', 'working']),
  source: z.enum(['hook', 'signal', 'launch']),
  lastSeenAt: z.number(),
})
