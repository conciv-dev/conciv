import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {createTestHarness, type Kit, type TestHarness} from '@conciv/harness-testkit'
import {SETTINGS_CHANGED_EVENT} from '@conciv/protocol/settings-types'
import {requireClaude} from '../helpers/adapters.js'
import {bootKit} from '../helpers/boot.js'

type SettingsContext = {kit: Kit; harness: TestHarness; globalStateDir: string}

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function bootSettings(): Promise<SettingsContext> {
  const globalStateDir = mkdtempSync(join(tmpdir(), 'conciv-settings-home-'))
  const harness = createTestHarness(requireClaude())
  const kit = await bootKit({globalStateDir}, harness)
  cleanups.push(() => kit.cleanup())
  return {kit, harness, globalStateDir}
}

function isCustomChunk(chunk: StreamChunk, name: string): chunk is StreamChunk & {value: unknown} {
  return chunk.type === EventType.CUSTOM && 'name' in chunk && chunk.name === name
}

describe('settings (rpc over the wire, real server, real sqlite in temp dirs)', () => {
  it('get resolves the registered scheme key to its registry default with no rows anywhere', async () => {
    const {kit} = await bootSettings()
    const settings = await kit.rpc.settings.get(undefined)
    expect(settings).toEqual([{key: 'scheme', value: 'auto', source: 'default'}])
  })

  it('a project-scoped set wins over a global-scoped set for the same key', async () => {
    const {kit} = await bootSettings()
    await kit.rpc.settings.set({key: 'scheme', value: 'dark', scope: 'global'})
    await kit.rpc.settings.set({key: 'scheme', value: 'light', scope: 'project'})
    expect(await kit.rpc.settings.get(undefined)).toEqual([{key: 'scheme', value: 'light', source: 'project'}])
  })

  it('falls through to the global layer when only global carries a value', async () => {
    const {kit} = await bootSettings()
    await kit.rpc.settings.set({key: 'scheme', value: 'dark', scope: 'global'})
    expect(await kit.rpc.settings.get(undefined)).toEqual([{key: 'scheme', value: 'dark', source: 'global'}])
  })

  it('clearing the project layer lets the global value show through (apply-globally compound behavior)', async () => {
    const {kit} = await bootSettings()
    await kit.rpc.settings.set({key: 'scheme', value: 'light', scope: 'project'})
    await kit.rpc.settings.set({key: 'scheme', value: 'dark', scope: 'global'})
    expect(await kit.rpc.settings.get(undefined)).toEqual([{key: 'scheme', value: 'light', source: 'project'}])
    await kit.rpc.settings.clear({key: 'scheme', scope: 'project'})
    expect(await kit.rpc.settings.get(undefined)).toEqual([{key: 'scheme', value: 'dark', source: 'global'}])
  })

  it('clearing both layers falls through to the registry default', async () => {
    const {kit} = await bootSettings()
    await kit.rpc.settings.set({key: 'scheme', value: 'light', scope: 'project'})
    await kit.rpc.settings.set({key: 'scheme', value: 'dark', scope: 'global'})
    await kit.rpc.settings.clear({key: 'scheme', scope: 'project'})
    await kit.rpc.settings.clear({key: 'scheme', scope: 'global'})
    expect(await kit.rpc.settings.get(undefined)).toEqual([{key: 'scheme', value: 'auto', source: 'default'}])
  })

  it('an unparseable stored value at a layer is tolerated: resolution falls through as if unset', async () => {
    const {kit, globalStateDir} = await bootSettings()
    const {DatabaseSync} = await import('node:sqlite')
    const raw = new DatabaseSync(join(globalStateDir, 'conciv.db'))
    raw.exec(
      `INSERT INTO settings_log (key, value, actor, created_at) VALUES ('scheme', 'not-json{{', 'user', ${Date.now()})`,
    )
    raw.close()
    expect(await kit.rpc.settings.get(undefined)).toEqual([{key: 'scheme', value: 'auto', source: 'default'}])
  })

  it('a row for an unregistered key is tolerated and never surfaces from get', async () => {
    const {kit, globalStateDir} = await bootSettings()
    const {DatabaseSync} = await import('node:sqlite')
    const raw = new DatabaseSync(join(globalStateDir, 'conciv.db'))
    raw.exec(
      `INSERT INTO settings_log (key, value, actor, created_at) VALUES ('future-flag', '"x"', 'user', ${Date.now()})`,
    )
    raw.close()
    expect(await kit.rpc.settings.get(undefined)).toEqual([{key: 'scheme', value: 'auto', source: 'default'}])
  })

  it('set rejects a value the registry schema for the key does not accept', async () => {
    const {kit} = await bootSettings()
    await expect(kit.rpc.settings.set({key: 'scheme', value: 'neon', scope: 'project'})).rejects.toMatchObject({
      code: 'INVALID_VALUE',
    })
    expect(await kit.rpc.settings.get(undefined)).toEqual([{key: 'scheme', value: 'auto', source: 'default'}])
  })

  it('set and clear reject a key with no registry entry', async () => {
    const {kit} = await bootSettings()
    await expect(kit.rpc.settings.set({key: 'not-a-real-key', value: 'x', scope: 'project'})).rejects.toMatchObject({
      code: 'UNKNOWN_KEY',
    })
    await expect(kit.rpc.settings.clear({key: 'not-a-real-key', scope: 'project'})).rejects.toMatchObject({
      code: 'UNKNOWN_KEY',
    })
  })

  it('history returns rows from both layers, newest first, with the writing actor recorded', async () => {
    const {kit} = await bootSettings()
    await kit.rpc.settings.set({key: 'scheme', value: 'dark', scope: 'global'})
    await kit.rpc.settings.set({key: 'scheme', value: 'light', scope: 'project'})
    await kit.rpc.settings.clear({key: 'scheme', scope: 'project'})
    const history = await kit.rpc.settings.history({key: 'scheme'})
    expect(history.map((entry) => ({scope: entry.scope, value: entry.value, actor: entry.actor}))).toEqual([
      {scope: 'project', value: null, actor: 'user'},
      {scope: 'project', value: 'light', actor: 'user'},
      {scope: 'global', value: 'dark', actor: 'user'},
    ])
  })

  it('a settings write emits a settings-changed CUSTOM event on the live session stream', async () => {
    const {kit} = await bootSettings()
    const sessionId = await kit.session()
    const stream = await kit.attach(sessionId)
    await kit.rpc.settings.set({key: 'scheme', value: 'dark', scope: 'project'})
    const chunk = await stream.waitFor((c) => isCustomChunk(c, SETTINGS_CHANGED_EVENT), {hangGuardMs: 5_000})
    expect(isCustomChunk(chunk, SETTINGS_CHANGED_EVENT) && chunk.value).toEqual({key: 'scheme', scope: 'project'})
  })
})
