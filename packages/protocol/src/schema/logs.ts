import {z} from 'zod'
import {LogLevelSchema} from '@conciv/types/config-types'

export const LogLevels = z.object({engine: LogLevelSchema, widget: LogLevelSchema})
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
