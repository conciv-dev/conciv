export * as InstructionEntry from './instruction-entry.js'

import {Schema} from 'effect'

export const Key = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9._-]*$/u)).annotate({
  identifier: 'InstructionEntry.Key',
  description: 'Instruction entry key (lowercase alphanumerics plus . _ -)',
})
export type Key = typeof Key.Type

export const Info = Schema.Struct({
  key: Key,
  value: Schema.Json.annotate({description: "JSON value attached to the session's instructions"}),
}).annotate({identifier: 'InstructionEntry.Info'})
export interface Info extends Schema.Schema.Type<typeof Info> {}

export const Snapshot = Schema.Array(
  Schema.Struct({
    ...Info.fields,
    removed: Schema.Boolean,
  }),
).annotate({identifier: 'InstructionEntry.Snapshot'})
export type Snapshot = typeof Snapshot.Type

export const MaxValueBytes = 256 * 1024

export const ValueTooLargeError = Schema.TaggedStruct('InstructionEntryValueTooLargeError', {
  actualBytes: Schema.Int,
  maxBytes: Schema.Int,
  message: Schema.String,
}).annotate({httpApiStatus: 413})
export type ValueTooLargeError = typeof ValueTooLargeError.Type & globalThis.Error

export const makeValueTooLargeError = (fields: Omit<typeof ValueTooLargeError.Type, '_tag'>): ValueTooLargeError =>
  Object.assign(new globalThis.Error(fields.message), ValueTooLargeError.make(fields), {
    name: 'InstructionEntryValueTooLargeError',
  })
