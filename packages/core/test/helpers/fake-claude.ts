import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import type {HarnessChild} from '@conciv/protocol/harness-types'
import type {SpawnHarness} from './boot.js'

export const fakeClaudePath = fileURLToPath(new URL('../fixtures/fake-claude.ts', import.meta.url))

export function spawnFakeClaude(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): HarnessChild {
  const child = spawn(process.execPath, [fakeClaudePath, ...args], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {...process.env, ...env},
  })
  const {stdin, stdout, stderr} = child
  if (!stdout || !stderr) throw new Error('fake-claude did not expose stdout/stderr')
  return {pid: child.pid ?? -1, stdin: stdin ?? undefined, stdout, stderr, kill: () => void child.kill('SIGTERM')}
}

export function fakeClaudeSpawn(env: NodeJS.ProcessEnv = {}): SpawnHarness {
  return (args, cwd) => spawnFakeClaude(args, cwd, env)
}
