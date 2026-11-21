import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {once} from 'node:events'
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {createInterface} from 'node:readline'
import {pathToFileURL} from 'node:url'
import {describe, expect} from 'vitest'
import {z} from 'zod'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {makeBrowserRpcClient} from '@conciv/contract'
import {concivStateDir} from '@conciv/protocol/state-types'
import {adapterFiles, agentStarted, childEnv, fakeClaude, readyLine, running, test} from '../../test/unplugin-test.js'

describe.skipIf(process.platform === 'win32')('the vite dev server', () => {
  test('stops the engine on Ctrl+C mid-run: no adapter file stays in the project and no agent CLI outlives it', async ({
    started,
  }) => {
    const RecordedEngineSchema = z.object({port: z.number().int(), token: z.string().min(1)})
    const viteBin = join(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin', 'vite.js')
    const pluginEntry = pathToFileURL(join(import.meta.dirname, '..', '..', 'dist', 'vite.js')).href
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

  test('a second dev server whose engine port is taken still boots, with its engine on another port', async ({
    viteDev,
  }) => {
    const first = await viteDev({})
    const second = await viteDev({port: first.port})

    expect(second.port).not.toBe(first.port)
    expect((await fetch(`http://127.0.0.1:${first.port}/health`)).status).toBe(200)
    expect((await fetch(`http://127.0.0.1:${second.port}/health`)).status).toBe(200)
  })
})
