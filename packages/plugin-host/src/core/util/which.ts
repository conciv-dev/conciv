import whichPackage from 'which'
import path from 'path'
import {existsSync, lstatSync} from 'fs'

export function which(command: string, env?: NodeJS.ProcessEnv, bin?: string) {
  const base = env?.PATH ?? env?.Path ?? process.env.PATH ?? process.env.Path ?? ''
  const full = base && bin ? base + path.delimiter + bin : base || bin
  return (
    whichPackage.sync(command, {
      nothrow: true,
      path: full,
      pathExt: env?.PATHEXT ?? env?.PathExt ?? process.env.PATHEXT ?? process.env.PathExt,
    }) ?? appExecutionAlias(command, full)
  )
}

export function isAppExecutionAlias(file: string) {
  return (
    process.platform === 'win32' &&
    lstatSync(file, {throwIfNoEntry: false})?.isSymbolicLink() === true &&
    existsSync(file)
  )
}

function appExecutionAlias(command: string, search: string | undefined) {
  if (process.platform !== 'win32' || !search || path.win32.dirname(command) !== '.') return null
  const name = path.win32.extname(command).toLowerCase() === '.exe' ? command : command + '.exe'
  return (
    search
      .split(path.win32.delimiter)
      .filter(Boolean)
      .map((directory) => path.win32.join(directory.replace(/^"(.*)"$/, '$1'), name))
      .find(isAppExecutionAlias) ?? null
  )
}
