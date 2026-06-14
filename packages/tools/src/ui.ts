import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {toolDefinition} from '@tanstack/ai'
import {buildUiSpec} from '@aidx/protocol/ui-types'
import type {AidxToolContext} from './types.js'

const UiInput = z.object({
  kind: z.enum(['choices', 'confirm', 'diff', 'form']),
  question: z.string().optional(),
  detail: z.string().optional(),
  options: z.array(z.string()).optional(),
  file: z.string().optional(),
  before: z.string().optional(),
  after: z.string().optional(),
  title: z.string().optional(),
  fields: z
    .array(z.object({name: z.string(), label: z.string(), type: z.enum(['text', 'select']), options: z.array(z.string()).optional()}))
    .optional(),
})

export const aidxUiToolDef = toolDefinition({
  name: 'aidx_ui',
  description:
    'Render real interactive UI (choices/confirm/diff/form) in the chat thread. Non-blocking: the user reply arrives as their next chat message.',
  inputSchema: UiInput,
})

export function aidxUiTool(ctx: AidxToolContext) {
  return aidxUiToolDef.server(async (input) => {
    const renderId = randomUUID()
    const spec = buildUiSpec(input, renderId)
    const injected = ctx.injectUi(spec)
    return {renderId, injected}
  })
}
