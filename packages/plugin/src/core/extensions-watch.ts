import {join, resolve} from 'node:path'
import {watch, type FSWatcher} from 'chokidar'
import {writeExtensionsEntry} from './extensions-entry.js'

type WatchEntry = {watcher: FSWatcher; disposed: boolean}

const registry = new Map<string, WatchEntry>()

function closeQuietly(watcher: FSWatcher): void {
  watcher.close().catch((error) => console.error('conciv extensions watcher: close failed', error))
}

export function watchExtensionsDir(root: string): () => Promise<void> {
  const resolvedRoot = resolve(root)
  const watchDir = join(resolvedRoot, 'conciv')

  const previous = registry.get(resolvedRoot)
  if (previous) {
    previous.disposed = true
    closeQuietly(previous.watcher)
    registry.delete(resolvedRoot)
  }

  const entry: WatchEntry = {watcher: arm(), disposed: false}
  registry.set(resolvedRoot, entry)

  function rearm(): void {
    if (entry.disposed) return
    closeQuietly(entry.watcher)
    entry.watcher = arm()
  }

  function arm(): FSWatcher {
    const watcher = watch(watchDir, {ignoreInitial: true})
    watcher.on('ready', () => writeExtensionsEntry(resolvedRoot))
    watcher.on('all', (event, path) => {
      writeExtensionsEntry(resolvedRoot)
      if (event === 'unlinkDir' && path === watchDir) rearm()
    })
    watcher.on('error', (error) => {
      console.error('conciv extensions watcher error:', resolvedRoot, error)
      rearm()
    })
    return watcher
  }

  return async () => {
    entry.disposed = true
    if (registry.get(resolvedRoot) === entry) registry.delete(resolvedRoot)
    await entry.watcher.close()
  }
}
