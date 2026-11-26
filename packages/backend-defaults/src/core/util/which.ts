import whichPackage from 'which'
import path from 'path'
import {Effect, FileSystem, Option} from 'effect'

export const which = Effect.fn('which')(function* (command: string, env?: NodeJS.ProcessEnv, bin?: string) {
  const base = env?.PATH ?? env?.Path ?? process.env.PATH ?? process.env.Path ?? ''
  const full = base && bin ? base + path.delimiter + bin : base || bin
  const found = yield* Effect.promise(() =>
    whichPackage(command, {
      nothrow: true,
      path: full,
      pathExt: env?.PATHEXT ?? env?.PathExt ?? process.env.PATHEXT ?? process.env.PathExt,
    }),
  )
  return found ?? (yield* appExecutionAlias(command, full))
})

export const isAppExecutionAlias = Effect.fn('isAppExecutionAlias')(function* (file: string) {
  if (process.platform !== 'win32') return false
  const fs = yield* FileSystem.FileSystem
  const linked = yield* fs.readLink(file).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  )
  return linked && (yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false)))
})

const appExecutionAlias = Effect.fn('appExecutionAlias')(function* (command: string, search: string | undefined) {
  if (process.platform !== 'win32' || !search || path.win32.dirname(command) !== '.') return null
  const name = path.win32.extname(command).toLowerCase() === '.exe' ? command : command + '.exe'
  const candidates = search
    .split(path.win32.delimiter)
    .filter(Boolean)
    .map((directory) => path.win32.join(directory.replace(/^"(.*)"$/, '$1'), name))
  return Option.getOrNull(yield* Effect.findFirst(candidates, (candidate) => isAppExecutionAlias(candidate)))
})
