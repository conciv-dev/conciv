import {readFile, readdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {Effect} from 'effect'
import {Hash} from '../util/hash.js'

type Run = <A>(effect: Effect.Effect<A>) => Promise<A>

export function createPluginSources(run: Run, watch: (file: string) => Effect.Effect<void>) {
  const sources = new Map<string, Source>()
  const cleanups: Array<() => void> = []
  const watching = new Set<Promise<void>>()
  return {
    read: async (entrypoint: string) => {
      await Promise.all(watching)
      const previous = sources.get(entrypoint)
      if (previous && (await unchanged(run, previous.files))) return previous.loaded

      const files: Source['files'] = new Map()
      const track = (file: string, directory = false) => {
        if (files.has(file)) return
        files.set(file, {digest: run(digest(file, directory)), directory})
        const pending = run(watch(file)).finally(() => watching.delete(pending))
        void pending.catch((error: unknown) =>
          run(
            Effect.logDebug('[plugin] watching a plugin source file failed; the plugin load reports it').pipe(
              Effect.annotateLogs({file, error}),
            ),
          ),
        )
        watching.add(pending)
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

async function unchanged(run: Run, files: Source['files']) {
  const same = await Promise.all(
    [...files].map(async ([file, item]) => (await item.digest) === (await run(digest(file, item.directory)))),
  )
  return same.every(Boolean)
}

function digest(file: string, directory: boolean): Effect.Effect<string> {
  const read = (): Promise<string | Buffer> =>
    directory ? readdir(file).then((entries) => JSON.stringify(entries.toSorted())) : readFile(file)
  return Effect.tryPromise(read).pipe(
    Effect.map((content) => Hash.sha256(content)),
    Effect.catch((error) =>
      Effect.logDebug('[plugin] a plugin source file could not be read, so it counts as missing').pipe(
        Effect.annotateLogs({file, error}),
        Effect.as('missing'),
      ),
    ),
  )
}
