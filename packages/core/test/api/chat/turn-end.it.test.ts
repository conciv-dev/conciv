import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'
import {defineExtension} from '@conciv/extension'
import {startTestServer, type SpawnHarness} from '../../helpers/server.js'
import {useFakeHarness} from '../../helpers/harness-mode.js'

const fakeClaude = fileURLToPath(new URL('../../fixtures/fake-claude.ts', import.meta.url))

function fakeSpawn(): SpawnHarness {
  return (args, cwd) => {
    const child = spawn(process.execPath, [fakeClaude, ...args], {cwd, stdio: ['pipe', 'pipe', 'pipe']})
    const {stdin, stdout, stderr} = child
    if (!stdout || !stderr) throw new Error('fake-claude did not expose stdout/stderr')
    return {pid: child.pid ?? -1, stdin: stdin ?? undefined, stdout, stderr, kill: () => child.kill('SIGTERM')}
  }
}

const turn = (text: string) => ({id: 'm', role: 'user', parts: [{type: 'text', content: text}]})

describe('extension turn-end hook', () => {
  it.runIf(useFakeHarness)(
    'fires turnEnd with the session id after the turn stream closes',
    async () => {
      const seen: string[] = []
      const probe = defineExtension({name: 'turn-probe', tools: []}).server(async () => ({
        context: {},
        turnEnd: (sessionId: string) => void seen.push(sessionId),
      }))
      const {resolve, postChat, close} = await startTestServer({spawnHarness: fakeSpawn(), extensions: [probe]})
      try {
        const sessionId = await resolve()
        await postChat(turn('hi'), sessionId)
        expect(seen).toEqual([sessionId])
      } finally {
        await close()
      }
    },
    120_000,
  )
})
