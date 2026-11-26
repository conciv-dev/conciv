import {z} from 'zod'
import type {UiAnswer} from '@conciv/types/ui-types'
import type {LogLevel} from '@conciv/types/config-types'
import type {SetLogLevelInput} from './log-level.js'

export type ConcivToolContext = {
  askUi: () => Promise<UiAnswer>
  setLogLevel: (
    input: SetLogLevelInput,
  ) => Promise<{readonly engine: LogLevel; readonly widget: LogLevel} | {readonly refused: string}>
}

export type ConcivServerTool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  execute: (input: unknown) => Promise<unknown>
}
