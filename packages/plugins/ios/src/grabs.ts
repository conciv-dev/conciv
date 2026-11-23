import {Effect, FileSystem, Path} from 'effect'
import {CONCIV_STATE_DIR} from '@conciv/protocol/state-types'
import {PromptPresentationSchema} from '@conciv/protocol/chat-message-types'
import type {Context} from '@conciv/plugin/effect/plugin'
import type {SessionPrompt} from '@conciv/plugin/effect/session'
import {Definition, GRAB_NOTE_ORIGIN, GrabId, readGrabId, StoredGrab} from './rpc.js'

export const makeGrabStore = Effect.fn('ios.grabs.store')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directory = path.join(root, CONCIV_STATE_DIR, 'ios', 'grabs')
  const file = (id: GrabId) => path.join(directory, `${id}.json`)

  const save = (grab: StoredGrab) =>
    Effect.gen(function* () {
      const id = GrabId.parse(`grab_${crypto.randomUUID()}`)
      yield* fs.makeDirectory(directory, {recursive: true})
      yield* fs.writeFileString(`${file(id)}.tmp`, JSON.stringify(grab), {flag: 'wx'})
      yield* fs.rename(`${file(id)}.tmp`, file(id))
      return id
    })

  const get = (id: GrabId) =>
    fs.readFileString(file(id)).pipe(
      Effect.flatMap((raw) => Effect.try(() => StoredGrab.parse(JSON.parse(raw)))),
      Effect.orElseSucceed(() => null),
    )

  return {save, get}
})

type GrabStore = Effect.Success<ReturnType<typeof makeGrabStore>>

function addPictures(store: GrabStore) {
  return Effect.fn('ios.grabs.addPictures')(function* (input: SessionPrompt) {
    const notes = PromptPresentationSchema.safeParse(input.metadata).data?.comments ?? []
    const ids = notes.flatMap((note) => (note.origin === GRAB_NOTE_ORIGIN ? readGrabId(note.href) : []))
    for (const id of ids) {
      const grab = yield* store.get(id)
      if (grab?.preview === null || grab?.preview === undefined) continue
      input.prompt.files = [...(input.prompt.files ?? []), {uri: grab.preview.dataUrl}]
    }
  })
}

export const serveGrabs = Effect.fn('ios.grabs.serve')(function* (ctx: Pick<Context, 'rpc' | 'session' | 'location'>) {
  const grabs = yield* makeGrabStore(ctx.location.directory)
  yield* ctx.rpc
    .register(Definition, {
      'grabs.save': (input, call) =>
        grabs.save(input.grab).pipe(
          Effect.map((id) => ({id})),
          Effect.catch((error) =>
            Effect.logWarning('Saving a grabbed native view failed', error).pipe(
              Effect.andThen(Effect.fail(call.error('unavailable', 'The grabbed view could not be saved.', {}))),
            ),
          ),
        ),
      'grabs.get': (input) => grabs.get(input.id),
    })
    .pipe(Effect.orDie)
  yield* ctx.session.hook('prompt', addPictures(grabs))
})
