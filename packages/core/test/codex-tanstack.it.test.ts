import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {chat, EventType, type StreamChunk} from '@tanstack/ai'
import {codex} from '@conciv/harness/codex'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'
import {harnessAvailable} from '@conciv/harness-testkit'
import {concivSandbox, withConcivGate, withConcivSandbox} from '../src/api/chat/sandbox.js'

const runReal = !process.env.CI && harnessAvailable(codex)

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'codex-tanstack-')))
const autoAllowGate = {decide: async () => 'allow' as const}

const deps = (over: Partial<HarnessChatDeps> = {}): HarnessChatDeps => ({
  cwd: dir,
  sessionId: 'it-codex-1',
  resumeSessionId: null,
  env: process.env,
  kind: 'chat',
  decide: autoAllowGate.decide,
  ...over,
})

async function runTurn(prompt: string, resumeSessionId: string | null): Promise<StreamChunk[]> {
  const config = codex.chatConfig(deps({resumeSessionId}))
  const chunks: StreamChunk[] = []
  const stream = chat({
    adapter: config.adapter,
    messages: [{role: 'user', content: prompt}],
    threadId: 'codex-tanstack-it',
    middleware: [withConcivSandbox(concivSandbox(dir)), withConcivGate(autoAllowGate, 'it-codex-1')],
    modelOptions: config.modelOptions,
  })
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

function sessionIdFrom(chunks: StreamChunk[]): string | null {
  for (const chunk of chunks) {
    if (chunk.type !== EventType.CUSTOM || chunk.name !== 'codex.session-id') continue
    const value = chunk.value
    if (typeof value === 'object' && value !== null && 'sessionId' in value && typeof value.sessionId === 'string') {
      return value.sessionId
    }
  }
  return null
}

describe('codex through codexText + conciv sandbox/gate', () => {
  it.skipIf(!runReal)(
    'streams a real turn and resumes the session',
    async () => {
      const first = await runTurn('Remember the token PLUM42. Reply with exactly OK.', null)
      expect(first.at(-1)?.type).toBe(EventType.RUN_FINISHED)
      const text = first
        .flatMap((chunk) => (chunk.type === EventType.TEXT_MESSAGE_CONTENT ? [chunk.delta] : []))
        .join('')
      expect(text.length).toBeGreaterThan(0)
      const sessionId = sessionIdFrom(first)
      expect(sessionId).toBeTruthy()

      const second = await runTurn('What was the token I asked you to remember? Reply with the token only.', sessionId)
      expect(second.at(-1)?.type).toBe(EventType.RUN_FINISHED)
      const recalled = second
        .flatMap((chunk) => (chunk.type === EventType.TEXT_MESSAGE_CONTENT ? [chunk.delta] : []))
        .join('')
      expect(recalled).toContain('PLUM42')
    },
    120_000,
  )
})
