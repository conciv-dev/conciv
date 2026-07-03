import {z} from 'zod'

export const SessionModeSchema = z.enum(['chat', 'terminal'])
export type SessionMode = z.infer<typeof SessionModeSchema>

export type TtyCommand = {bin: string; args: string[]; env: Record<string, string>; unsetEnvPrefixes?: string[]}

export type TtyCommandOpts = {
  cwd: string
  harnessSessionId: string
  resume: boolean
  model?: string | null
}

export const TtyClientControlSchema = z.object({
  type: z.literal('resize'),
  cols: z.number().int().min(2).max(500),
  rows: z.number().int().min(2).max(500),
})
export type TtyClientControl = z.infer<typeof TtyClientControlSchema>

export const TtyServerControlSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('exit'), code: z.number()}),
  z.object({type: z.literal('busy'), busy: z.boolean()}),
  z.object({type: z.literal('error'), message: z.string()}),
])
export type TtyServerControl = z.infer<typeof TtyServerControlSchema>

export const SetModeRequestSchema = z.object({mode: SessionModeSchema})
export const SetModeResponseSchema = z.object({mode: SessionModeSchema})
export type SetModeResponse = z.infer<typeof SetModeResponseSchema>
