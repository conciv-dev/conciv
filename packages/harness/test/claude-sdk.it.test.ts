import {execSync} from 'node:child_process'
import {describe, it, expect, afterEach} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import type {HarnessRunContext, HarnessTurn} from '@conciv/protocol/harness-types'
import {claudeSdkRun, claudeSdkShutdown, __sdkStats, __sdkReset} from '../src/claude/sdk.js'

function hasClaude(): boolean {
  try {
    execSync('command -v claude', {stdio: 'ignore'})
    return true
  } catch {
    return false
  }
}

function ctxFor(sessionId: string): HarnessRunContext {
  return {
    sessionId,
    env: process.env as Record<string, string | undefined>,
    onSessionId: () => {},
    signal: new AbortController().signal,
    decide: async () => 'allow',
    threadId: sessionId,
  }
}

async function runTurn(sessionId: string, prompt: string): Promise<string> {
  const turn: HarnessTurn = {
    prompt,
    cwd: process.cwd(),
    resumeSessionId: null,
    systemPrompt: '',
    model: 'haiku',
    kind: 'chat',
  }
  let text = ''
  for await (const c of claudeSdkRun(turn, ctxFor(sessionId)) as AsyncGenerator<StreamChunk>) {
    if (c.type === EventType.TEXT_MESSAGE_CONTENT) text += (c as {delta?: string}).delta ?? ''
  }
  return text
}

describe('claude SDK transport — warm session registry', () => {
  afterEach(() => __sdkReset())

  it.skipIf(!hasClaude())(
    'reuses one warm process across turns, persists context, isolates sessions',
    async () => {
      const a = 'sess-A'
      await runTurn(a, 'Remember the number 42. Reply with just: OK')
      expect(__sdkStats().spawned).toBe(1)

      const recall = await runTurn(a, 'What number did I ask you to remember? Reply with just the number.')
      expect(recall).toContain('42')
      expect(__sdkStats()).toEqual({spawned: 1, live: 1})

      const b = 'sess-B'
      await runTurn(b, 'Reply with just: HI')
      expect(__sdkStats()).toEqual({spawned: 2, live: 2})

      claudeSdkShutdown()
      expect(__sdkStats().live).toBe(0)
    },
    180_000,
  )
})
