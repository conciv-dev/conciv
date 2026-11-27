import {homedir} from 'node:os'
import {isAbsolute, join} from 'node:path'
import {Config, Effect, FileSystem, Predicate, Schema} from 'effect'
import type {EvlogError} from 'evlog'
import {simulationErrors} from '@conciv/errors'
import {failureText} from '@conciv/protocol'

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

export type Manifest = {
  readonly endpoints: {readonly ui: string; readonly backend: string}
  readonly viewport?: {readonly cols: number; readonly rows: number}
  readonly recording?: {readonly timeline: string}
}

const ManifestSchema = Schema.Struct({
  endpoints: Schema.Struct({
    ui: Endpoint,
    backend: Endpoint,
  }),
  viewport: Schema.optionalKey(Schema.Struct({cols: PositiveInt, rows: PositiveInt})),
  recording: Schema.optionalKey(Schema.Struct({timeline: AbsolutePath})),
})

export const defaults: Manifest = {
  endpoints: {
    ui: 'ws://127.0.0.1:40900',
    backend: 'ws://127.0.0.1:40950',
  },
}

const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(ManifestSchema))

const configError = (cause: unknown) =>
  simulationErrors.MANIFEST_CONFIG_INVALID({
    reason: failureText(cause),
    cause: cause instanceof Error ? cause : undefined,
  })

export const resolve: () => Effect.Effect<Manifest, EvlogError, FileSystem.FileSystem> = Effect.fn(
  'DriveManifest.resolve',
)(function* () {
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
  const contents = yield* fs
    .readFileString(file)
    .pipe(
      Effect.mapError((cause) =>
        Predicate.isTagged(cause.reason, 'NotFound')
          ? simulationErrors.MANIFEST_NOT_FOUND({path: file, cause})
          : simulationErrors.MANIFEST_UNREADABLE({path: file, reason: cause.message, cause}),
      ),
    )
  return yield* decode(contents).pipe(
    Effect.mapError((cause) => simulationErrors.MANIFEST_INVALID({path: file, reason: cause.message, cause})),
  )
})
