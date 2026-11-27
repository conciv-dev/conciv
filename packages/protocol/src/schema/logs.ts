import {z} from 'zod'
import {LogLevelSchema} from '@conciv/types/config-types'

export const LogLevels = z.object({
  engine: LogLevelSchema,
  widget: LogLevelSchema,
  dropped: z.number().int().nonnegative(),
})
export type LogLevels = z.infer<typeof LogLevels>

export const LogLevelScope = z.enum(['engine', 'widget', 'all'])
export type LogLevelScope = z.infer<typeof LogLevelScope>

export const SetLogLevelInput = z.object({level: LogLevelSchema, scope: LogLevelScope})
export type SetLogLevelInput = z.infer<typeof SetLogLevelInput>

export const ClientLogEvent = z.object({
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
  timestamp: z.string().max(64),
  service: z.string().max(128),
  fields: z.record(z.string().max(256), z.unknown()),
})
export type ClientLogEvent = z.infer<typeof ClientLogEvent>

export const LogsWriteInput = z.object({events: z.array(ClientLogEvent).max(100)})
export type LogsWriteInput = z.infer<typeof LogsWriteInput>

export const LogSource = z.enum(['engine', 'client'])

export const EventLevel = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])

export const LogEvent = z.object({
  id: z.string(),
  timestamp: z.string(),
  level: z.string(),
  service: z.string(),
  environment: z.string(),
  message: z.string().nullable(),
  method: z.string().nullable(),
  path: z.string().nullable(),
  status: z.number().nullable(),
  durationMs: z.number().nullable(),
  requestId: z.string().nullable(),
  source: z.string().nullable(),
  sessionId: z.string().nullable(),
  error: z.string().nullable(),
  data: z.string().nullable(),
  createdAt: z.string(),
})
export type LogEvent = z.infer<typeof LogEvent>

export const LogsQueryInput = z.object({
  since: z.string().max(64).optional(),
  until: z.string().max(64).optional(),
  level: z.array(EventLevel).max(6).optional(),
  source: LogSource.optional(),
  text: z.string().max(1024).optional(),
  sessionId: z.string().max(256).optional(),
  limit: z.number().int().min(1).max(2000).default(200),
})
export type LogsQueryInput = z.infer<typeof LogsQueryInput>

export const LogsQueryOutput = z.object({level: LogLevelSchema, events: z.array(LogEvent)})

export const LogsTailInput = z.object({
  level: z.array(EventLevel).max(6).optional(),
  source: LogSource.optional(),
})

export const LogsCleanupOutput = z.object({result: z.enum(['success', 'error']), deleted: z.number().int()})
