import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import pWaitFor from 'p-wait-for'
import {afterEach, expect, test} from 'vitest'
import {createTrailSupervisor} from '../../src/db/trail-supervisor.js'

const dirs: string[] = []

function makeDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mx-trail-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
})

test('start resolves on the Listening on line and the baseUrl answers', async () => {
  const port = await getPort()
  const sup = createTrailSupervisor({dataDir: makeDataDir(), port})
  await sup.start()
  expect(sup.baseUrl).toBe(`http://127.0.0.1:${port}`)
  const res = await fetch(`${sup.baseUrl}/api/healthcheck`)
  expect(typeof res.status).toBe('number')
  await sup.stop()
})

test('self-heals when trail dies unexpectedly, and onExit fires', async () => {
  const port = await getPort()
  const sup = createTrailSupervisor({dataDir: makeDataDir(), port})
  await sup.start()
  const exited = new Promise<void>((resolve) => sup.onExit(() => resolve()))
  const pid = sup.pid
  expect(pid).toBeTypeOf('number')
  if (pid) process.kill(pid, 'SIGKILL')
  await exited
  await pWaitFor(
    () =>
      fetch(`${sup.baseUrl}/api/healthcheck`).then(
        () => true,
        () => false,
      ),
    {
      interval: 100,
      timeout: 15_000,
    },
  )
  expect(sup.pid).toBeTypeOf('number')
  await sup.stop()
})

test('gives up after the crash-restart ceiling instead of hot-looping', async () => {
  const port = await getPort()
  const sup = createTrailSupervisor({dataDir: makeDataDir(), port, crashRestarts: 0, startRetries: 0})
  await sup.start()
  const pid = sup.pid
  if (pid) process.kill(pid, 'SIGKILL')
  await pWaitFor(() => sup.pid === null, {interval: 50, timeout: 10_000})
  expect(sup.pid).toBeNull()
})
