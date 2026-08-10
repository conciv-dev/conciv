import {z} from 'zod'
import type {UiAnswer} from '@conciv/protocol/ui-types'

export type ConcivToolContext = {
  askUi: () => Promise<UiAnswer>
}

export type ConcivServerTool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  execute: (input: unknown) => Promise<unknown>
}
