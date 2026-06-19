import {execSync, spawn} from 'node:child_process'
import {describe, expect, it} from 'vitest'
import {chat, EventType, type StreamChunk} from '@tanstack/ai'
import type {HarnessChild} from '@mandarax/protocol/harness-types'
import {harnessText} from '../src/_shared/text-adapter.js'
import {makeClaudeAdapter} from '../src/claude/index.js'

// Drives the spawned CLI through the stream-json decode path, so force the CLI adapter — the default
// `claude` is now the SDK transport whose run() would ignore the injected spawnHarness.
const claude = makeClaudeAdapter(false)

function hasClaude(): boolean {
  try {
    execSync('command -v claude', {stdio: 'ignore'})
    return true
  } catch {
    return false
  }
}

const spawnHarness = (args: string[], cwd: string): HarnessChild => {
  const child = spawn('claude', args, {cwd, stdio: ['pipe', 'pipe', 'pipe']})
  return {
    pid: child.pid ?? 0,
    stdout: child.stdout,
    stderr: child.stderr,
    stdin: child.stdin,
    kill: () => child.kill(),
  }
}

describe('harnessText adapter', () => {
  it.skipIf(!hasClaude())(
    'drives claude through chat() with one lifecycle pair',
    async () => {
      const adapter = harnessText(claude, {cwd: process.cwd(), spawnHarness, systemPrompt: '', onSpawn() {}})
      const out: StreamChunk[] = []
      for await (const chunk of chat({adapter, messages: [{role: 'user', content: 'reply with exactly PONG'}]})) {
        out.push(chunk)
      }
      expect(out.filter((c) => c.type === EventType.RUN_STARTED)).toHaveLength(1)
      expect(out.filter((c) => c.type === EventType.RUN_FINISHED)).toHaveLength(1)
      const text = out.flatMap((c) => (c.type === EventType.TEXT_MESSAGE_CONTENT ? [c.delta] : [])).join('')
      expect(text.toUpperCase()).toContain('PONG')
    },
    60_000,
  )
})
