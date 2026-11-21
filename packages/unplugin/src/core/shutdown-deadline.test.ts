import {spawn, type ChildProcessByStdio} from 'node:child_process'
import {once} from 'node:events'
import {join} from 'node:path'
import {createInterface} from 'node:readline'
import type {Readable} from 'node:stream'
import {text} from 'node:stream/consumers'
import {pathToFileURL} from 'node:url'
import {test as base, describe, expect} from 'vitest'

type Engine = ChildProcessByStdio<null, Readable, Readable>
type Hung = {engine: Engine; lines: AsyncIterator<string>}

const deadlineModule = pathToFileURL(join(import.meta.dirname, 'shutdown-deadline.ts')).href
const test = base.extend<{hang: (deadline: number) => Hung}>({
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

function startHung(deadline: number): Hung {
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

async function readLine(lines: AsyncIterator<string>, expected: string): Promise<void> {
  let next = await lines.next()
  while (next.done !== true && next.value !== expected) next = await lines.next()
}

describe.skipIf(process.platform === 'win32')('the shutdown deadline', () => {
  test('exits 1 when the close outlives the deadline after Ctrl+C, and names what is still pending', async ({hang}) => {
    const {engine, lines} = hang(200)
    await readLine(lines, 'SHUTDOWN_READY')
    const exited = once(engine, 'exit')
    const stderr = text(engine.stderr)

    engine.kill('SIGINT')

    expect(await stderr).toContain('shutdown did not finish within 200ms; exiting. Still pending:')
    expect(await stderr).toContain('conciv engine stopping')
    expect(await exited).toEqual([1, null])
  })

  test('a second Ctrl+C during the close reports and exits without waiting for the deadline', async ({hang}) => {
    const {engine, lines} = hang(5_000)
    await readLine(lines, 'SHUTDOWN_READY')
    const exited = once(engine, 'exit')
    const stderr = text(engine.stderr)

    engine.kill('SIGINT')
    await readLine(lines, 'SIGTERM_SEEN')
    engine.kill('SIGINT')

    expect(await stderr).toContain('received SIGINT again during shutdown; exiting. Still pending:')
    expect(await stderr).toContain('conciv engine stopping')
    expect(await exited).toEqual([1, null])
  })
})
