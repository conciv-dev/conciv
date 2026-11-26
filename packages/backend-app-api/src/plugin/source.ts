import {readFile, readdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {Hash} from '../util/hash.js'

export function createPluginSources(watch: (file: string) => Promise<void>) {
  const sources = new Map<string, Source>()
  const cleanups: Array<() => void> = []
  const watching = new Set<Promise<void>>()
  return {
    read: async (entrypoint: string) => {
      await Promise.all(watching)
      const previous = sources.get(entrypoint)
      if (previous && (await unchanged(previous.files))) return previous.loaded

      const files: Source['files'] = new Map()
      const track = (file: string, directory = false) => {
        if (files.has(file)) return
        files.set(file, {digest: digest(file, directory), directory})
        const pending = watch(file).finally(() => watching.delete(pending))
        watching.add(pending)
        void pending.catch(() => {})
      }
      track(fileURLToPath(entrypoint))
      const {prepareSource} = await import('./source.node.js')
      const prepared: {version: string; load: () => Promise<unknown>; dispose?: () => void} = await prepareSource(
        entrypoint,
        track,
      )
      if (prepared.dispose) cleanups.push(prepared.dispose)
      const loaded = prepared.load().then((module) => ({version: prepared.version, module}))
      sources.set(entrypoint, {loaded, files})
      return loaded.finally(() => Promise.all(watching))
    },
    dispose: () => {
      for (const cleanup of cleanups.splice(0)) cleanup()
      sources.clear()
    },
  }
}

type Source = {
  loaded: Promise<{version: string; module: unknown}>
  files: Map<string, {digest: Promise<string>; directory: boolean}>
}

async function unchanged(files: Source['files']) {
  const same = await Promise.all(
    [...files].map(async ([file, item]) => (await item.digest) === (await digest(file, item.directory))),
  )
  return same.every(Boolean)
}

async function digest(file: string, directory: boolean) {
  const content = await (
    directory ? readdir(file).then((entries) => JSON.stringify(entries.toSorted())) : readFile(file)
  ).catch(() => undefined)
  return content === undefined ? 'missing' : Hash.sha256(content)
}
