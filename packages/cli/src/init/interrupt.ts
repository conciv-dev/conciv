import {existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {constants} from 'node:os'

export type FileBackup = {path: string; content: string | null}

type BackupGuard = {remember: (file: FileBackup) => void; restore: () => void; release: () => void}

export function captureFile(path: string): FileBackup {
  if (!existsSync(path)) return {path, content: null}
  return {path, content: readFileSync(path, 'utf8')}
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
