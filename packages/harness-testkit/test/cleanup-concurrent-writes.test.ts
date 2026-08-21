import {existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {spawn, type ChildProcess} from 'node:child_process'
import {afterEach, expect, it} from 'vitest'
import {createTestkit, type BootApp} from '../src/create-testkit.js'
import {createFakeHarness} from '../src/create-fake-harness.js'

const lateWriterSource = `
const {writeFileSync, unlinkSync, existsSync} = require('node:fs')
const {join} = require('node:path')
const root = process.argv[1]
const temp = join(root, '.tanstack-mcp-bridge-late.json')
writeFileSync(join(root, 'writer-live'), '')
console.log('live')
const stopAt = Date.now() + 150
while (Date.now() < stopAt) writeFileSync(temp, '{}')
if (existsSync(temp)) unlinkSync(temp)
if (existsSync(join(root, 'writer-live'))) unlinkSync(join(root, 'writer-live'))
`

function seedTree(root: string): void {
  for (const dir of Array.from({length: 20}, (_, index) => join(root, `d${index}`))) {
    mkdirSync(dir, {recursive: true})
    for (const file of Array.from({length: 20}, (_, index) => join(dir, `f${index}`))) {
      writeFileSync(file, 'x'.repeat(200))
    }
  }
}

function fakeRpcResponse(request: Request): unknown {
  const path = new URL(request.url).pathname
  if (path.endsWith('/sessions/resolve')) return {sessionId: 'conciv_cleanup_fixture'}
  if (path.endsWith('/sessions/list')) return []
  return {ok: true}
}

function lateWritingBoot(state: {writer: ChildProcess | null}): BootApp {
  return async (env) => {
    seedTree(env.stateRoot)
    return {
      fetch: (request) =>
        new Response(JSON.stringify({json: fakeRpcResponse(request)}), {
          headers: {'content-type': 'application/json'},
        }),
      dispose: async () => {
        const writer = spawn(process.execPath, ['-e', lateWriterSource, env.stateRoot], {
          stdio: ['ignore', 'pipe', 'ignore'],
        })
        state.writer = writer
        await new Promise<void>((resolve) => writer.stdout?.once('data', () => resolve()))
      },
    }
  }
}

const state = {writer: null as ChildProcess | null}

afterEach(() => {
  state.writer?.kill('SIGKILL')
  state.writer = null
})

it('removes the state root even when teardown drops a temp file into it mid-removal', async () => {
  const kit = await createTestkit(createFakeHarness(), lateWritingBoot(state)).setup()
  const stateRoot = kit.stateRoot

  await kit.cleanup()

  expect(existsSync(stateRoot)).toBe(false)
}, 30_000)
