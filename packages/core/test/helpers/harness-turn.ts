import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {expect} from 'vitest'
import {chat, EventType, type StreamChunk} from '@tanstack/ai'
import type {HarnessAdapter, HarnessChatDeps} from '@conciv/protocol/harness-types'
import {HarnessSessionId, type SessionId} from '@conciv/protocol/chat-types'
import {withConcivGate} from '../../src/chat/gate.js'
import {withConcivSandbox} from '../../src/chat/sandbox.js'
import {bootMadeApp} from './boot.js'

const autoAllowGate = {decide: async () => 'allow' as const}

export type HarnessTurnOpts = {
  harness: HarnessAdapter
  dir: string
  sessionId: SessionId
  prompt: string
  resumeSessionId: HarnessSessionId | null
  model?: string
}

export async function runHarnessTurn(opts: HarnessTurnOpts): Promise<StreamChunk[]> {
  const deps: HarnessChatDeps = {
    cwd: opts.dir,
    sessionId: opts.sessionId,
    resumeSessionId: opts.resumeSessionId,
    env: process.env,
    kind: 'chat',
    decide: autoAllowGate.decide,
    ...(opts.model ? {model: opts.model} : {}),
  }
  const config = opts.harness.chatConfig(deps)
  const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-harness-turn-'))
  const made = await bootMadeApp({stateRoot, cwd: opts.dir, harness: opts.harness})
  const chunks: StreamChunk[] = []
  try {
    const stream = chat({
      adapter: config.adapter,
      messages: [{role: 'user', content: opts.prompt}],
      threadId: `${opts.sessionId}-thread`,
      middleware: [withConcivSandbox(made.chat.sandbox), withConcivGate(autoAllowGate)],
      modelOptions: config.modelOptions,
    })
    for await (const chunk of stream) chunks.push(chunk)
  } finally {
    await made.dispose()
  }
  return chunks
}

export function sessionIdFrom(chunks: StreamChunk[], eventName: string): HarnessSessionId | null {
  for (const chunk of chunks) {
    if (chunk.type !== EventType.CUSTOM || chunk.name !== eventName) continue
    const value = chunk.value
    if (typeof value === 'object' && value !== null && 'sessionId' in value && typeof value.sessionId === 'string') {
      return HarnessSessionId.parse(value.sessionId)
    }
  }
  return null
}

export function textOf(chunks: StreamChunk[]): string {
  return chunks.flatMap((chunk) => (chunk.type === EventType.TEXT_MESSAGE_CONTENT ? [chunk.delta] : [])).join('')
}

export type ResumeScenarioOpts = {
  harness: HarnessAdapter
  dir: string
  sessionId: SessionId
  sessionEvent: string
  model?: string
}

export async function assertTurnAndResume(opts: ResumeScenarioOpts): Promise<void> {
  const turn = (prompt: string, resumeSessionId: HarnessSessionId | null) =>
    runHarnessTurn({
      harness: opts.harness,
      dir: opts.dir,
      sessionId: opts.sessionId,
      prompt,
      resumeSessionId,
      ...(opts.model ? {model: opts.model} : {}),
    })
  const first = await turn('Remember the token PLUM42. Reply with exactly OK.', null)
  expect(first.at(-1)?.type).toBe(EventType.RUN_FINISHED)
  expect(textOf(first).length).toBeGreaterThan(0)
  const sessionId = sessionIdFrom(first, opts.sessionEvent)
  expect(sessionId).toBeTruthy()

  const second = await turn('What was the token I asked you to remember? Reply with the token only.', sessionId)
  expect(second.at(-1)?.type).toBe(EventType.RUN_FINISHED)
  expect(textOf(second)).toContain('PLUM42')
}
