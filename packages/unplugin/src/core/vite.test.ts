import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {once} from 'node:events'
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {createInterface} from 'node:readline'
import {text} from 'node:stream/consumers'
import {pathToFileURL} from 'node:url'
import {describe} from 'vitest'
import {z} from 'zod'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {concivStateDir} from '@conciv/protocol/state-types'
import {adapterFiles, agentStarted, childEnv, fakeClaude, readyLine, running, test} from '../../test/unplugin-test.js'

describe.concurrent('the vite dev server', () => {
  test("stops the engine on Ctrl+C mid-run: no adapter file stays in the project, no agent CLI outlives it, and the engine's logs go to the log file in its home, none to the terminal", async ({
    started,
    browser: openBrowser,
    expect,
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
      env: {...childEnv(bin, home), CONCIV_DISABLE_FILEWATCHER: 'false', CONCIV_PRINT_LOGS: ''},
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    if (server.pid !== undefined) started.push(server.pid)
    const exited = once(server, 'exit')
    const printedErrors = text(server.stderr)
    const lines = createInterface({input: server.stdout})
    await readyLine(lines[Symbol.asyncIterator]())
    const engine = RecordedEngineSchema.parse(
      JSON.parse(readFileSync(join(concivStateDir(project), 'server.json'), 'utf8')),
    )
    const browser = openBrowser(`http://127.0.0.1:${engine.port}`, engine.token)
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

    expect(adapterFiles(project)).toEqual([])
    expect(running(agent)).toBe(false)
    const printed = [await printedErrors]
    for await (const line of lines) printed.push(line)
    const logged = readdirSync(join(home, 'log'))
      .map((file) => readFileSync(join(home, 'log', file), 'utf8'))
      .join('\n')
    expect(logged).toMatch(/^timestamp=\S+ level=INFO run=\S+ message="watcher started"/m)
    expect(logged).toMatch(/^timestamp=\S+ level=INFO run=\S+ message="conciv: the engine started"/m)
    expect(printed.join('\n')).not.toMatch(/watcher started|the engine started/)
  })

  test('a second dev server whose engine port is taken still boots, with its engine on another port', async ({
    viteDev,
    expect,
  }) => {
    const first = await viteDev({})
    const second = await viteDev({port: first.port})

    expect(second.port).not.toBe(first.port)
    expect((await fetch(`http://127.0.0.1:${first.port}/health`)).status).toBe(200)
    expect((await fetch(`http://127.0.0.1:${second.port}/health`)).status).toBe(200)
  })
})
