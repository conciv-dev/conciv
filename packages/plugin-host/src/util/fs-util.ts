import path, {isAbsolute, relative, sep} from 'path'
import {Context, Effect, FileSystem, Layer, Schema} from 'effect'
import type {PlatformError} from 'effect/PlatformError'
import * as Glob from './glob.js'

export namespace FSUtil {
  export const FileSystemError = Schema.TaggedStruct('FileSystemError', {
    method: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  })
  export type FileSystemError = typeof FileSystemError.Type & globalThis.Error
  export const makeFileSystemError = (fields: Omit<typeof FileSystemError.Type, '_tag'>): FileSystemError => {
    const detail =
      fields.cause instanceof globalThis.Error ? fields.cause.message : fields.cause && String(fields.cause)
    return Object.assign(
      new globalThis.Error(`Filesystem operation failed: ${fields.method}${detail ? `: ${detail}` : ''}`),
      FileSystemError.make(fields),
      {name: 'FileSystemError'},
    )
  }

  export type Error = PlatformError | FileSystemError

  export interface Interface extends FileSystem.FileSystem {
    readonly isDir: (path: string) => Effect.Effect<boolean>
    readonly isFile: (path: string) => Effect.Effect<boolean>
    readonly existsSafe: (path: string) => Effect.Effect<boolean>
    readonly readJson: (path: string) => Effect.Effect<unknown, Error>
    readonly resolve: (path: string) => Effect.Effect<string>
    readonly scan: (pattern: string, options?: Glob.Options) => Effect.Effect<string[], Error>
  }

  export const Service = Context.Service<Interface>('@opencode/FSUtil')

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem

      const existsSafe = Effect.fn('FileSystem.existsSafe')(function* (path: string) {
        return yield* fs.exists(path).pipe(Effect.orElseSucceed(() => false))
      })

      const isDir = Effect.fn('FileSystem.isDir')(function* (path: string) {
        const info = yield* fs.stat(path).pipe(Effect.catch(() => Effect.void))
        return info?.type === 'Directory'
      })

      const isFile = Effect.fn('FileSystem.isFile')(function* (path: string) {
        const info = yield* fs.stat(path).pipe(Effect.catch(() => Effect.void))
        return info?.type === 'File'
      })

      const resolve = Effect.fnUntraced(function* (input: string) {
        const resolved = path.resolve(windowsPath(input))
        return yield* fs.realPath(resolved).pipe(
          Effect.map((real) =>
            process.platform === 'win32' && real.toLowerCase() === resolved.toLowerCase() ? resolved : real,
          ),
          Effect.catchIf(
            (error) => error.reason._tag === 'NotFound' || isAccessDenied(error),
            () => Effect.succeed(resolved),
          ),
          Effect.orDie,
        )
      })

      const readJson = Effect.fn('FileSystem.readJson')(function* (path: string) {
        const text = yield* fs.readFileString(path)
        return yield* Effect.try({
          try: () => JSON.parse(text),
          catch: (cause) => makeFileSystemError({method: 'readJson', cause}),
        })
      })

      const scan = Effect.fn('FileSystem.scan')(function* (pattern: string, options?: Glob.Options) {
        return yield* Effect.tryPromise({
          try: () => Glob.scan(pattern, options),
          catch: (cause) => makeFileSystemError({method: 'glob', cause}),
        })
      })

      return Service.of({
        ...fs,
        existsSafe,
        isDir,
        isFile,
        resolve,
        readJson,
        scan,
      })
    }),
  )

  export function isAccessDenied(error: PlatformError) {
    if (error.reason._tag === 'PermissionDenied') return true
    const cause = error.reason.cause
    return (
      error.reason._tag === 'Unknown' && cause instanceof globalThis.Error && 'code' in cause && cause.code === 'EPERM'
    )
  }

  export function windowsPath(p: string): string {
    if (process.platform !== 'win32') return p
    return p
      .replace(/^\/([a-zA-Z]):(?:[\\/]|$)/, (_, drive) => `${drive.toUpperCase()}:/`)
      .replace(/^\/([a-zA-Z])(?:\/|$)/, (_, drive) => `${drive.toUpperCase()}:/`)
      .replace(/^\/cygdrive\/([a-zA-Z])(?:\/|$)/, (_, drive) => `${drive.toUpperCase()}:/`)
      .replace(/^\/mnt\/([a-zA-Z])(?:\/|$)/, (_, drive) => `${drive.toUpperCase()}:/`)
  }

  export const ignoredDirectories = ['node_modules', '.git', '.venv', 'venv', '__pycache__']

  export const ignoreGlobs = [...ignoredDirectories, `**/{${ignoredDirectories.join(',')}}/**`]

  export function contains(parent: string, child: string) {
    const result = relative(parent, child)
    return result === '' || (!isAbsolute(result) && result !== '..' && !result.startsWith(`..${sep}`))
  }
}
