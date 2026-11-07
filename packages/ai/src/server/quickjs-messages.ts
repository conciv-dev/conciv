import {z} from 'zod'

export const WorkerSetupSchema = z.object({
  names: z.array(z.string()),
  timeout: z.number(),
  memoryLimit: z.number(),
  maxStackSize: z.number(),
})

export type WorkerSetup = z.infer<typeof WorkerSetupSchema>

const ExecutionResultSchema = z.object({
  success: z.boolean(),
  value: z.unknown().optional(),
  error: z
    .object({name: z.string(), message: z.string(), stack: z.string().optional(), code: z.string().optional()})
    .optional(),
  logs: z.array(z.string()).optional(),
})

export const WorkerMessageSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('ready')}),
  z.object({type: z.literal('call'), id: z.string(), name: z.string(), args: z.unknown()}),
  z.object({type: z.literal('done'), result: ExecutionResultSchema}),
])

export type WorkerMessage = z.infer<typeof WorkerMessageSchema>

const CallOutcomeSchema = z.discriminatedUnion('ok', [
  z.object({ok: z.literal(true), json: z.string()}),
  z.object({ok: z.literal(false), message: z.string()}),
])

export type CallOutcome = z.infer<typeof CallOutcomeSchema>

export const HostMessageSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('execute'), code: z.string()}),
  z.object({
    type: z.literal('result'),
    id: z.string(),
    outcome: CallOutcomeSchema,
  }),
])

export type HostMessage = z.infer<typeof HostMessageSchema>
