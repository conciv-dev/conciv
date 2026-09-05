import {randomUUID} from 'node:crypto'
import {join} from 'node:path'
import {
  SETTINGS_SCOPES,
  type SettingsActor,
  type SettingsChangedPayload,
  type SettingsEntry,
  type SettingsHistoryEntry,
  type SettingsKeyView,
  type SettingsLayerValue,
  type SettingsRead,
  type SettingsRegistry,
  type SettingsScope,
  type SettingsSource,
} from '@conciv/protocol/settings-types'
import {appendHistory, readHistory} from './history.js'
import {isLockContention, withDirectoryLock} from './lock.js'
import {
  EMPTY_REVISION,
  JSONC_FILE,
  readLayer,
  watchLayers,
  writeLayer,
  type LayerEdit,
  type LayerSnapshot,
} from './layer-store.js'

const HISTORY_FILE = 'settings-audit.jsonl'
const WATCH_DEBOUNCE_MS = 60

export type SettingsWriteFailure =
  | {kind: 'unknown-key'}
  | {kind: 'invalid-value'}
  | {kind: 'revision-conflict'; scope: SettingsScope; revision: string}
  | {kind: 'unparseable'; scope: SettingsScope}
  | {kind: 'lock-timeout'}

export type SettingsWriteOutcome = {ok: true; opId: string} | {ok: false; failure: SettingsWriteFailure}

export type SettingsServiceDeps = {
  projectStateDir: string
  globalStateDir: string
  registry: SettingsRegistry
  notify: (payload: SettingsChangedPayload) => void
}

export type SettingsService = {
  read: () => Promise<SettingsRead>
  set: (input: {
    key: string
    value: unknown
    scope: SettingsScope
    expectedRevision: string
    actor: SettingsActor
  }) => Promise<SettingsWriteOutcome>
  clear: (input: {
    key: string
    scope: SettingsScope
    expectedRevision: string
    actor: SettingsActor
  }) => Promise<SettingsWriteOutcome>
  applyGlobally: (input: {
    key: string
    value: unknown
    expectedRevisions: Record<SettingsScope, string>
    actor: SettingsActor
  }) => Promise<SettingsWriteOutcome>
  reset: (input: {
    key: string
    expectedRevisions: Record<SettingsScope, string>
    actor: SettingsActor
  }) => Promise<SettingsWriteOutcome>
  history: (key: string) => SettingsHistoryEntry[]
  dispose: () => void
}

type Change = {scope: SettingsScope; key: string; from: unknown; to: unknown}
type LayerWrite = {scope: SettingsScope; value: unknown}

function makeSerialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  const chain: {tail: Promise<unknown>} = {tail: Promise.resolve()}
  return (task) => {
    const run = chain.tail.then(task, task)
    chain.tail = run.catch(() => undefined)
    return run
  }
}

function rawValueOf(snapshot: LayerSnapshot, entry: SettingsEntry): unknown {
  const namespace = snapshot.data?.[entry.namespace]
  if (typeof namespace !== 'object' || namespace === null || Array.isArray(namespace)) return undefined
  const values: Record<string, unknown> = {...namespace}
  return values[entry.name]
}

function layerValueOf(snapshot: LayerSnapshot, entry: SettingsEntry): SettingsLayerValue {
  const raw = rawValueOf(snapshot, entry)
  if (raw === undefined) return {state: 'absent', value: undefined}
  const parsed = entry.schema.safeParse(raw)
  return parsed.success ? {state: 'valid', value: parsed.data} : {state: 'invalid', value: raw}
}

function sourceOf(project: SettingsLayerValue, global: SettingsLayerValue): SettingsSource {
  if (project.state === 'valid') return 'project'
  if (global.state === 'valid') return 'global'
  return 'default'
}

function namespaceKeys(snapshot: LayerSnapshot, namespace: string): string[] {
  const held = snapshot.data?.[namespace]
  if (typeof held !== 'object' || held === null || Array.isArray(held)) return []
  return Object.keys(held)
}

function planEdits(snapshot: LayerSnapshot, entry: SettingsEntry, value: unknown): LayerEdit[] {
  if (value !== undefined) return [{keyPath: [entry.namespace, entry.name], value}]
  const remaining = namespaceKeys(snapshot, entry.namespace).filter((name) => name !== entry.name)
  if (remaining.length > 0) return [{keyPath: [entry.namespace, entry.name], value: undefined}]
  return [{keyPath: [entry.namespace], value: undefined}]
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)]
}

export function makeSettingsService(deps: SettingsServiceDeps): SettingsService {
  const directories: Record<SettingsScope, string> = {
    project: deps.projectStateDir,
    global: deps.globalStateDir,
  }
  const historyPath = (scope: SettingsScope): string => join(directories[scope], HISTORY_FILE)
  const emptySnapshot = (scope: SettingsScope): LayerSnapshot => ({
    path: join(directories[scope], JSONC_FILE),
    format: 'absent',
    text: '',
    revision: EMPTY_REVISION,
    data: {},
    parseError: null,
    warning: null,
  })

  const layers: Record<SettingsScope, LayerSnapshot> = {
    project: emptySnapshot('project'),
    global: emptySnapshot('global'),
  }
  const enqueue = makeSerialQueue()

  async function refresh(scope: SettingsScope): Promise<LayerSnapshot> {
    const next = await readLayer(directories[scope])
    const applied = next.parseError === null ? next : {...next, data: layers[scope].data}
    layers[scope] = applied
    return applied
  }

  function viewOf(entry: SettingsEntry): SettingsKeyView {
    const project = layerValueOf(layers.project, entry)
    const global = layerValueOf(layers.global, entry)
    const source = sourceOf(project, global)
    const value = source === 'project' ? project.value : source === 'global' ? global.value : entry.fallback
    return {
      key: entry.key,
      namespace: entry.namespace,
      label: entry.label,
      description: entry.description,
      value,
      source,
      layers: {project, global},
    }
  }

  function statusOf(scope: SettingsScope) {
    const snapshot = layers[scope]
    return {
      path: snapshot.path,
      format: snapshot.format,
      revision: snapshot.revision,
      parseError: snapshot.parseError,
      warning: snapshot.warning,
    }
  }

  async function read(): Promise<SettingsRead> {
    for (const scope of SETTINGS_SCOPES) await refresh(scope)
    return {
      keys: deps.registry.entries.map(viewOf),
      layers: {project: statusOf('project'), global: statusOf('global')},
    }
  }

  async function guard(scope: SettingsScope, expectedRevision: string): Promise<SettingsWriteFailure | null> {
    const snapshot = await refresh(scope)
    if (snapshot.parseError !== null) return {kind: 'unparseable', scope}
    if (snapshot.revision !== expectedRevision) return {kind: 'revision-conflict', scope, revision: snapshot.revision}
    return null
  }

  async function persist(
    scope: SettingsScope,
    entry: SettingsEntry,
    value: unknown,
    actor: SettingsActor,
    opId: string,
  ): Promise<Change | null> {
    const snapshot = layers[scope]
    const from = rawValueOf(snapshot, entry)
    if (from === undefined && value === undefined) return null
    layers[scope] = await writeLayer(directories[scope], snapshot, planEdits(snapshot, entry, value))
    const change: Change = {scope, key: entry.key, from, to: value}
    appendHistory(historyPath(scope), {ts: Date.now(), actor, opId, ...change})
    return change
  }

  function announce(changes: readonly Change[], opId: string): void {
    if (changes.length === 0) return
    deps.notify({
      opId,
      keys: uniqueStrings(changes.map((change) => change.key)),
      scopes: SETTINGS_SCOPES.filter((scope) => changes.some((change) => change.scope === scope)),
    })
  }

  function validate(key: string, value: unknown): SettingsEntry | SettingsWriteFailure {
    const entry = deps.registry.entry(key)
    if (entry === undefined) return {kind: 'unknown-key'}
    if (value === undefined) return entry
    return entry.schema.safeParse(value).success ? entry : {kind: 'invalid-value'}
  }

  function isFailure(candidate: SettingsEntry | SettingsWriteFailure): candidate is SettingsWriteFailure {
    return 'kind' in candidate
  }

  async function underScopeLock<T>(scope: SettingsScope, run: () => Promise<T>): Promise<T | SettingsWriteOutcome> {
    if (scope === 'project') return run()
    try {
      return await withDirectoryLock(directories.global, run)
    } catch (error) {
      if (isLockContention(error)) return {ok: false, failure: {kind: 'lock-timeout'}}
      throw error
    }
  }

  async function writeOne(
    entry: SettingsEntry,
    scope: SettingsScope,
    value: unknown,
    expectedRevision: string,
    actor: SettingsActor,
  ): Promise<SettingsWriteOutcome> {
    const blocked = await guard(scope, expectedRevision)
    if (blocked !== null) return {ok: false, failure: blocked}
    const opId = randomUUID()
    const change = await persist(scope, entry, value, actor, opId)
    announce(change === null ? [] : [change], opId)
    return {ok: true, opId}
  }

  function mutate(
    key: string,
    value: unknown,
    scope: SettingsScope,
    expectedRevision: string,
    actor: SettingsActor,
  ): Promise<SettingsWriteOutcome> {
    return enqueue(async () => {
      const entry = validate(key, value)
      if (isFailure(entry)) return {ok: false, failure: entry}
      const outcome = await underScopeLock(scope, async () => writeOne(entry, scope, value, expectedRevision, actor))
      return outcome
    })
  }

  async function writeAcrossLayers(
    entry: SettingsEntry,
    writes: readonly LayerWrite[],
    expectedRevisions: Record<SettingsScope, string>,
    actor: SettingsActor,
  ): Promise<SettingsWriteOutcome> {
    return underScopeLock('global', async () => {
      const blockedGlobal = await guard('global', expectedRevisions.global)
      if (blockedGlobal !== null) return {ok: false, failure: blockedGlobal}
      const blockedProject = await guard('project', expectedRevisions.project)
      if (blockedProject !== null) return {ok: false, failure: blockedProject}
      const opId = randomUUID()
      const changes: Change[] = []
      for (const write of writes) {
        const change = await persist(write.scope, entry, write.value, actor, opId)
        if (change !== null) changes.push(change)
      }
      announce(changes, opId)
      return {ok: true, opId}
    })
  }

  void enqueue(async () => {
    for (const scope of SETTINGS_SCOPES) await refresh(scope)
  })

  return {
    read,
    set: (input) => mutate(input.key, input.value, input.scope, input.expectedRevision, input.actor),
    clear: (input) => mutate(input.key, undefined, input.scope, input.expectedRevision, input.actor),
    applyGlobally: (input) =>
      enqueue(async () => {
        const entry = validate(input.key, input.value)
        if (isFailure(entry)) return {ok: false, failure: entry}
        return writeAcrossLayers(
          entry,
          [
            {scope: 'global', value: input.value},
            {scope: 'project', value: undefined},
          ],
          input.expectedRevisions,
          input.actor,
        )
      }),
    reset: (input) =>
      enqueue(async () => {
        const entry = validate(input.key, undefined)
        if (isFailure(entry)) return {ok: false, failure: entry}
        return writeAcrossLayers(
          entry,
          [
            {scope: 'project', value: undefined},
            {scope: 'global', value: undefined},
          ],
          input.expectedRevisions,
          input.actor,
        )
      }),
    history: (key) =>
      SETTINGS_SCOPES.flatMap((scope) => readHistory(historyPath(scope), key)).toSorted((left, right) =>
        right.ts === left.ts ? 0 : right.ts - left.ts,
      ),
    dispose: watchLayers(
      SETTINGS_SCOPES.map((scope) => directories[scope]),
      () => {
        void enqueue(async () => {
          const changes: Change[] = []
          const moved: SettingsScope[] = []
          for (const scope of SETTINGS_SCOPES) {
            const before = layers[scope]
            const after = await refresh(scope)
            if (after.revision === before.revision) continue
            moved.push(scope)
            for (const entry of deps.registry.entries) {
              const from = rawValueOf(before, entry)
              const to = rawValueOf(after, entry)
              if (Object.is(from, to)) continue
              changes.push({scope, key: entry.key, from, to})
            }
          }
          if (moved.length === 0) return
          const opId = randomUUID()
          for (const change of changes) {
            appendHistory(historyPath(change.scope), {ts: Date.now(), actor: 'file', opId, ...change})
          }
          deps.notify({opId, keys: uniqueStrings(changes.map((change) => change.key)), scopes: moved})
        })
      },
      WATCH_DEBOUNCE_MS,
    ),
  }
}
