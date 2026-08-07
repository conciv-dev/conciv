import {z} from 'zod'
import type {UiAnswer} from '@conciv/protocol/ui-types'

export type PageCapability = {
  name: string
  summary: string
  category?: string
  hint?: string
}

export type ConcivToolContext = {
  askUi: () => Promise<UiAnswer>

  page: (name: string, input: Record<string, unknown>) => Promise<unknown>

  open: (file: string, line?: number) => Promise<unknown>

  capabilities: () => readonly PageCapability[]
}

export type ConcivServerTool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  execute: (input: unknown) => Promise<unknown>
}
