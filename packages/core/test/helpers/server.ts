import {spawn} from 'node:child_process'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {H3} from 'h3'
import {serve, type Server} from 'srvx'
import {getHarness} from '@aidx/harness'
import type {HarnessChild} from '@aidx/protocol/harness-types'
import {registerChatRoutes} from '../../src/api/chat/chat.js'
import {makeUiBus, type UiBus} from '../../src/runtime/ui-bus.js'

export type TestServerOpts = {
  harness?: string
  onInjectUi?: (spec: unknown) => boolean
}

export type TestServer = {
  url: string
  base: string
  postChat: (message: unknown) => Promise<string>
  close: () => Promise<void>
}

// Real harness spawn with all three stdio piped (stdin lets the adapter deliver stream-json input).
function realSpawn(bin: string): (args: string[], cwd: string) => HarnessChild {
  return (args, cwd) => {
    const child = spawn(bin, args, {cwd, stdio: ['pipe', 'pipe', 'pipe']})
    const {stdin, stdout, stderr} = child
    if (!stdin || !stdout || !stderr) throw new Error(`harness "${bin}" did not expose stdio pipes`)
    return {pid: child.pid ?? -1, stdin, stdout, stderr, kill: () => void child.kill('SIGTERM')}
  }
}

// Boot a real srvx server with the chat routes wired to a real harness spawn. Integration only.
export async function startTestServer(opts: TestServerOpts = {}): Promise<TestServer> {
  const stateRoot = mkdtempSync(join(tmpdir(), 'aidx-it-'))
  const harnessId = opts.harness ?? 'claude'
  const harness = getHarness(harnessId)
  if (!harness) throw new Error(`harness '${harnessId}' not registered`)

  const baseBus = makeUiBus()
  const onInjectUi = opts.onInjectUi
  const uiBus: UiBus = onInjectUi
    ? {
        inject: (spec) => {
          onInjectUi(spec)
          return baseBus.inject(spec)
        },
        run: baseBus.run,
      }
    : baseBus

  const app = new H3()
  registerChatRoutes(app, {
    cwd: stateRoot,
    stateRoot,
    previewId: 'it-preview',
    initialSessionId: '',
    harness,
    spawnHarness: realSpawn(harness.binName),
    systemPromptText: '',
    uiBus,
  })

  const server: Server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
  await server.ready()
  const base = new URL(server.url ?? '').origin

  const postChat = async (message: unknown): Promise<string> => {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({messages: [message]}),
    })
    return res.text()
  }
  const close = async (): Promise<void> => {
    await server.close()
    rmSync(stateRoot, {recursive: true, force: true})
  }
  return {url: base, base, postChat, close}
}
