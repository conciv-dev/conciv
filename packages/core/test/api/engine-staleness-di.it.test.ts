import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import type {EngineStaleness} from '@conciv/contract'
import {makeRpcClient, serveApp, type ServedApp} from '@conciv/harness-testkit'
import {HealthSchema, makeApp} from '../../src/app.js'
import {resolveConfig} from '../../src/config.js'

const dirs: string[] = []
const state = {served: undefined as ServedApp | undefined, dispose: undefined as (() => Promise<void>) | undefined}

const INJECTED: EngineStaleness = {
  stale: true,
  changed: ['@conciv/injected-probe'],
  tracked: ['@conciv/injected-probe', '@conciv/core'],
  bootedAt: 1_700_000_000_000,
  fingerprint: 'injected1234',
}

const INITIALIZE = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'staleness-di-test', version: '0'}},
})

afterEach(async () => {
  await state.served?.close()
  await state.dispose?.()
  state.served = undefined
  state.dispose = undefined
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
})

async function serveWithProbe(staleness: () => EngineStaleness): Promise<ServedApp> {
  const root = mkdtempSync(join(tmpdir(), 'conciv-staleness-di-'))
  dirs.push(root)
  const {app, dispose} = await makeApp({cfg: resolveConfig({}, root), cwd: root, openInEditor: () => {}, staleness})
  state.dispose = dispose
  const served = await serveApp(app.fetch)
  state.served = served
  return served
}

describe('engine staleness dependency injection (IT, real http)', () => {
  it('reports the injected probe consistently on /health, rpc meta.engine and the mcp instructions', async () => {
    const calls = {count: 0}
    const served = await serveWithProbe(() => {
      calls.count += 1
      return INJECTED
    })

    const health = HealthSchema.parse(await (await fetch(`${served.base}/health`)).json())
    const engine = await makeRpcClient(served.base).meta.engine()
    const mcp = await fetch(`${served.base}/api/mcp`, {
      method: 'POST',
      headers: {'content-type': 'application/json', accept: 'application/json, text/event-stream'},
      body: INITIALIZE,
    })
    const instructions = await mcp.text()

    expect(health.engine).toEqual(INJECTED)
    expect(engine).toEqual(INJECTED)
    expect(instructions).toContain('@conciv/injected-probe')
    expect(calls.count).toBeGreaterThanOrEqual(3)
  }, 20_000)

  it('defaults to the real engine stamp when no probe is injected', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-staleness-default-'))
    dirs.push(root)
    const {app, dispose} = await makeApp({cfg: resolveConfig({}, root), cwd: root, openInEditor: () => {}})
    state.dispose = dispose
    const served = await serveApp(app.fetch)
    state.served = served

    const health = HealthSchema.parse(await (await fetch(`${served.base}/health`)).json())
    const engine = await makeRpcClient(served.base).meta.engine()

    expect(health.engine.tracked).toContain('@conciv/core')
    expect(engine.fingerprint).toBe(health.engine.fingerprint)
    expect(engine.stale).toBe(false)
  }, 20_000)
})
