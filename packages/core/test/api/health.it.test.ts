import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {serveApp, type ServedApp} from '@conciv/harness-testkit'
import {HealthSchema, makeApp} from '../../src/app.js'
import {resolveConfig} from '../../src/config.js'

const dirs: string[] = []
const state = {served: undefined as ServedApp | undefined}

afterEach(async () => {
  await state.served?.close()
  state.served = undefined
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
})

async function health(): Promise<ReturnType<typeof HealthSchema.parse>> {
  const root = mkdtempSync(join(tmpdir(), 'conciv-health-it-'))
  dirs.push(root)
  const {app} = await makeApp({cfg: resolveConfig({}, root), cwd: root, openInEditor: () => {}})
  state.served = await serveApp(app.fetch)
  const response = await fetch(`${state.served.base}/health`)
  return HealthSchema.parse(await response.json())
}

describe('engine health (IT, real http)', () => {
  it('reports the packages it loaded and that they still match the code on disk', async () => {
    const body = await health()

    expect(body.ok).toBe(true)
    expect(body.engine.stale).toBe(false)
    expect(body.engine.changed).toEqual([])
    expect(body.engine.tracked).toContain('@conciv/core')
  })
})
