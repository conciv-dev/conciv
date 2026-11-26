import {homedir} from 'node:os'
import {isAbsolute, join} from 'node:path'
import {Config, Effect, FileSystem, Predicate, Schema} from 'effect'

const ENDPOINT = 'a loopback WebSocket endpoint with an explicit port'

const InstanceName = Schema.String.check(
  Schema.makeFilter((value) =>
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value) ? undefined : 'a valid Drive instance name',
  ),
)

const Endpoint = Schema.String.check(
  Schema.makeFilter((value) => {
    if (!URL.canParse(value)) return ENDPOINT
    const endpoint = new URL(value)
    const port = Number(endpoint.port)
    return endpoint.protocol === 'ws:' && endpoint.hostname === '127.0.0.1' && Number.isInteger(port) && port >= 1
      ? undefined
      : ENDPOINT
  }),
)

const AbsolutePath = Schema.String.check(
  Schema.makeFilter((value) => (isAbsolute(value) ? undefined : 'an absolute path')),
)

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))

const Manifest = Schema.Struct({
  endpoints: Schema.Struct({
    ui: Endpoint,
    backend: Endpoint,
  }),
  viewport: Schema.optionalKey(Schema.Struct({cols: PositiveInt, rows: PositiveInt})),
  recording: Schema.optionalKey(Schema.Struct({timeline: AbsolutePath})),
})
export type Manifest = typeof Manifest.Type

export const ResolveError = Schema.TaggedStruct('DriveManifest.ResolveError', {
  reason: Schema.Literals(['config', 'not-found', 'read', 'decode']),
  path: Schema.optionalKey(Schema.String),
  message: Schema.String,
  cause: Schema.Defect(),
})
export type ResolveError = typeof ResolveError.Type & globalThis.Error

const makeResolveError = (fields: Omit<typeof ResolveError.Type, '_tag'>): ResolveError =>
  Object.assign(new globalThis.Error(fields.message), ResolveError.make(fields), {name: 'DriveManifest.ResolveError'})

export const defaults: Manifest = {
  endpoints: {
    ui: 'ws://127.0.0.1:40900',
    backend: 'ws://127.0.0.1:40950',
  },
}

const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(Manifest))

const configError = (cause: unknown) =>
  makeResolveError({reason: 'config', message: `Invalid Drive configuration: ${String(cause)}`, cause})

export const resolve = Effect.fn('DriveManifest.resolve')(function* () {
  const name = yield* Config.schema(InstanceName, 'CONCIV_DRIVE').pipe(Effect.mapError(configError))
  if (name === '1') return defaults

  const state = yield* Config.String('XDG_STATE_HOME').pipe(
    Config.withDefault(join(homedir(), '.local', 'state')),
    Effect.mapError(configError),
  )
  const directory = yield* Config.String('DRIVE_REGISTRY_DIR').pipe(
    Config.withDefault(join(state, 'conciv-drive', 'instances')),
    Effect.mapError(configError),
  )
  const file = join(directory, `${name}.json`)
  const fs = yield* FileSystem.FileSystem
  const contents = yield* fs.readFileString(file).pipe(
    Effect.mapError((cause) => {
      const missing = Predicate.isTagged(cause.reason, 'NotFound')
      return makeResolveError({
        reason: missing ? 'not-found' : 'read',
        path: file,
        message: missing
          ? `Drive manifest not found: ${file}`
          : `Failed to read Drive manifest: ${file}: ${cause.message}`,
        cause,
      })
    }),
  )
  return yield* decode(contents).pipe(
    Effect.mapError((cause) =>
      makeResolveError({
        reason: 'decode',
        path: file,
        message: `Invalid Drive manifest: ${file}: ${cause.message}`,
        cause,
      }),
    ),
  )
})
