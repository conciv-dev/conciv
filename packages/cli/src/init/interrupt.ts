import {writeFileSync} from 'node:fs'

export type FileBackup = {path: string; content: string}

export type BackupGuard = {remember: (file: FileBackup) => void; restore: () => void; release: () => void}

export function guardBackups(): BackupGuard {
  const files: FileBackup[] = []
  const restore = () => {
    for (const file of files.toReversed()) writeFileSync(file.path, file.content)
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
