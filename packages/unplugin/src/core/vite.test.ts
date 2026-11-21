import {spawn, spawnSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {once} from 'node:events'
import {chmodSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {delimiter, dirname, join} from 'node:path'
import {createInterface} from 'node:readline'
import {pathToFileURL} from 'node:url'
import {test as base, describe, expect} from 'vitest'
import {z} from 'zod'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {makeBrowserRpcClient} from '@conciv/contract'
import {concivStateDir} from '@conciv/protocol/state-types'

const RecordedEngineSchema = z.object({port: z.number().int(), token: z.string().min(1)})
const viteBin = join(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin', 'vite.js')
const pluginEntry = pathToFileURL(join(import.meta.dirname, '..', '..', 'dist', 'vite.js')).href

const test = base.extend<{started: number[]}>({
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
})

function fakeClaude(bin: string, pidFile: string): void {
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

function adapterFiles(project: string): string[] {
  return readdirSync(project).filter((name) => name.includes('tanstack'))
}

function running(pid: number): boolean {
  const state = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], {encoding: 'utf8'}).stdout.trim()
  return state !== '' && !state.startsWith('Z')
}

function childEnv(bin: string, home: string): NodeJS.ProcessEnv {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('VITEST')))
  return {
    ...inherited,
    PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
    HOME: home,
    CONCIV_DISABLE_FILEWATCHER: 'true',
  }
}

async function readyLine(lines: AsyncIterator<string>): Promise<void> {
  let next = await lines.next()
  while (next.done !== true && !next.value.includes('Local:')) next = await lines.next()
}

async function agentStarted(events: AsyncIterator<ChatEvent>): Promise<void> {
  let next = await events.next()
  while (
    next.done !== true &&
    !(next.value.type === ChatEventType.CUSTOM && next.value.name === 'claude-code.session-id')
  )
    next = await events.next()
}

describe.skipIf(process.platform === 'win32')('the vite dev server', () => {
  test('stops the engine on Ctrl+C mid-run: no adapter file stays in the project and no agent CLI outlives it', async ({
    started,
  }) => {
    const root = tempDir('ctrl-c-')
    const project = join(root, 'project')
    const home = join(root, 'home')
    const bin = join(root, 'bin')
    for (const folder of [project, home, bin]) mkdirSync(folder)
    const pidFile = join(root, 'agent.pid')
    fakeClaude(bin, pidFile)
    writeFileSync(
      join(project, 'vite.config.mjs'),
      `import conciv from ${JSON.stringify(pluginEntry)}\nexport default {plugins: [conciv({homeDir: ${JSON.stringify(home)}})]}\n`,
    )
    const server = spawn(process.execPath, [viteBin], {
      cwd: project,
      env: childEnv(bin, home),
      stdio: ['pipe', 'pipe', 'inherit'],
    })
    if (server.pid !== undefined) started.push(server.pid)
    const exited = once(server, 'exit')
    await readyLine(createInterface({input: server.stdout})[Symbol.asyncIterator]())
    const engine = RecordedEngineSchema.parse(
      JSON.parse(readFileSync(join(concivStateDir(project), 'server.json'), 'utf8')),
    )
    const browser = makeBrowserRpcClient(`http://127.0.0.1:${engine.port}/t/${engine.token}`)
    const {sessionId} = await browser.rpc.sessions.create()
    const runId = randomUUID()
    const events = await browser.rpc.chat.send({
      sessionId,
      runId,
      messages: [{id: `${runId}-user`, role: 'user', content: 'Hi'}],
    })
    await agentStarted(events[Symbol.asyncIterator]())
    const agent = Number(readFileSync(pidFile, 'utf8'))
    started.push(agent)
    expect(adapterFiles(project)).toHaveLength(3)

    server.kill('SIGINT')
    await exited
    browser.close()

    expect(adapterFiles(project)).toEqual([])
    expect(running(agent)).toBe(false)
  })
})
