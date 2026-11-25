import {mkdir, readFile, rename, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {Effect} from 'effect'
import {CONCIV_STATE_DIR} from '@conciv/types/state-types'
import {PromptPresentationSchema} from '@conciv/types/chat-message-types'
import type {SessionPrompt} from '@conciv/backend-plugin-api/effect/session'
import {GRAB_NOTE_ORIGIN, GrabId, readGrabId, StoredGrab} from './rpc.js'

export type GrabStore = ReturnType<typeof makeGrabStore>

export function makeGrabStore(root: string) {
  const directory = join(root, CONCIV_STATE_DIR, 'page', 'grabs')
  const file = (id: GrabId) => join(directory, `${id}.json`)

  const save = (grab: StoredGrab) =>
    Effect.tryPromise(async () => {
      const id = GrabId.parse(`grab_${crypto.randomUUID()}`)
      await mkdir(directory, {recursive: true})
      await writeFile(`${file(id)}.tmp`, JSON.stringify(grab), {flag: 'wx'})
      await rename(`${file(id)}.tmp`, file(id))
      return id
    })

  const get = (id: GrabId) =>
    Effect.tryPromise(async () => StoredGrab.parse(JSON.parse(await readFile(file(id), 'utf8')))).pipe(
      Effect.orElseSucceed(() => null),
    )

  return {save, get}
}

export function addPictures(store: GrabStore) {
  return Effect.fn('page.grabs.addPictures')(function* (input: SessionPrompt) {
    const notes = PromptPresentationSchema.safeParse(input.metadata).data?.comments ?? []
    const ids = notes.flatMap((note) => (note.origin === GRAB_NOTE_ORIGIN ? readGrabId(note.href) : []))
    for (const id of ids) {
      const grab = yield* store.get(id)
      if (grab?.preview?.kind !== 'image') continue
      input.prompt.files = [...(input.prompt.files ?? []), {uri: grab.preview.dataUrl}]
    }
  })
}
