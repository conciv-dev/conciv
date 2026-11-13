import fs from 'fs'
import {Context, Effect, Layer} from 'effect'
import {Flock} from './flock.js'

export const Service = Context.Service<Interface>('@opencode/Global')

export interface Interface {
  readonly cache: string
  readonly state: string
}

const acquire = (input: Interface) =>
  Effect.gen(function* () {
    const service = Service.of(input)
    yield* Effect.promise(() =>
      Promise.all([service.cache, service.state].map((directory) => fs.promises.mkdir(directory, {recursive: true}))),
    )
    Flock.setGlobal({state: service.state})
    return service
  })

export const layerWith = (input: Interface) => Layer.effect(Service, acquire(input))

export * as Global from './global.js'
