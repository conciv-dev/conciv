import {homedir} from 'node:os'
import {Config, Effect, FileSystem, Option, Path, Schedule} from 'effect'
import {z} from 'zod'
import type {Context} from '@conciv/plugin/effect/plugin'

const FILE_NAME = 'dev-endpoint.json'
const FILE_MODE = 0o600
const SERVER_POLL = '100 millis'
const SERVER_POLLS = 100

export const DevEndpointSchema = z.object({
  apiBase: z.string().min(1),
  pid: z.number().int().positive(),
})

export type DevEndpoint = z.infer<typeof DevEndpointSchema>

const DevEndpointOptionsSchema = z.object({devEndpointDir: z.string().min(1).optional()})

const HomeConfig = Config.NonEmptyString('HOME').pipe(Config.orElse(() => Config.succeed(homedir())))

type Pairing = Pick<Context, 'options' | 'servers'>

const builtinUrl = (servers: Context['servers']) =>
  Effect.sync(() =>
    Option.fromNullishOr(
      servers
        .list()
        .map((id) => servers.get(id))
        .find((server) => server?.builtin)?.url,
    ),
  )

const awaitBuiltinUrl = (servers: Context['servers']) =>
  builtinUrl(servers).pipe(
    Effect.flatMap((url) => (Option.isSome(url) ? Effect.succeed(url.value) : Effect.fail('not listed yet'))),
    Effect.retry({schedule: Schedule.spaced(SERVER_POLL), times: SERVER_POLLS}),
  )

const endpointDir = (options: Pairing['options']) =>
  Effect.gen(function* () {
    const parsed = DevEndpointOptionsSchema.safeParse(options ?? {})
    const configured = parsed.success ? parsed.data.devEndpointDir : undefined
    if (configured !== undefined) return configured
    const path = yield* Path.Path
    return path.join(yield* HomeConfig, '.conciv')
  })

const writePrivate = Effect.fn('ios.devEndpoint.write')(function* (file: string, contents: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  yield* fs.makeDirectory(path.dirname(file), {recursive: true})
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`
  yield* fs.writeFileString(temporary, contents, {mode: FILE_MODE}).pipe(
    Effect.andThen(fs.chmod(temporary, FILE_MODE)),
    Effect.andThen(fs.rename(temporary, file)),
    Effect.onError(() => fs.remove(temporary, {force: true}).pipe(Effect.ignore)),
  )
})

const readEndpoint = (file: string) =>
  FileSystem.FileSystem.pipe(
    Effect.flatMap((fs) => fs.readFileString(file)),
    Effect.flatMap((raw) => Effect.try(() => DevEndpointSchema.safeParse(JSON.parse(raw)))),
    Effect.map((parsed) => (parsed.success ? Option.some(parsed.data) : Option.none())),
    Effect.catch(() => Effect.succeed(Option.none<DevEndpoint>())),
  )

const removeOwn = Effect.fn('ios.devEndpoint.remove')(function* (file: string) {
  const current = yield* readEndpoint(file)
  if (Option.isSome(current) && current.value.pid !== process.pid) return
  const fs = yield* FileSystem.FileSystem
  yield* fs.remove(file, {force: true})
})

export const pairDevEndpoint = Effect.fn('ios.devEndpoint.pair')(function* (ctx: Pairing) {
  const path = yield* Path.Path
  const file = path.join(yield* endpointDir(ctx.options), FILE_NAME)
  const apiBase = yield* awaitBuiltinUrl(ctx.servers)
  yield* Effect.acquireRelease(
    writePrivate(file, JSON.stringify(DevEndpointSchema.parse({apiBase, pid: process.pid}))),
    () =>
      removeOwn(file).pipe(
        Effect.catch((error) => Effect.logError('[ios] removing the dev endpoint file failed', {file, error})),
      ),
  )
})
