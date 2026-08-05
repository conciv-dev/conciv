import {z} from 'zod'
import type {PageQuery} from '@conciv/protocol/page-types'
import type {UiAnswer} from '@conciv/protocol/ui-types'

export type PageCapability = {
  name: string
  summary: string
  category?: string
  hint?: string
}

export type ConcivToolContext = {
  askUi: () => Promise<UiAnswer>

  page: (query: Omit<PageQuery, 'requestId'>) => Promise<unknown>

  open: (file: string, line?: number) => void

  capabilities: () => readonly PageCapability[]
}

export type ConcivServerTool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  execute: (input: unknown) => Promise<unknown>
}
