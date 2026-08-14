import {z} from 'zod'
import type {Grab, GrabPreview} from './grab.js'

export const GRAB_MIME = 'application/vnd.conciv.grab+json'

export const GRAB_FILE_NAME = 'Grabbed element'

const MAX_PERSISTED_BASE64_CHARACTERS = 1_000_000

const BASE64_BYTES_PER_CHARACTER = 3 / 4

const MAX_PAYLOAD_BYTES = Math.floor(MAX_PERSISTED_BASE64_CHARACTERS * BASE64_BYTES_PER_CHARACTER)

const ElementSourceSchema = z.object({
  componentName: z.string().nullable(),
  filePath: z.string(),
  lineNumber: z.number().nullable(),
})

const ElementRectSchema = z.object({x: z.number(), y: z.number(), width: z.number(), height: z.number()})

const GrabPreviewSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('dom'), html: z.string(), width: z.number(), height: z.number()}),
  z.object({kind: z.literal('image'), dataUrl: z.string(), width: z.number(), height: z.number()}),
])

const GrabPayloadSchema = z.object({
  text: z.string(),
  snippet: z.string().optional(),
  source: ElementSourceSchema.nullable(),
  rect: ElementRectSchema.nullable(),
  preview: GrabPreviewSchema.nullable(),
})

export type GrabPayload = z.infer<typeof GrabPayloadSchema>

function payloadOf(grab: Grab, preview: GrabPreview | null): GrabPayload {
  return {
    text: grab.text,
    ...(grab.snippet === undefined ? {} : {snippet: grab.snippet}),
    source: grab.source,
    rect: grab.rect,
    preview,
  }
}

function payloadBytes(payload: GrabPayload): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length
}

function withinBudget(payload: GrabPayload): boolean {
  return payloadBytes(payload) <= MAX_PAYLOAD_BYTES
}

function truncatedTo(payload: GrabPayload, codePoints: readonly string[], length: number): GrabPayload {
  return {...payload, text: `${codePoints.slice(0, length).join('')}…`}
}

function shrunkToBudget(payload: GrabPayload): GrabPayload {
  const codePoints = Array.from(payload.text)
  let low = 0
  let high = codePoints.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    const fits = withinBudget(truncatedTo(payload, codePoints, middle))
    if (fits) low = middle
    if (!fits) high = middle - 1
  }
  return truncatedTo(payload, codePoints, low)
}

export function grabToPayload(grab: Grab): GrabPayload {
  const full = payloadOf(grab, grab.preview)
  if (withinBudget(full)) return full
  const withoutPreview = payloadOf({...grab, snippet: undefined}, null)
  if (withinBudget(withoutPreview)) return withoutPreview
  const shrunk = shrunkToBudget(withoutPreview)
  if (withinBudget(shrunk)) return shrunk
  return {text: shrunk.text, source: null, rect: null, preview: null}
}

export function grabToFile(grab: Grab): File {
  return new File([JSON.stringify(grabToPayload(grab))], GRAB_FILE_NAME, {type: GRAB_MIME})
}

export function parseGrabPayload(raw: string): GrabPayload | null {
  try {
    const parsed = GrabPayloadSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
