import {createHash} from 'node:crypto'
import path from 'path'
import {Context, Effect, FileSystem, Layer, Stream} from 'effect'
import {HttpClient, HttpClientRequest} from 'effect/http'
import {ChildProcess} from 'effect/process'
import {ChildProcessSpawner} from 'effect/process/ChildProcessSpawner'
import {FSUtil} from '@conciv/backend-app-api/util/fs-util'
import * as Global from '@conciv/backend-app-api/util/global'
import {which} from '../util/which.js'
import {ripgrepErrors} from '@conciv/errors'

const VERSION = '15.1.0'

const PLATFORM = {
  'arm64-darwin': {
    platform: 'aarch64-apple-darwin',
    extension: 'tar.gz',
    sha256: '378e973289176ca0c6054054ee7f631a065874a352bf43f0fa60ef079b6ba715',
  },
  'arm64-linux': {
    platform: 'aarch64-unknown-linux-gnu',
    extension: 'tar.gz',
    sha256: '2b661c6ef508e902f388e9098d9c4c5aca72c87b55922d94abdba830b4dc885e',
  },
  'x64-darwin': {
    platform: 'x86_64-apple-darwin',
    extension: 'tar.gz',
    sha256: '64811cb24e77cac3057d6c40b63ac9becf9082eedd54ca411b475b755d334882',
  },
  'x64-linux': {
    platform: 'x86_64-unknown-linux-musl',
    extension: 'tar.gz',
    sha256: '1c9297be4a084eea7ecaedf93eb03d058d6faae29bbc57ecdaf5063921491599',
  },
  'arm64-win32': {
    platform: 'aarch64-pc-windows-msvc',
    extension: 'zip',
    sha256: '00d931fb5237c9696ca49308818edb76d8eb6fc132761cb2a1bd616b2df02f8e',
  },
  'ia32-win32': {
    platform: 'i686-pc-windows-msvc',
    extension: 'zip',
    sha256: '725be85a1e8f92878a548f40ee4f6df64bc93b809586462b3c6d884e1de1e83a',
  },
  'x64-win32': {
    platform: 'x86_64-pc-windows-msvc',
    extension: 'zip',
    sha256: '124510b94b6baa3380d051fdf4650eaa80a302c876d611e9dba0b2e18d87493a',
  },
} satisfies Record<string, {platform: string; extension: 'tar.gz' | 'zip'; sha256: string}>

type PlatformConfig = (typeof PLATFORM)[keyof typeof PLATFORM]

export interface Interface {
  readonly filepath: Effect.Effect<string, Error>
}

export const Service = Context.Service<Interface>('@conciv/RipgrepBinary')

const readPlatform = (key: string): PlatformConfig | undefined =>
  Object.entries(PLATFORM).find(([name]) => name === key)?.[1]

const failure = (cause: unknown): Error =>
  cause instanceof Error
    ? cause
    : ripgrepErrors.FAILED({message: 'ripgrep could not be installed', internal: {thrown: String(cause)}})

export function verify(bytes: Uint8Array, filename: string, expected: string) {
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual === expected) return Effect.void
  return Effect.fail(ripgrepErrors.CHECKSUM_MISMATCH({filename, expected, actual}))
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const http = HttpClient.filterStatusOk(yield* HttpClient.HttpClient)
    const spawner = yield* ChildProcessSpawner
    const global = yield* Global.Service
    const bin = path.join(global.cache, 'bin')
    const findExecutable = (name: string) =>
      which(name, undefined, bin).pipe(Effect.provideService(FileSystem.FileSystem, fs))

    const run = Effect.fnUntraced(function* (command: string, args: string[], cwd: string) {
      const handle = yield* spawner.spawn(ChildProcess.make(command, args, {cwd, extendEnv: true, stdin: 'ignore'}))
      const [stdout, stderr, code] = yield* Effect.all(
        [
          Stream.mkString(Stream.decodeText(handle.stdout)),
          Stream.mkString(Stream.decodeText(handle.stderr)),
          handle.exitCode,
        ],
        {concurrency: 'unbounded'},
      )
      return {stdout, stderr, code}
    }, Effect.scoped)

    const extract = Effect.fnUntraced(function* (archive: string, config: PlatformConfig, target: string) {
      const directory = yield* fs.makeTempDirectoryScoped({directory: bin, prefix: 'ripgrep-'})
      const result = yield* config.extension === 'zip'
        ? run(
            path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'),
            ['-xf', path.relative(directory, archive)],
            directory,
          )
        : run('tar', ['-xzf', archive, '-C', directory], directory)
      if (result.code !== 0)
        return yield* Effect.fail(
          ripgrepErrors.EXTRACTION_FAILED({
            exitCode: result.code,
            ...(result.stderr.trim() || result.stdout.trim()
              ? {message: result.stderr.trim() || result.stdout.trim()}
              : {}),
          }),
        )

      const extracted = path.join(
        directory,
        `ripgrep-${VERSION}-${config.platform}`,
        process.platform === 'win32' ? 'rg.exe' : 'rg',
      )
      if (!(yield* fs.isFile(extracted))) return yield* Effect.fail(ripgrepErrors.EXECUTABLE_MISSING({extracted}))

      yield* fs.copyFile(extracted, target)
      if (process.platform !== 'win32') yield* fs.chmod(target, 0o755)
    }, Effect.scoped)

    return Service.of({
      filepath: yield* Effect.cached(
        Effect.gen(function* () {
          const system = yield* findExecutable(process.platform === 'win32' ? 'rg.exe' : 'rg')
          if (system && (yield* fs.isFile(system))) return system

          const target = path.join(bin, `rg${process.platform === 'win32' ? '.exe' : ''}`)
          if (yield* fs.isFile(target)) return target

          const platformKey = `${process.arch}-${process.platform}`
          const config = readPlatform(platformKey)
          if (!config) return yield* Effect.fail(ripgrepErrors.PLATFORM_UNSUPPORTED({platformKey}))

          const filename = `ripgrep-${VERSION}-${config.platform}.${config.extension}`
          const url = `https://github.com/BurntSushi/ripgrep/releases/download/${VERSION}/${filename}`
          const archive = path.join(bin, filename)

          yield* Effect.logInfo('downloading ripgrep', {url})
          yield* fs.ensureDir(bin)
          const bytes = yield* HttpClientRequest.get(url).pipe(
            http.execute,
            Effect.flatMap((response) => response.arrayBuffer),
          )
          if (bytes.byteLength === 0) return yield* Effect.fail(ripgrepErrors.DOWNLOAD_EMPTY({url}))
          yield* verify(new Uint8Array(bytes), filename, config.sha256)

          yield* fs.writeFile(archive, new Uint8Array(bytes))
          yield* extract(archive, config, target)
          yield* fs.remove(archive, {force: true}).pipe(Effect.ignore)
          return target
        }).pipe(Effect.mapError(failure)),
      ),
    })
  }),
)
