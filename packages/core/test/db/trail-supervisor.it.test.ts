import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
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
  expect(sup.baseUrl).toBe(`http://localhost:${port}`)
  const res = await fetch(`${sup.baseUrl}/api/healthcheck`)
  expect(typeof res.status).toBe('number')
  await sup.stop()
})

test('onExit fires when trail dies and start recovers', async () => {
  const port = await getPort()
  const sup = createTrailSupervisor({dataDir: makeDataDir(), port})
  await sup.start()
  const exited = new Promise<void>((resolve) => sup.onExit(() => resolve()))
  const pid = sup.pid
  expect(pid).toBeTypeOf('number')
  if (pid) process.kill(pid, 'SIGKILL')
  await exited
  await sup.start()
  const res = await fetch(`${sup.baseUrl}/api/healthcheck`)
  expect(typeof res.status).toBe('number')
  await sup.stop()
})
