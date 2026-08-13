import {existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs'

export type FileBackup = {path: string; content: string | null}

export type DirBackup = {path: string; dir: true; existed: boolean}

export type Backup = FileBackup | DirBackup

export type BackupGuard = {remember: (entry: Backup) => void; restore: () => void; release: () => void}

export function captureFile(path: string): FileBackup {
  if (!existsSync(path)) return {path, content: null}
  return {path, content: readFileSync(path, 'utf8')}
}

export function captureDir(path: string): DirBackup {
  return {path, dir: true, existed: existsSync(path)}
}

function restoreFile(file: FileBackup): void {
  if (file.content === null) {
    rmSync(file.path, {force: true})
    return
  }
  writeFileSync(file.path, file.content)
}

function restoreDir(dir: DirBackup): void {
  if (dir.existed) return
  rmSync(dir.path, {recursive: true, force: true})
}

function restoreEntry(entry: Backup): void {
  if ('dir' in entry) {
    restoreDir(entry)
    return
  }
  restoreFile(entry)
}

export function guardBackups(): BackupGuard {
  const entries: Backup[] = []
  const restore = () => {
    for (const entry of entries.toReversed()) restoreEntry(entry)
  }
  process.on('exit', restore)
  return {
    remember: (entry) => {
      entries.push(entry)
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
