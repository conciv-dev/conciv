import {Context, Effect, Layer} from 'effect'
import {Entry, FindInput} from '../schema/filesystem.js'
import * as FileSystemSearch from './filesystem/search.js'

export {Entry, Match, Submatch} from '../schema/filesystem.js'
export {FindInput}

export interface Interface {
  readonly find: (input: FindInput) => Effect.Effect<Entry[]>
}

export const Service = Context.Service<Interface>('@conciv/FileSystem')

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const search = yield* FileSystemSearch.Service
    return Service.of({
      find: search.find,
    })
  }),
)
