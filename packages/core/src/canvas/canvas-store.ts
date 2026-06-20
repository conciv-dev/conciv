import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'

// Durable snapshot of a canvas Yjs doc: one opaque binary blob (Y.encodeStateAsUpdate) per session,
// at <stateRoot>/.mandarax/canvas/<previewId>/<sessionId>.ybin. The store is byte-agnostic (no yjs
// import) — the relay owns the Y.Doc and hands bytes here. Factory is the swap seam (fs now, other
// backends later) mirroring createFsSessionStore.
export type CanvasStore = {
  load: (sessionId: string) => Promise<Uint8Array | null>
  save: (sessionId: string, snapshot: Uint8Array) => Promise<void>
}

export function createFsCanvasStore(opts: {stateRoot: string; previewId: string}): CanvasStore {
  const base = join(opts.stateRoot, '.mandarax', 'canvas', opts.previewId)
  const fileFor = (sessionId: string) => join(base, `${sessionId}.ybin`)
  return {
    load: async (sessionId) => {
      try {
        return new Uint8Array(await readFile(fileFor(sessionId)))
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw e
      }
    },
    save: async (sessionId, snapshot) => {
      const file = fileFor(sessionId)
      await mkdir(dirname(file), {recursive: true})
      await writeFile(file, snapshot)
    },
  }
}
