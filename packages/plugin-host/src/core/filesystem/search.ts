import path from 'path'
import {Clock, Context, Deferred, Duration, Effect, Layer, Scope} from 'effect'
import * as Fff from '#fff'
import fuzzysort from 'fuzzysort'
import {RelativePath} from '@conciv/plugin/schema/schema'
import * as FileSystem from '../../schema/filesystem.js'
import {Location} from '../location.js'
import * as Ripgrep from '../ripgrep.js'
import * as Protected from './protected.js'

export interface Interface {
  readonly find: (input: FileSystem.FindInput) => Effect.Effect<FileSystem.Entry[]>
}

export interface Options {
  readonly fff?: boolean
}

export const Service = Context.Service<Interface>('@conciv/FileSystem/Search')

const REFRESH_INTERVAL = Duration.toMillis('10 seconds')
type Prepared = ReturnType<typeof fuzzysort.prepare>

function emptyIndex() {
  return {files: new Map<string, Prepared>(), directories: new Map<string, Prepared>()}
}

function search(index: ReturnType<typeof emptyIndex>, input: FileSystem.FindInput) {
  const items =
    input.type === 'file'
      ? Array.from(index.files.values())
      : input.type === 'directory'
        ? Array.from(index.directories.values())
        : [...index.files.values(), ...index.directories.values()]
  const result = fuzzysort.go(input.query, items, {limit: input.limit ?? 50})
  fuzzysort.cleanup()
  return result.map((item) => {
    const relative = item.target
    const type: FileSystem.Entry['type'] = relative.endsWith(path.sep) ? 'directory' : 'file'
    return FileSystem.Entry.make({
      path: RelativePath.make(relative),
      type,
    })
  })
}

const ripgrepLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const location = yield* Location.Service
    const ripgrep = yield* Ripgrep.Service
    const scope = yield* Scope.Scope
    const clock = yield* Clock.Clock
    const home = Protected.isHome(location.directory)
    let index = emptyIndex()
    let initialized = false
    let settledAt = Number.NEGATIVE_INFINITY
    let refreshing: Deferred.Deferred<void> | undefined
    const scan = Effect.gen(function* () {
      const next = emptyIndex()
      const previous = index
      if (!initialized) index = next
      yield* ripgrep.find({
        cwd: location.directory,
        pattern: '*',
        hidden: true,
        limit: location.vcs && !home ? Number.MAX_SAFE_INTEGER : 100_000,
        exclude: home ? [...Protected.names()].map((name) => `${name}/**`) : undefined,
        onEntry: (entry) =>
          Effect.sync(() => {
            next.files.set(entry.path, previous.files.get(entry.path) ?? fuzzysort.prepare(entry.path))
            const parts = entry.path.split('/')
            parts.slice(0, -1).forEach((_, offset) => {
              const directory = parts.slice(0, offset + 1).join('/') + path.sep
              if (!next.directories.has(directory))
                next.directories.set(directory, previous.directories.get(directory) ?? fuzzysort.prepare(directory))
            })
          }),
      })
      index = next
      initialized = true
    }).pipe(Effect.orDie)
    const refresh = Effect.suspend(() => {
      if (refreshing) return initialized ? Effect.void : Deferred.await(refreshing)
      if (initialized && clock.currentTimeMillisUnsafe() < settledAt + REFRESH_INTERVAL) return Effect.void

      const attempt = Deferred.makeUnsafe<void>()
      refreshing = attempt
      return scan.pipe(
        Effect.onExit((exit) =>
          Effect.sync(() => {
            settledAt = clock.currentTimeMillisUnsafe()
            if (refreshing === attempt) refreshing = undefined
            Deferred.doneUnsafe(attempt, exit)
          }),
        ),
        Effect.forkIn(scope),
        Effect.flatMap(() => (initialized ? Effect.void : Deferred.await(attempt))),
      )
    })
    return Service.of({
      find: (input) =>
        Effect.gen(function* () {
          yield* refresh
          return search(index, input)
        }),
    })
  }),
)

const FFF_SCAN_WAIT = Duration.seconds(3)

type CreatePicker = (options: Fff.Init) => Fff.Result<Fff.Picker>

function createPicker(
  create: CreatePicker,
  directory: string,
): {ok: true; value: Fff.Picker} | {ok: false; error: unknown} {
  try {
    return create({
      basePath: directory,
      aiMode: true,
      disableMmapCache: true,
      disableContentIndexing: true,
    })
  } catch (error) {
    return {ok: false, error}
  }
}

type Scored = {readonly path: string; readonly type: FileSystem.Entry['type']; readonly score: number}

function searchPicker(finder: Fff.Picker, input: FileSystem.FindInput): Effect.Effect<Scored[]> {
  const options = {pageIndex: 0, pageSize: input.limit ?? 50}
  if (input.type === 'file') {
    const found = finder.fileSearch(input.query.trim(), options)
    if (!found.ok) return Effect.die(found.error)
    return Effect.succeed(
      found.value.items.map((item, index): Scored => ({
        path: item.relativePath,
        type: 'file',
        score: found.value.scores[index]?.total ?? 0,
      })),
    )
  }
  if (input.type === 'directory') {
    const found = finder.directorySearch(input.query.trim(), options)
    if (!found.ok) return Effect.die(found.error)
    return Effect.succeed(
      found.value.items.map((item, index): Scored => ({
        path: item.relativePath,
        type: 'directory',
        score: found.value.scores[index]?.total ?? 0,
      })),
    )
  }
  const found = finder.mixedSearch(input.query.trim(), options)
  if (!found.ok) return Effect.die(found.error)
  return Effect.succeed(
    found.value.items.map((item, index) => ({
      path: item.item.relativePath,
      type: item.type,
      score: found.value.scores[index]?.total ?? 0,
    })),
  )
}

const makeFffLayer = (create: CreatePicker) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const location = yield* Location.Service
      let state: {readonly result: ReturnType<typeof createPicker>; scanned: boolean} | 'closed' | undefined
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          if (typeof state === 'object' && state.result.ok) state.result.value.destroy()
          state = 'closed'
        }),
      )
      const acquire = Effect.uninterruptible(
        Effect.sync(() => {
          if (state !== undefined) return {current: state, created: false}
          state = {result: createPicker(create, location.directory), scanned: false}
          return {current: state, created: true}
        }),
      )
      const picker = Effect.gen(function* () {
        const {current, created} = yield* acquire
        if (current === 'closed') return undefined
        if (!current.result.ok) {
          if (created) yield* Effect.logWarning('failed to initialize fff', {error: current.result.error})
          return undefined
        }
        if (!current.scanned) {
          const value = current.result.value
          yield* Effect.gen(function* () {
            while (value.isScanning()) yield* Effect.sleep('20 millis')
          }).pipe(Effect.timeoutOption(FFF_SCAN_WAIT))
          current.scanned = true
        }
        return current.result.value
      })
      return Service.of({
        find: (input) =>
          Effect.gen(function* () {
            const finder = yield* picker
            if (!finder) return []
            const items = yield* searchPicker(finder, input)
            return items
              .toSorted((first, second) => second.score - first.score || first.path.length - second.path.length)
              .map((item) => {
                const relative = item.path.replaceAll('\\', '/').replace(/\/$/, '')
                return FileSystem.Entry.make({
                  path: RelativePath.make(relative + (item.type === 'directory' ? path.sep : '')),
                  type: item.type,
                })
              })
          }),
      })
    }),
  )

const fffLayer = Layer.unwrap(Effect.map(Fff.create, makeFffLayer))

const layer = (options?: Options) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const location = yield* Location.Service
      if (location.workspaceId) return ripgrepLayer
      if (options?.fff === false || (options?.fff === undefined && process.platform === 'win32')) return ripgrepLayer
      if (!(yield* Fff.available)) return ripgrepLayer
      return location.vcs && !Protected.isHome(location.directory) ? fffLayer : ripgrepLayer
    }),
  )

export function configured(options?: Options) {
  return layer(options)
}

export const defaultLayer = configured()
