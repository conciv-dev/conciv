export * as Database from './database.js'

import type {makeWithDefaults} from 'drizzle-orm/effect-sqlite-node'
import {Context, Schema, type Effect} from 'effect'

type DatabaseShape = Effect.Success<ReturnType<typeof makeWithDefaults>>

export interface Interface {
  db: DatabaseShape
}

export const Options = Schema.Struct({
  path: Schema.optional(Schema.String),
})
export type Options = typeof Options.Type

export const Service = Context.Service<Interface>('@conciv/storage/Database')
