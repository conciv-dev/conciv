import {rmSync, writeFileSync} from 'node:fs'
import {access, readFile} from 'node:fs/promises'
import {constants} from 'node:os'

export type FileBackup = {path: string; content: string | null}

type BackupGuard = {remember: (file: FileBackup) => void; restore: () => void; release: () => void}

export async function pathExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  )
}

export async function readOptionalText(path: string): Promise<string | null> {
  return readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
}

export async function captureFile(path: string): Promise<FileBackup> {
  return {path, content: await readOptionalText(path)}
}

function restoreFile(file: FileBackup): void {
  if (file.content === null) {
    rmSync(file.path, {force: true})
    return
  }
  writeFileSync(file.path, file.content)
}

export function guardBackups(): BackupGuard {
  const files: FileBackup[] = []
  const restore = () => {
    for (const file of files.toReversed()) restoreFile(file)
  }
  process.on('exit', restore)
  return {
    remember: (file) => {
      files.push(file)
    },
    restore,
    release: () => {
      process.off('exit', restore)
    },
  }
}

const stopSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP']

export function interruptExitCode(reason: unknown): number {
  const signal = stopSignals.find((name) => name === reason) ?? 'SIGINT'
  return 128 + constants.signals[signal]
}

export function onInterrupt(handler: (signal: NodeJS.Signals) => void): () => void {
  for (const signal of stopSignals) process.on(signal, handler)
  return () => {
    for (const signal of stopSignals) process.off(signal, handler)
  }
}
