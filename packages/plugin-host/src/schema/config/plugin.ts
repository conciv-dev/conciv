export * as ConfigPlugin from './plugin.js'

import {Schema} from 'effect'

export const Entry = Schema.Tuple([Schema.String, Schema.Record(Schema.String, Schema.Unknown)])
export type Entry = typeof Entry.Type

export const Plugin = Schema.Union([Schema.String, Entry])
export type Plugin = typeof Plugin.Type

export const Plugins = Plugin.pipe(Schema.Array)
