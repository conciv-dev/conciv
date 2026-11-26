import type {ToolResultPart} from '@conciv/types/chat-message-types'
import {z} from 'zod'

const BashOutputSchema = z
  .object({stdout: z.string().optional(), stderr: z.string().optional(), exitCode: z.number().optional()})
  .refine((output) => output.stdout !== undefined || output.stderr !== undefined || output.exitCode !== undefined)

export type BashOutput = z.infer<typeof BashOutputSchema>

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function parseBashOutput(result: ToolResultPart | undefined): BashOutput {
  if (!result) return {}
  const content = result.content
  if (typeof content !== 'string') return {stdout: JSON.stringify(content, null, 2)}
  const parsed = BashOutputSchema.safeParse(parsedJson(content))
  return parsed.success ? parsed.data : {stdout: content}
}
