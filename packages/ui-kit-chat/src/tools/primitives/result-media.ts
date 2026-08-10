import {z} from 'zod'
import type {ToolResultPart} from '@tanstack/ai-client'
import {resultText} from './tool-util.js'

const ImagePartSchema = z
  .object({
    type: z.literal('image'),
    source: z.object({type: z.literal('data'), value: z.string(), mimeType: z.string()}).loose(),
  })
  .loose()

const TextPartSchema = z.object({type: z.literal('text'), content: z.string()}).loose()

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function parseResultMedia(result: ToolResultPart | undefined): {json: unknown; imageUrl?: string} {
  const text = resultText(result)
  if (!text) return {json: undefined}
  const raw = parseJson(text)
  if (!Array.isArray(raw)) return {json: raw}
  const image = raw.map((part) => ImagePartSchema.safeParse(part)).find((parsed) => parsed.success)?.data
  const textPart = raw.map((part) => TextPartSchema.safeParse(part)).find((parsed) => parsed.success)?.data
  const json = textPart ? (parseJson(textPart.content) ?? textPart.content) : undefined
  return image === undefined ? {json} : {json, imageUrl: `data:${image.source.mimeType};base64,${image.source.value}`}
}
