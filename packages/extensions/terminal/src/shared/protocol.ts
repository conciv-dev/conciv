import {z} from 'zod'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {HOOK_EVENT_NAMES, type HookEventName} from '@conciv/session-observer/types'

export const TERMINAL_NAME = 'terminal'

export const TerminalOpenRequestSchema = z.object({
  cols: z.number().int().min(2).max(500).optional(),
  rows: z.number().int().min(2).max(500).optional(),
  model: z.string().min(1).max(200).optional(),
})

export type TerminalOpenRequest = z.infer<typeof TerminalOpenRequestSchema>

export const TerminalStateSchema = z.object({alive: z.boolean(), busy: z.boolean()})
export type TerminalState = z.infer<typeof TerminalStateSchema>

export const HOOK_EVENTS = HOOK_EVENT_NAMES satisfies readonly HookEventName[]

export const HookBodySchema = z
  .object({
    session_id: HarnessSessionId,
    transcript_path: z.string().optional(),
    cwd: z.string().optional(),
    hook_event_name: z.enum(HOOK_EVENTS),
  })
  .passthrough()

export type HookBody = z.infer<typeof HookBodySchema>
