import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {chat, EventType, type StreamChunk} from '@tanstack/ai'
import {opencode} from '@conciv/harness/opencode'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'
import {harnessAvailable} from '@conciv/harness-testkit'
import {concivSandbox, withConcivGate, withConcivSandbox} from '../src/api/chat/sandbox.js'

const optIn = process.env.CONCIV_OPENCODE_IT === '1'
const runReal = !process.env.CI && optIn && harnessAvailable(opencode)

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'opencode-tanstack-')))
const autoAllowGate = {decide: async () => 'allow' as const}

const deps = (over: Partial<HarnessChatDeps> = {}): HarnessChatDeps => ({
  cwd: dir,
  sessionId: 'it-opencode-1',
  resumeSessionId: null,
  env: process.env,
  kind: 'chat',
  decide: autoAllowGate.decide,
  ...over,
})

const IT_MODEL = process.env.CONCIV_OPENCODE_IT_MODEL

async function runTurn(prompt: string, resumeSessionId: string | null): Promise<StreamChunk[]> {
  const config = opencode.chatConfig(deps({resumeSessionId, ...(IT_MODEL ? {model: IT_MODEL} : {})}))
  const chunks: StreamChunk[] = []
  const stream = chat({
    adapter: config.adapter,
    messages: [{role: 'user', content: prompt}],
    threadId: 'opencode-tanstack-it',
    middleware: [withConcivSandbox(concivSandbox(dir)), withConcivGate(autoAllowGate, 'it-opencode-1')],
    modelOptions: config.modelOptions,
  })
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

function sessionIdFrom(chunks: StreamChunk[]): string | null {
  for (const chunk of chunks) {
    if (chunk.type !== EventType.CUSTOM || chunk.name !== 'opencode.session-id') continue
    const value = chunk.value
    if (typeof value === 'object' && value !== null && 'sessionId' in value && typeof value.sessionId === 'string') {
      return value.sessionId
    }
  }
  return null
}

describe('opencode through opencodeText + conciv sandbox/gate (opt-in: CONCIV_OPENCODE_IT=1 + a funded opencode provider)', () => {
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
    180_000,
  )
})
