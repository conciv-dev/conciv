import {logError} from './debug.js'

export const RESULT_CAP_CHARS = 50_000

const TRUNCATION_HEAD_CHARS = 4_000

const TRUNCATION_MARKER = 'conciv:truncated'

const TRUNCATION_ADVICE = 'narrow the request or aggregate inside the sandbox and return less data'

export function safeStringify(value: unknown, context: string): string {
  try {
    return JSON.stringify(value) ?? 'null'
  } catch (error) {
    logError(`[core] ${context} was not JSON-serializable: ${String(error)}`)
    return JSON.stringify({error: 'value could not be serialized', reason: String(error)})
  }
}

function wellFormedSlice(text: string, length: number): string {
  const sliced = text.slice(0, length)
  const last = sliced.charCodeAt(sliced.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) return sliced.slice(0, -1)
  return sliced
}

export function truncationPayload(reason: string, headSource: string): Record<string, unknown> {
  return {
    [TRUNCATION_MARKER]: true,
    truncated: true,
    reason,
    advice: TRUNCATION_ADVICE,
    head: wellFormedSlice(headSource, TRUNCATION_HEAD_CHARS),
  }
}

export function truncationEnvelope(reason: string, headSource: string): string {
  return JSON.stringify(truncationPayload(reason, headSource))
}

function oversizeReason(what: string, length: number): string {
  return `the ${what} is ${length} characters and the cap is ${RESULT_CAP_CHARS}`
}

export function cappedText(body: string): string {
  if (body.length <= RESULT_CAP_CHARS) return body
  return truncationEnvelope(oversizeReason('serialized result', body.length), body)
}

export function cappedValue(value: unknown, context: string): unknown {
  const body = safeStringify(value, context)
  if (body.length <= RESULT_CAP_CHARS) return value
  return truncationPayload(oversizeReason('serialized result', body.length), body)
}
