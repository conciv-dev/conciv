import {describe, it, expect} from 'vitest'
import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {createRequire} from 'node:module'
import {fileURLToPath, pathToFileURL} from 'node:url'
import type {Readable} from 'node:stream'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {codex} from '../src/codex/codex.js'
import {claude} from '../src/claude/claude.js'

// Real spawn: run fake-harness via tsx so the test exercises the true stdout-pipe → decode path.
const require = createRequire(import.meta.url)
const tsxEntry = pathToFileURL(require.resolve('tsx')).href
const fakeHarness = fileURLToPath(new URL('fixtures/fake-harness.ts', import.meta.url))

async function* linesOf(stream: Readable): AsyncGenerator<string> {
  const rl = createInterface({input: stream, crlfDelay: Infinity})
  for await (const line of rl) yield line
}

function spawnFake(format: 'claude' | 'codex'): Readable {
  const child = spawn(process.execPath, ['--import', tsxEntry, fakeHarness], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env, AIDX_FAKE_FORMAT: format},
  })
  const {stdout} = child
  if (!stdout) throw new Error('fake-harness did not expose stdout')
  return stdout
}

describe('harness seam (IT, real spawn via fake-harness)', () => {
  it('decodes a claude-format child stream into RUN_STARTED .. RUN_FINISHED', async () => {
    const out: StreamChunk[] = []
    for await (const c of claude.decode(linesOf(spawnFake('claude')), {onSessionId: () => {}})) out.push(c)
    expect(out[0]?.type).toBe(EventType.RUN_STARTED)
    expect(out.at(-1)?.type).toBe(EventType.RUN_FINISHED)
    expect(out.some((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)).toBe(true)
  })

  it('a permissionGate:none harness (codex) builds argv with no gate even if a permissionUrl is offered', () => {
    expect(codex.capabilities.permissionGate).toBe('none')
    const args = codex.buildArgs({
      prompt: 'p',
      cwd: '/r',
      resumeSessionId: null,
      systemPrompt: '',
      permissionUrl: 'http://h/api/chat/permission',
    })
    expect(args).not.toContain('--settings')
    expect(args.join(' ')).not.toContain('permission')
  })

  it('decodes a codex-format child stream into RUN_STARTED .. RUN_FINISHED with text', async () => {
    const out: StreamChunk[] = []
    for await (const c of codex.decode(linesOf(spawnFake('codex')), {onSessionId: () => {}})) out.push(c)
    expect(out[0]?.type).toBe(EventType.RUN_STARTED)
    expect(out.at(-1)?.type).toBe(EventType.RUN_FINISHED)
    expect(out.some((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)).toBe(true)
  })
})
