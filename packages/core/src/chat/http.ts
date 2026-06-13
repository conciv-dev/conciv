import type {H3Event} from 'h3'

// Shared HTTP helpers for the chat routes. Bodies are read to `unknown` and narrowed with
// guards at the use site — never asserted (spec "Typing discipline").

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export async function readJsonBody(event: H3Event): Promise<unknown> {
  try {
    return await event.req.json()
  } catch {
    return undefined
  }
}
