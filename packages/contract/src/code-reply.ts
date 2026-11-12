import {
  imageBlocks,
  imagesIn,
  isContentParts,
  withoutImages,
  type ContentPart,
} from '@conciv/protocol/chat-message-types'
import type {PageQueueResult} from '@conciv/protocol/page-types'
import type {CodeDiscoverResult, CodeExecuteResult} from './contract.js'

export const RESULT_CAP_CHARS = 50_000

const TRUNCATION_HEAD_CHARS = 4_000

const TRUNCATION_MARKER = 'conciv:truncated'

const TRUNCATION_ADVICE = 'narrow the request or aggregate inside the sandbox and return less data'

export type CodeReplyContent = {type: 'text'; text: string} | {type: 'image'; data: string; mimeType: string}

export type CodeReply = {content: CodeReplyContent[]; isError?: boolean}

type Stringified = {ok: true; body: string} | {ok: false; failure: string}

type PartsFit = {kept: CodeReplyContent[]; firstDropped: string | null; budget: number}

export function codeExecuteReply(executed: CodeExecuteResult): CodeReply {
  const notices = executed.finished.map(queueNoticePart)
  if (!executed.ok) {
    const logs = executed.logs.length === 0 ? {} : {logs: executed.logs}
    const text = cappedText(safeStringify({error: executed.error, ...logs}))
    return {content: [...notices, {type: 'text', text}], isError: true}
  }
  return {content: [...notices, ...resultContent(executed.result, executed.logs)]}
}

export function codeDiscoverReply(discovered: CodeDiscoverResult): CodeReply {
  const notices = discovered.finished.map(queueNoticePart)
  return {content: [...notices, {type: 'text', text: cappedText(safeStringify(discovered.tools))}]}
}

export function queueNotice(result: PageQueueResult): string {
  return `queue ${result.queueId} ${result.status}: ${result.played} played, ${result.failed} failed\n${JSON.stringify(result)}`
}

export function safeStringify(value: unknown): string {
  const attempt = stringified(value)
  if (attempt.ok) return attempt.body
  return JSON.stringify(serializationFailure(attempt.failure))
}

export function cappedText(body: string): string {
  if (body.length <= RESULT_CAP_CHARS) return body
  return truncationEnvelope(oversizeReason(body.length), body)
}

export function cappedValue(value: unknown): unknown {
  const attempt = stringified(value)
  if (!attempt.ok) return serializationFailure(attempt.failure)
  const body = safeStringify(withoutImages(value))
  if (body.length <= RESULT_CAP_CHARS) return value
  const images = imagesIn(value)
  return {...truncationPayload(oversizeReason(body.length), body), ...(images.length === 0 ? {} : {images})}
}

function queueNoticePart(result: PageQueueResult): CodeReplyContent {
  return {type: 'text', text: cappedText(queueNotice(result))}
}

function resultContent(result: unknown, logs: string[]): CodeReplyContent[] {
  if (isContentParts(result)) return cappedParts([...result.map(partContent), ...logsPart(logs)])
  const body = safeStringify({result: withoutImages(result ?? null), logs})
  return [{type: 'text', text: cappedText(body)}, ...imageBlocks(imagesIn(result))]
}

function partContent(part: ContentPart): CodeReplyContent {
  if (part.type === 'text') return {type: 'text', text: part.content}
  if (part.type === 'image') {
    return {type: 'image', data: part.source.value, mimeType: part.source.mimeType ?? 'application/octet-stream'}
  }
  return {type: 'text', text: safeStringify(part)}
}

function logsPart(logs: string[]): CodeReplyContent[] {
  if (logs.length === 0) return []
  return [{type: 'text', text: cappedText(safeStringify({logs}))}]
}

function cappedParts(parts: CodeReplyContent[]): CodeReplyContent[] {
  const totalTextChars = parts.reduce((total, part) => (part.type === 'text' ? total + part.text.length : total), 0)
  if (totalTextChars <= RESULT_CAP_CHARS) return parts
  const fit = parts.reduce<PartsFit>(fitPart, {kept: [], firstDropped: null, budget: RESULT_CAP_CHARS})
  const reason = `the content parts carry ${totalTextChars} characters of text and the cap is ${RESULT_CAP_CHARS}`
  return [...fit.kept, {type: 'text', text: truncationEnvelope(reason, fit.firstDropped ?? '')}]
}

function fitPart(fit: PartsFit, part: CodeReplyContent): PartsFit {
  if (part.type !== 'text') return {...fit, kept: [...fit.kept, part]}
  if (fit.firstDropped === null && part.text.length <= fit.budget) {
    return {...fit, kept: [...fit.kept, part], budget: fit.budget - part.text.length}
  }
  return {...fit, firstDropped: fit.firstDropped ?? part.text}
}

function stringified(value: unknown): Stringified {
  try {
    return {ok: true, body: JSON.stringify(value) ?? 'null'}
  } catch (error) {
    return {ok: false, failure: String(error)}
  }
}

function serializationFailure(reason: string): Record<string, unknown> {
  return {error: 'value could not be serialized', reason}
}

function wellFormedSlice(text: string, length: number): string {
  const sliced = text.slice(0, length)
  const last = sliced.charCodeAt(sliced.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) return sliced.slice(0, -1)
  return sliced
}

function truncationPayload(reason: string, headSource: string): Record<string, unknown> {
  return {
    [TRUNCATION_MARKER]: true,
    truncated: true,
    reason,
    advice: TRUNCATION_ADVICE,
    head: wellFormedSlice(headSource, TRUNCATION_HEAD_CHARS),
  }
}

function truncationEnvelope(reason: string, headSource: string): string {
  return JSON.stringify(truncationPayload(reason, headSource))
}

function oversizeReason(length: number): string {
  return `the serialized result is ${length} characters and the cap is ${RESULT_CAP_CHARS}`
}
