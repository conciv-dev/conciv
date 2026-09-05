import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {until, type Kit} from '@conciv/harness-testkit'
import {
  SETTINGS_CHANGED_EVENT,
  SettingsChangedPayloadSchema,
  type SettingsChangedPayload,
  type SettingsScope,
} from '@conciv/protocol/settings-types'
import {bootKit} from '../helpers/boot.js'

const SCHEME = 'appearance.scheme'

type SettingsContext = {
  kit: Kit
  home: string
  projectDir: string
  projectFile: string
  projectJsonFile: string
  globalFile: string
}

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).toReversed()) await cleanup()
})

function makeHome(): string {
  return mkdtempSync(join(tmpdir(), 'conciv-settings-home-'))
}

async function bootSettings(home: string = makeHome()): Promise<SettingsContext> {
  const kit = await bootKit({globalSettingsDir: home})
  cleanups.push(() => kit.cleanup())
  const projectDir = join(kit.stateRoot, '.conciv')
  return {
    kit,
    home,
    projectDir,
    projectFile: join(projectDir, 'settings.jsonc'),
    projectJsonFile: join(projectDir, 'settings.json'),
    globalFile: join(home, 'settings.jsonc'),
  }
}

function isSettingsChanged(chunk: StreamChunk): boolean {
  return chunk.type === EventType.CUSTOM && 'name' in chunk && chunk.name === SETTINGS_CHANGED_EVENT
}

async function pump(source: AsyncIterable<StreamChunk>, sink: SettingsChangedPayload[]): Promise<void> {
  for await (const chunk of source) {
    if (!isSettingsChanged(chunk)) continue
    if (!('value' in chunk)) continue
    const parsed = SettingsChangedPayloadSchema.safeParse(chunk.value)
    if (parsed.success) sink.push(parsed.data)
  }
}

async function watchEvents(kit: Kit): Promise<SettingsChangedPayload[]> {
  const abort = new AbortController()
  cleanups.push(async () => abort.abort())
  const sessionId = await kit.session()
  const iterator = await kit.rpc.chat.subscribe({sessionId}, {signal: abort.signal})
  const events: SettingsChangedPayload[] = []
  void pump(iterator, events).catch(() => {})
  return events
}

async function revisionOf(kit: Kit, scope: SettingsScope): Promise<string> {
  return (await kit.rpc.settings.get(undefined)).layers[scope].revision
}

async function setSetting(kit: Kit, value: unknown, scope: SettingsScope, key: string = SCHEME): Promise<void> {
  await kit.rpc.settings.set({key, value, scope, expectedRevision: await revisionOf(kit, scope)})
}

async function clearSetting(kit: Kit, scope: SettingsScope, key: string = SCHEME): Promise<void> {
  await kit.rpc.settings.clear({key, scope, expectedRevision: await revisionOf(kit, scope)})
}

async function resetSetting(kit: Kit, key: string = SCHEME): Promise<{ok: true; opId: string}> {
  const before = await kit.rpc.settings.get(undefined)
  return kit.rpc.settings.reset({
    key,
    expectedRevisions: {project: before.layers.project.revision, global: before.layers.global.revision},
  })
}

async function schemeView(kit: Kit) {
  const read = await kit.rpc.settings.get(undefined)
  const view = read.keys.find((entry) => entry.key === SCHEME)
  if (!view) throw new Error(`the settings read carried no "${SCHEME}" key`)
  return view
}

function writeFile(path: string, text: string): void {
  mkdirSync(join(path, '..'), {recursive: true})
  writeFileSync(path, text)
}

describe('settings (rpc over the wire, real server, real files in temp dirs)', () => {
  it('resolves every registered key to its registry default when no settings file exists', async () => {
    const {kit} = await bootSettings()
    const view = await schemeView(kit)
    expect({value: view.value, source: view.source, layers: view.layers}).toEqual({
      value: 'auto',
      source: 'default',
      layers: {project: {state: 'absent', value: undefined}, global: {state: 'absent', value: undefined}},
    })
  })

  it('lets the project layer win over the global layer and reports both raw values', async () => {
    const {kit} = await bootSettings()
    await setSetting(kit, 'dark', 'global')
    await setSetting(kit, 'light', 'project')
    const view = await schemeView(kit)
    expect({value: view.value, source: view.source}).toEqual({value: 'light', source: 'project'})
    expect(view.layers).toEqual({
      project: {state: 'valid', value: 'light'},
      global: {state: 'valid', value: 'dark'},
    })
  })

  it('falls through to the global layer, then to the default, as each layer is cleared', async () => {
    const {kit} = await bootSettings()
    await setSetting(kit, 'dark', 'global')
    await setSetting(kit, 'light', 'project')
    await clearSetting(kit, 'project')
    expect((await schemeView(kit)).source).toBe('global')
    expect((await schemeView(kit)).value).toBe('dark')
    await clearSetting(kit, 'global')
    expect((await schemeView(kit)).source).toBe('default')
    expect((await schemeView(kit)).value).toBe('auto')
  })

  it('never writes a default to disk and removes an emptied namespace on clear', async () => {
    const {kit, projectFile} = await bootSettings()
    await setSetting(kit, 'dark', 'project')
    await clearSetting(kit, 'project')
    expect(readFileSync(projectFile, 'utf8')).not.toContain('appearance')
  })

  it('preserves keys it does not understand through a programmatic write to a different key', async () => {
    const {kit, projectFile} = await bootSettings()
    writeFile(projectFile, '{"future": {"flag": 7}, "appearance": {"scheme": "light"}}')
    await setSetting(kit, 'dark', 'project')
    const onDisk: unknown = JSON.parse(readFileSync(projectFile, 'utf8'))
    expect(onDisk).toEqual({future: {flag: 7}, appearance: {scheme: 'dark'}})
    await clearSetting(kit, 'project')
    expect(JSON.parse(readFileSync(projectFile, 'utf8'))).toEqual({future: {flag: 7}})
  })

  it('reports a stored value that fails the registry schema as invalid and resolves past it', async () => {
    const {kit, projectFile, globalFile} = await bootSettings()
    writeFile(globalFile, '{"appearance": {"scheme": "dark"}}')
    writeFile(projectFile, '{"appearance": {"scheme": "neon"}}')
    const view = await schemeView(kit)
    expect(view.layers.project).toEqual({state: 'invalid', value: 'neon'})
    expect({value: view.value, source: view.source}).toEqual({value: 'dark', source: 'global'})
  })

  it('serves the last known good values and refuses writes while a settings file does not parse', async () => {
    const {kit, projectFile} = await bootSettings()
    await setSetting(kit, 'light', 'project')
    const revision = await revisionOf(kit, 'project')
    writeFile(projectFile, '{ this is not json ')
    const read = await kit.rpc.settings.get(undefined)
    expect(read.layers.project.parseError).toEqual(expect.any(String))
    expect((await schemeView(kit)).value).toBe('light')
    await expect(
      kit.rpc.settings.set({key: SCHEME, value: 'dark', scope: 'project', expectedRevision: revision}),
    ).rejects.toMatchObject({code: 'LAYER_UNPARSEABLE'})
    expect(readFileSync(projectFile, 'utf8')).toBe('{ this is not json ')
  })

  it('keeps hand written comments and formatting across a set and a clear', async () => {
    const {kit, projectFile} = await bootSettings()
    writeFile(
      projectFile,
      '// conciv settings for this project\n{\n  /* pinned by hand */\n  "appearance": {"scheme": "light"},\n  "future": {"flag": 1}\n  // trailing note\n}\n',
    )
    await setSetting(kit, 'dark', 'project')
    const afterSet = readFileSync(projectFile, 'utf8')
    expect(afterSet).toContain('// conciv settings for this project')
    expect(afterSet).toContain('/* pinned by hand */')
    expect(afterSet).toContain('// trailing note')
    await clearSetting(kit, 'project')
    const afterClear = readFileSync(projectFile, 'utf8')
    expect(afterClear).toContain('// conciv settings for this project')
    expect(afterClear).toContain('// trailing note')
  })

  it('creates settings.jsonc on the first write when neither settings file exists', async () => {
    const {kit, projectFile, projectJsonFile} = await bootSettings()
    await setSetting(kit, 'dark', 'project')
    expect(existsSync(projectFile)).toBe(true)
    expect(existsSync(projectJsonFile)).toBe(false)
    expect((await kit.rpc.settings.get(undefined)).layers.project.format).toBe('jsonc')
  })

  it('honors settings.jsonc over settings.json and surfaces a warning when both exist', async () => {
    const {kit, projectFile, projectJsonFile} = await bootSettings()
    writeFile(projectJsonFile, '{"appearance": {"scheme": "light"}}')
    writeFile(projectFile, '{"appearance": {"scheme": "dark"}}')
    const read = await kit.rpc.settings.get(undefined)
    expect(read.layers.project.format).toBe('jsonc')
    expect(read.layers.project.path).toBe(projectFile)
    expect(read.layers.project.warning).toEqual(expect.any(String))
    expect((await schemeView(kit)).value).toBe('dark')
  })

  it('reads a plain settings.json when no jsonc file is present', async () => {
    const {kit, projectJsonFile} = await bootSettings()
    writeFile(projectJsonFile, '{"appearance": {"scheme": "light"}}')
    const read = await kit.rpc.settings.get(undefined)
    expect(read.layers.project.format).toBe('json')
    expect(read.layers.project.warning).toBeNull()
    expect((await schemeView(kit)).value).toBe('light')
  })

  it('treats a comment in settings.json as malformed rather than reinterpreting it as jsonc', async () => {
    const {kit, projectJsonFile} = await bootSettings()
    writeFile(projectJsonFile, '{\n  // not allowed here\n  "appearance": {"scheme": "dark"}\n}\n')
    const read = await kit.rpc.settings.get(undefined)
    expect(read.layers.project.format).toBe('json')
    expect(read.layers.project.parseError).toEqual(expect.any(String))
    expect((await schemeView(kit)).value).toBe('auto')
    await expect(
      kit.rpc.settings.set({
        key: SCHEME,
        value: 'light',
        scope: 'project',
        expectedRevision: read.layers.project.revision,
      }),
    ).rejects.toMatchObject({code: 'LAYER_UNPARSEABLE'})
  })

  it('keeps hand written comments in settings.jsonc across a set, a clear and an applyGlobally', async () => {
    const {kit, projectFile} = await bootSettings()
    writeFile(
      projectFile,
      '// conciv settings for this project\n{\n  "appearance": {"scheme": "light"},\n  "future": {"flag": 1}\n  // trailing note\n}\n',
    )
    await setSetting(kit, 'dark', 'project')
    expect(readFileSync(projectFile, 'utf8')).toContain('// conciv settings for this project')
    expect(readFileSync(projectFile, 'utf8')).toContain('// trailing note')
    const before = await kit.rpc.settings.get(undefined)
    await kit.rpc.settings.applyGlobally({
      key: SCHEME,
      value: 'light',
      expectedRevisions: {project: before.layers.project.revision, global: before.layers.global.revision},
    })
    const afterApply = readFileSync(projectFile, 'utf8')
    expect(afterApply).toContain('// conciv settings for this project')
    expect(afterApply).toContain('// trailing note')
    expect(afterApply).not.toContain('appearance')
  })

  it('replaces the settings file atomically, leaving no partial content or temp files behind', async () => {
    const {kit, projectFile} = await bootSettings()
    const dir = join(projectFile, '..')
    const observed: string[] = []
    const reader = {stop: false}
    async function readWhileWriting(): Promise<void> {
      while (!reader.stop) {
        try {
          observed.push(readFileSync(projectFile, 'utf8'))
        } catch {
          observed.push('{}')
        }
        await new Promise((resolve) => setTimeout(resolve, 1))
      }
    }
    const reading = readWhileWriting()
    for (const value of ['dark', 'light', 'auto', 'dark', 'light']) await setSetting(kit, value, 'project')
    reader.stop = true
    await reading
    for (const text of observed) expect(() => JSON.parse(text)).not.toThrow()
    expect(readdirSync(dir).filter((name) => name.includes('.tmp'))).toEqual([])
  })

  it('emits exactly one settings-changed event for one server write', async () => {
    const {kit} = await bootSettings()
    const events = await watchEvents(kit)
    await setSetting(kit, 'dark', 'project')
    await until(() => events.length >= 1)
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(events.filter((event) => event.keys.includes(SCHEME))).toHaveLength(1)
  })

  it('notices an external hand edit, emits the change and records it with the file actor', async () => {
    const {kit, projectFile} = await bootSettings()
    const events = await watchEvents(kit)
    writeFile(projectFile, '{"appearance": {"scheme": "dark"}}')
    await until(() => events.length >= 1, {hangGuardMs: 8000})
    expect((await schemeView(kit)).value).toBe('dark')
    await until(async () => (await kit.rpc.settings.history({key: SCHEME})).some((entry) => entry.actor === 'file'), {
      hangGuardMs: 8000,
    })
    const entry = (await kit.rpc.settings.history({key: SCHEME})).find((line) => line.actor === 'file')
    expect(entry).toMatchObject({scope: 'project', key: SCHEME, to: 'dark'})
  })

  it('records a history line per user write, carrying the actor and an operation id', async () => {
    const {kit} = await bootSettings()
    await setSetting(kit, 'dark', 'project')
    await setSetting(kit, 'light', 'project')
    await clearSetting(kit, 'project')
    const history = await kit.rpc.settings.history({key: SCHEME})
    expect(history.map((entry) => ({actor: entry.actor, scope: entry.scope, from: entry.from, to: entry.to}))).toEqual([
      {actor: 'user', scope: 'project', from: 'light', to: undefined},
      {actor: 'user', scope: 'project', from: 'dark', to: 'light'},
      {actor: 'user', scope: 'project', from: undefined, to: 'dark'},
    ])
    expect(new Set(history.map((entry) => entry.opId)).size).toBe(3)
  })

  it('rejects a write whose expected revision is stale', async () => {
    const {kit} = await bootSettings()
    const stale = await revisionOf(kit, 'project')
    await setSetting(kit, 'dark', 'project')
    await expect(
      kit.rpc.settings.set({key: SCHEME, value: 'light', scope: 'project', expectedRevision: stale}),
    ).rejects.toMatchObject({code: 'REVISION_CONFLICT'})
    expect((await schemeView(kit)).value).toBe('dark')
  })

  it('applies a value to every project in one operation: global written, project override gone', async () => {
    const {kit} = await bootSettings()
    const events = await watchEvents(kit)
    await setSetting(kit, 'light', 'project')
    const before = await kit.rpc.settings.get(undefined)
    const seen = events.length
    const result = await kit.rpc.settings.applyGlobally({
      key: SCHEME,
      value: 'dark',
      expectedRevisions: {project: before.layers.project.revision, global: before.layers.global.revision},
    })
    const view = await schemeView(kit)
    expect({value: view.value, source: view.source, layers: view.layers}).toEqual({
      value: 'dark',
      source: 'global',
      layers: {project: {state: 'absent', value: undefined}, global: {state: 'valid', value: 'dark'}},
    })
    await until(() => events.length > seen)
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(events.slice(seen)).toHaveLength(1)
    const shared = (await kit.rpc.settings.history({key: SCHEME})).filter((entry) => entry.opId === result.opId)
    expect(shared.map((entry) => entry.scope).toSorted()).toEqual(['global', 'project'])
  })

  it('resets a key from both layers in one operation, emitting a single event and one history row per layer', async () => {
    const {kit} = await bootSettings()
    await setSetting(kit, 'light', 'project')
    await setSetting(kit, 'dark', 'global')
    const events = await watchEvents(kit)
    const seen = events.length
    const result = await resetSetting(kit)
    const view = await schemeView(kit)
    expect({value: view.value, source: view.source, layers: view.layers}).toEqual({
      value: 'auto',
      source: 'default',
      layers: {project: {state: 'absent', value: undefined}, global: {state: 'absent', value: undefined}},
    })
    await until(() => events.length > seen)
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(events.slice(seen)).toHaveLength(1)
    const shared = (await kit.rpc.settings.history({key: SCHEME})).filter((entry) => entry.opId === result.opId)
    expect(
      shared
        .map((entry) => ({scope: entry.scope, from: entry.from, to: entry.to}))
        .toSorted((a, b) => a.scope.localeCompare(b.scope)),
    ).toEqual([
      {scope: 'global', from: 'dark', to: undefined},
      {scope: 'project', from: 'light', to: undefined},
    ])
  })

  it('no-ops the layer that has no value for the key during a reset, with no history row for it', async () => {
    const {kit} = await bootSettings()
    await setSetting(kit, 'light', 'project')
    const before = await kit.rpc.settings.get(undefined)
    const result = await resetSetting(kit)
    const view = await schemeView(kit)
    expect(view.layers).toEqual({
      project: {state: 'absent', value: undefined},
      global: {state: 'absent', value: undefined},
    })
    expect((await kit.rpc.settings.get(undefined)).layers.global.revision).toBe(before.layers.global.revision)
    const shared = (await kit.rpc.settings.history({key: SCHEME})).filter((entry) => entry.opId === result.opId)
    expect(shared.map((entry) => entry.scope)).toEqual(['project'])
  })

  it('rejects a reset whose expected revision is stale and leaves both layers untouched', async () => {
    const {kit} = await bootSettings()
    const staleProject = await revisionOf(kit, 'project')
    await setSetting(kit, 'dark', 'project')
    const global = await revisionOf(kit, 'global')
    await expect(
      kit.rpc.settings.reset({key: SCHEME, expectedRevisions: {project: staleProject, global}}),
    ).rejects.toMatchObject({code: 'REVISION_CONFLICT'})
    expect((await schemeView(kit)).value).toBe('dark')
  })

  it('refuses a reset while a settings file does not parse, preserving last known good content', async () => {
    const {kit, projectFile} = await bootSettings()
    await setSetting(kit, 'light', 'project')
    writeFile(projectFile, '{ this is not json ')
    const read = await kit.rpc.settings.get(undefined)
    await expect(
      kit.rpc.settings.reset({
        key: SCHEME,
        expectedRevisions: {project: read.layers.project.revision, global: read.layers.global.revision},
      }),
    ).rejects.toMatchObject({code: 'LAYER_UNPARSEABLE'})
    expect(readFileSync(projectFile, 'utf8')).toBe('{ this is not json ')
  })

  it('keeps hand written comments and formatting in a jsonc layer across a reset', async () => {
    const {kit, projectFile} = await bootSettings()
    writeFile(
      projectFile,
      '// conciv settings for this project\n{\n  "appearance": {"scheme": "light"},\n  "future": {"flag": 1}\n  // trailing note\n}\n',
    )
    await resetSetting(kit)
    const afterReset = readFileSync(projectFile, 'utf8')
    expect(afterReset).toContain('// conciv settings for this project')
    expect(afterReset).toContain('// trailing note')
    expect(afterReset).not.toContain('appearance')
  })

  it('rejects a value the registry schema does not accept and leaves the file untouched', async () => {
    const {kit, projectFile} = await bootSettings()
    await setSetting(kit, 'dark', 'project')
    const before = readFileSync(projectFile, 'utf8')
    await expect(
      kit.rpc.settings.set({
        key: SCHEME,
        value: 'neon',
        scope: 'project',
        expectedRevision: await revisionOf(kit, 'project'),
      }),
    ).rejects.toMatchObject({code: 'INVALID_VALUE'})
    expect(readFileSync(projectFile, 'utf8')).toBe(before)
  })

  it('rejects a key with no registry entry', async () => {
    const {kit} = await bootSettings()
    const revision = await revisionOf(kit, 'project')
    await expect(
      kit.rpc.settings.set({key: 'nope.nope', value: 'x', scope: 'project', expectedRevision: revision}),
    ).rejects.toMatchObject({code: 'UNKNOWN_KEY'})
    await expect(
      kit.rpc.settings.clear({key: 'nope.nope', scope: 'project', expectedRevision: revision}),
    ).rejects.toMatchObject({code: 'UNKNOWN_KEY'})
  })

  it('keeps two servers sharing one global settings file from losing each others writes', async () => {
    const home = makeHome()
    const first = await bootSettings(home)
    const second = await bootSettings(home)
    writeFile(first.globalFile, '{"future": {"flag": 3}}')
    const attempts = await Promise.allSettled([
      setSetting(first.kit, 'dark', 'global'),
      setSetting(second.kit, 'light', 'global'),
    ])
    expect(attempts.some((attempt) => attempt.status === 'fulfilled')).toBe(true)
    const onDisk: unknown = JSON.parse(readFileSync(first.globalFile, 'utf8'))
    expect(onDisk).toMatchObject({future: {flag: 3}})
    expect(['dark', 'light']).toContain((await schemeView(first.kit)).layers.global.value)
  })

  it('writes through a symlinked settings file instead of replacing the link', async () => {
    const {kit, projectFile} = await bootSettings()
    const store = mkdtempSync(join(tmpdir(), 'conciv-settings-store-'))
    const real = join(store, 'shared-settings.json')
    writeFileSync(real, '{"appearance": {"scheme": "light"}}')
    mkdirSync(join(projectFile, '..'), {recursive: true})
    symlinkSync(real, projectFile)
    await setSetting(kit, 'dark', 'project')
    expect(JSON.parse(readFileSync(real, 'utf8'))).toEqual({appearance: {scheme: 'dark'}})
    expect(statSync(projectFile).isSymbolicLink).toBeDefined()
    expect(JSON.parse(readFileSync(projectFile, 'utf8'))).toEqual({appearance: {scheme: 'dark'}})
  })

  it('preserves the permissions of an existing settings file across a write', async () => {
    const {kit, projectFile} = await bootSettings()
    writeFile(projectFile, '{"appearance": {"scheme": "light"}}')
    chmodSync(projectFile, 0o640)
    await setSetting(kit, 'dark', 'project')
    expect(statSync(projectFile).mode & 0o777).toBe(0o640)
  })
})
