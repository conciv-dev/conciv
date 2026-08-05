import {existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs'

export type FileBackup = {path: string; content: string | null}

export type BackupGuard = {remember: (file: FileBackup) => void; restore: () => void; release: () => void}

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

export function onInterrupt(handler: () => void): () => void {
  process.on('SIGINT', handler)
  return () => {
    process.off('SIGINT', handler)
  }
}
