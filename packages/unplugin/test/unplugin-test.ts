import {spawn, spawnSync, type ChildProcessByStdio} from 'node:child_process'
import {chmodSync, readdirSync, writeFileSync} from 'node:fs'
import {delimiter, join} from 'node:path'
import {createInterface} from 'node:readline'
import type {Readable} from 'node:stream'
import {pathToFileURL} from 'node:url'
import {test as base} from 'vitest'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'

type Engine = ChildProcessByStdio<null, Readable, Readable>
type Hung = {engine: Engine; lines: AsyncIterator<string>}

function startHung(deadline: number): Hung {
  const deadlineModule = pathToFileURL(join(import.meta.dirname, '..', 'src', 'core', 'shutdown-deadline.ts')).href
  const program = [
    `import {install, track} from ${JSON.stringify(deadlineModule)}`,
    `install(${deadline})`,
    "track('conciv engine stopping')",
    'process.on("SIGTERM", () => {',
    `  setTimeout(() => process.exit(0), ${deadline * 10})`,
    "  console.log('SIGTERM_SEEN')",
    '})',
    'setInterval(() => {}, 1 << 30)',
    "console.log('SHUTDOWN_READY')",
  ].join('\n')
  const engine = spawn(process.execPath, ['--input-type=module', '-e', program], {stdio: ['ignore', 'pipe', 'pipe']})
  return {engine, lines: createInterface({input: engine.stdout})[Symbol.asyncIterator]()}
}

export const test = base.extend<{started: number[]; hang: (deadline: number) => Hung}>({
  started: async ({task: _task}, use) => {
    const started: number[] = []
    await use(started)
    for (const pid of started) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        continue
      }
    }
  },
  hang: async ({task: _task}, use) => {
    const started: Engine[] = []
    await use((deadline) => {
      const hung = startHung(deadline)
      started.push(hung.engine)
      return hung
    })
    for (const engine of started) engine.kill('SIGKILL')
  },
})

export function fakeClaude(bin: string, pidFile: string): void {
  const script = join(bin, 'claude')
  writeFileSync(
    script,
    [
      '#!/usr/bin/env node',
      `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid))`,
      "process.stdout.write(JSON.stringify({type: 'system', subtype: 'init', session_id: 'fake-session', model: 'opus', tools: [], mcp_servers: [], cwd: process.cwd()}) + '\\n')",
      'process.stdin.resume()',
      'setInterval(() => {}, 1 << 30)',
    ].join('\n'),
  )
  chmodSync(script, 0o755)
}

export function adapterFiles(project: string): string[] {
  return readdirSync(project).filter((name) => name.includes('tanstack'))
}

export function running(pid: number): boolean {
  const state = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], {encoding: 'utf8'}).stdout.trim()
  return state !== '' && !state.startsWith('Z')
}

export function childEnv(bin: string, home: string): NodeJS.ProcessEnv {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('VITEST')))
  return {
    ...inherited,
    PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
    HOME: home,
    CONCIV_DISABLE_FILEWATCHER: 'true',
  }
}

export async function readLine(lines: AsyncIterator<string>, expected: string): Promise<void> {
  let next = await lines.next()
  while (next.done !== true && next.value !== expected) next = await lines.next()
}

export async function readyLine(lines: AsyncIterator<string>): Promise<void> {
  let next = await lines.next()
  while (next.done !== true && !next.value.includes('Local:')) next = await lines.next()
}

export async function agentStarted(events: AsyncIterator<ChatEvent>): Promise<void> {
  let next = await events.next()
  while (
    next.done !== true &&
    !(next.value.type === ChatEventType.CUSTOM && next.value.name === 'claude-code.session-id')
  )
    next = await events.next()
}
