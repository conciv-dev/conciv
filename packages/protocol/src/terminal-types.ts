import {z} from 'zod'

export type TtyCommand = {bin: string; args: string[]; env: Record<string, string>; unsetEnvPrefixes?: string[]}

export type TtyCommandOpts = {
  cwd: string
  harnessSessionId: string
  resume: boolean
  model?: string | null
  mcpUrl?: string | null
  concivSessionId?: string
}

export const TtyClientControlSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('resize'),
    cols: z.number().int().min(2).max(500),
    rows: z.number().int().min(2).max(500),
  }),
  z.object({type: z.literal('inject'), text: z.string().min(1).max(4096)}),
])
export type TtyClientControl = z.infer<typeof TtyClientControlSchema>

export const TtyServerControlSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('exit'), code: z.number()}),
  z.object({type: z.literal('busy'), busy: z.boolean()}),
  z.object({type: z.literal('error'), message: z.string()}),
])
export type TtyServerControl = z.infer<typeof TtyServerControlSchema>
