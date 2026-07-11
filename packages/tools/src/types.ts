import {z} from 'zod'
import type {PageQuery} from '@conciv/protocol/page-types'
import type {UiAnswer} from '@conciv/protocol/ui-types'

export type ConcivToolContext = {
  askUi: () => Promise<UiAnswer>

  page: (query: Omit<PageQuery, 'requestId'>) => Promise<unknown>

  open: (file: string, line?: number) => void
}

export type ConcivServerTool = {
  name: string
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  execute: (input: unknown) => Promise<unknown>
}
