import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {chat, EventType, type StreamChunk} from '@tanstack/ai'
import {claude} from '@conciv/harness/claude'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'
import {concivSandbox, withConcivGate, withConcivSandbox} from '../src/api/chat/sandbox.js'

const runReal = !process.env.CI

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'claude-tanstack-')))
const autoAllowGate = {decide: async () => 'allow' as const}

const deps = (over: Partial<HarnessChatDeps> = {}): HarnessChatDeps => ({
  cwd: dir,
  sessionId: 'it-1',
  resumeSessionId: null,
  env: {},
  kind: 'chat',
  decide: autoAllowGate.decide,
  ...over,
})

async function runTurn(prompt: string, resumeSessionId: string | null): Promise<StreamChunk[]> {
  const config = claude.chatConfig?.(deps({resumeSessionId}))
  if (!config) throw new Error('claude.chatConfig missing')
  const chunks: StreamChunk[] = []
  const stream = chat({
    adapter: config.adapter,
    messages: [{role: 'user', content: prompt}],
    threadId: 'claude-tanstack-it',
    middleware: [withConcivSandbox(concivSandbox(dir)), withConcivGate(autoAllowGate, 'it-1')],
    modelOptions: config.modelOptions,
  })
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

function sessionIdFrom(chunks: StreamChunk[]): string | null {
  for (const chunk of chunks) {
    if (chunk.type !== EventType.CUSTOM || chunk.name !== 'claude-code.session-id') continue
    const value = chunk.value
    if (typeof value === 'object' && value !== null && 'sessionId' in value && typeof value.sessionId === 'string') {
      return value.sessionId
    }
  }
  return null
}

describe('claude through claudeCodeText + conciv sandbox/gate', () => {
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
