import {Effect, FileSystem, Option, Path} from 'effect'
import {designErrors} from '../errors/errors.js'
import type {AttachedFigma} from './figma.js'

const JSON_EXTENSION = '.json'
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const SHOWN_REF = 80

export const readAttached = Effect.fn('design.readAttached')(function* (input: {
  directory: string
  document: unknown
  image: string | undefined
}) {
  if (input.document === undefined || input.image === undefined) return null
  const attached: AttachedFigma = {
    document: yield* documentBody({directory: input.directory, document: input.document}),
    image: yield* imageBytes({directory: input.directory, ref: input.image}),
  }
  return attached
})

const documentBody = Effect.fn('design.attachedDocument')(function* (input: {directory: string; document: unknown}) {
  const {document} = input
  if (typeof document !== 'string') return document
  if (URL.canParse(document) || !document.toLowerCase().endsWith(JSON_EXTENSION)) return yield* parsedJson(document)
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const stored = yield* fs
    .readFileString(path.resolve(input.directory, document))
    .pipe(Effect.mapError(() => designErrors.FIGMA_NO_DOCUMENT({file: document})))
  return yield* parsedJson(stored)
})

function parsedJson(text: string) {
  return Effect.try({
    try: (): unknown => JSON.parse(text),
    catch: () => designErrors.FIGMA_DOCUMENT({detail: 'it is not JSON'}),
  })
}

const imageBytes = Effect.fn('design.attachedImage')(function* (input: {directory: string; ref: string}) {
  const {ref} = input
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const unreadable = designErrors.IMAGE_UNREADABLE({ref: ref.slice(0, SHOWN_REF)})
  const file = yield* fs.readFile(path.resolve(input.directory, ref)).pipe(Effect.option)
  if (Option.isSome(file)) return file.value
  const decoded = Uint8Array.from(Buffer.from(ref, 'base64'))
  if (PNG_SIGNATURE.every((byte, index) => decoded[index] === byte)) return decoded
  return yield* Effect.fail(unreadable)
})
