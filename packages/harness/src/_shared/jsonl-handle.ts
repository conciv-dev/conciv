import {open, stat} from 'node:fs/promises'
import type {Stats} from 'node:fs'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import type {
  TranscriptChunk,
  TranscriptFailure,
  TranscriptFailureReason,
  TranscriptHandle,
  TranscriptRevision,
} from '@conciv/protocol/harness-types'
import {readHead} from './read-head.js'

const NEWLINE = 0x0a

export type JsonlParser<State> = {
  empty(): State
  foldLine(state: State, line: string, offset: number): State
  messages(state: State): ChatMessage[]
}

export type JsonlSource<State> = {
  parser: JsonlParser<State>
  resolvePath(): Promise<string | TranscriptFailure>
  verifyHead?(head: string): TranscriptFailure | null
}

export function transcriptFailure(reason: TranscriptFailureReason, detail: string): TranscriptFailure {
  return {ok: false, reason, detail}
}

function errorCode(error: unknown): string {
  if (!(error instanceof Error) || !('code' in error)) return ''
  const code = error.code
  return typeof code === 'string' ? code : ''
}

function statFailure(path: string, error: unknown): TranscriptFailure {
  const reason = errorCode(error) === 'ENOENT' ? 'missing' : 'unreadable'
  return transcriptFailure(reason, `${path}: ${String(error)}`)
}

async function statOf(path: string): Promise<Stats | TranscriptFailure> {
  try {
    return await stat(path)
  } catch (error) {
    return statFailure(path, error)
  }
}

async function readBytes(path: string, start: number, length: number): Promise<Buffer | TranscriptFailure> {
  if (length <= 0) return Buffer.alloc(0)
  const file = await open(path, 'r').catch((error: unknown) => statFailure(path, error))
  if ('ok' in file) return file
  try {
    const buffer = Buffer.allocUnsafe(length)
    const {bytesRead} = await file.read(buffer, 0, length, start)
    return buffer.subarray(0, bytesRead)
  } catch (error) {
    return transcriptFailure('unreadable', `${path}: ${String(error)}`)
  } finally {
    await file.close()
  }
}

function completeLines(buffer: Buffer): {text: string; bytes: number} {
  if (buffer.byteLength === 0) return {text: '', bytes: 0}
  const lastBreak = buffer.lastIndexOf(NEWLINE, buffer.byteLength - 1)
  if (lastBreak < 0) return {text: '', bytes: 0}
  return {text: buffer.toString('utf8', 0, lastBreak + 1), bytes: lastBreak + 1}
}

function headOf(path: string): string | TranscriptFailure {
  try {
    return readHead(path)
  } catch (error) {
    return statFailure(path, error)
  }
}

function revisionOf(info: Stats): TranscriptRevision {
  return {rev: `${info.size}:${info.mtimeMs}`, changedAt: info.mtimeMs}
}

export function makeJsonlHandle<State>(source: JsonlSource<State>): TranscriptHandle {
  const state = {closed: false, path: '', offset: 0, verified: false, fold: source.parser.empty()}

  const pathOf = async (): Promise<string | TranscriptFailure> => {
    if (state.path) return state.path
    const found = await source
      .resolvePath()
      .catch((error: unknown) =>
        transcriptFailure('unreadable', `resolving the transcript path failed: ${String(error)}`),
      )
    if (typeof found !== 'string') return found
    state.path = found
    return found
  }

  const located = async (): Promise<{path: string; info: Stats} | TranscriptFailure> => {
    if (state.closed) return transcriptFailure('unreadable', 'transcript handle closed')
    const path = await pathOf()
    if (typeof path !== 'string') return path
    const info = await statOf(path)
    if ('ok' in info) return info
    return {path, info}
  }

  const verify = (path: string): TranscriptFailure | null => {
    if (state.verified || !source.verifyHead) return null
    const head = headOf(path)
    if (typeof head !== 'string') return head
    const problem = source.verifyHead(head)
    if (problem) return problem
    state.verified = true
    return null
  }

  return {
    async revision(): Promise<TranscriptRevision | TranscriptFailure> {
      const found = await located()
      if ('ok' in found) return found
      const problem = verify(found.path)
      if (problem) return problem
      return revisionOf(found.info)
    },
    async read(): Promise<TranscriptChunk | TranscriptFailure> {
      const found = await located()
      if ('ok' in found) return found
      const problem = verify(found.path)
      if (problem) return problem
      if (found.info.size < state.offset) {
        state.offset = 0
        state.fold = source.parser.empty()
      }
      const replaced = state.offset === 0
      const buffer = await readBytes(found.path, state.offset, found.info.size - state.offset)
      if ('ok' in buffer) return buffer
      const complete = completeLines(buffer)
      complete.text.split('\n').reduce((offset, line) => {
        state.fold = source.parser.foldLine(state.fold, line, offset)
        return offset + Buffer.byteLength(line) + 1
      }, state.offset)
      state.offset += complete.bytes
      return {ok: true, ...revisionOf(found.info), messages: source.parser.messages(state.fold), replaced}
    },
    close(): void {
      state.closed = true
      state.path = ''
      state.offset = 0
      state.verified = false
      state.fold = source.parser.empty()
    },
  }
}
