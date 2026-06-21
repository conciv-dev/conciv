import {mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, expect, test} from 'vitest'
import type {Engine} from '@mandarax/core/engine'
import {makeEngineBooter} from '../src/core/boot.js'

const dirs: string[] = []
const engines: Engine[] = []

afterEach(async () => {
  for (const engine of engines.splice(0)) await engine.stop()
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
})

function tempProject(): {root: string; marker: string} {
  const root = mkdtempSync(join(tmpdir(), 'mx-boot-'))
  dirs.push(root)
  const extDir = join(root, 'mandarax', 'extensions')
  mkdirSync(extDir, {recursive: true})
  const marker = join(root, 'session-start.marker')
  writeFileSync(
    join(extDir, 'boot-probe.ts'),
    `export default {\n` +
      `  id: 'boot-probe',\n` +
      `  serverFn(mx) {\n` +
      `    mx.on('session_start', async (ctx) => {\n` +
      `      const {writeFileSync} = await import('node:fs')\n` +
      `      writeFileSync(${JSON.stringify(marker)}, ctx.sessionId || 'fired')\n` +
      `    })\n` +
      `  },\n` +
      `}\n`,
  )
  return {root, marker}
}

async function boot(root: string): Promise<Engine> {
  const engine = await makeEngineBooter({stateRoot: root, harnessBin: 'true'}, root)()
  engines.push(engine)
  return engine
}

test('boot wires the trail proxy so the Record API answers through core', async () => {
  const {root} = tempProject()
  const engine = await boot(root)
  const res = await fetch(`http://127.0.0.1:${engine.port}/api/records/v1/canvas_snapshots`)
  const body = (await res.json()) as {records: unknown[]}
  expect(res.status).toBe(200)
  expect(body.records).toEqual([])
})

test('boot serves the sync relay over WebSocket', async () => {
  const {root} = tempProject()
  const engine = await boot(root)
  const ws = new WebSocket(`ws://127.0.0.1:${engine.port}/api/sync/preview:session`)
  const opened = await new Promise<boolean>((resolve) => {
    ws.onopen = () => resolve(true)
    ws.onerror = () => resolve(false)
  })
  ws.close()
  expect(opened).toBe(true)
})

test('boot fires session_start to extension event handlers', async () => {
  const {root, marker} = tempProject()
  await boot(root)
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(existsSync(marker)).toBe(true)
})
