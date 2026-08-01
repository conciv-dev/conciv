import {z} from 'zod'
import {resultText} from '@conciv/ui-kit-chat'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'

const ImagePartSchema = z
  .object({
    type: z.literal('image'),
    source: z.object({type: z.literal('data'), value: z.string(), mimeType: z.string()}).loose(),
  })
  .loose()

const TextPartSchema = z.object({type: z.literal('text'), content: z.string()}).loose()

export type ToolPayload = {image: {mimeType: string; value: string} | null; detail: unknown}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function toolPayload(result: ToolCardProps['result']): ToolPayload {
  const text = resultText(result)
  if (!text) return {image: null, detail: undefined}
  const raw = parseJson(text)
  if (!Array.isArray(raw)) return {image: null, detail: raw}
  const image = raw.map((part) => ImagePartSchema.safeParse(part)).find((parsed) => parsed.success)?.data ?? null
  const textPart = raw.map((part) => TextPartSchema.safeParse(part)).find((parsed) => parsed.success)?.data
  const detail = textPart ? (parseJson(textPart.content) ?? textPart.content) : undefined
  return {image: image ? {mimeType: image.source.mimeType, value: image.source.value} : null, detail}
}

export const FailureDetailSchema = z.object({error: z.string(), reason: z.string().optional()}).loose()

export function failureOf(detail: unknown): z.infer<typeof FailureDetailSchema> | null {
  const parsed = FailureDetailSchema.safeParse(detail)
  return parsed.success ? parsed.data : null
}
