import {Schema} from 'effect'
import {SessionId} from '@conciv/protocol/schema/session-id'

const Shell = Schema.Struct({
  kind: Schema.Literal('shell'),
  sessionID: SessionId,
  shellID: Schema.String,
  command: Schema.String,
})
const Image = Schema.Struct({
  kind: Schema.Literal('image'),
  sessionID: SessionId,
  path: Schema.String,
  model: Schema.String,
})
const subagent = {
  kind: Schema.Literal('subagent'),
  childSessionID: SessionId,
  agent: Schema.String,
  description: Schema.String,
}

const CodeMode = Schema.Struct({kind: Schema.Literal('codemode'), sessionID: SessionId, jobID: Schema.String})
const PageQueue = Schema.Struct({kind: Schema.Literal('page-queue'), sessionID: SessionId, queueId: Schema.String})
const OutstandingItem = Schema.Union([
  Shell,
  Image,
  CodeMode,
  PageQueue,
  Schema.Struct({...subagent, sessionID: SessionId}),
])
export type OutstandingItem = typeof OutstandingItem.Type

export const RecoverySchema = Schema.Union([
  CodeMode,
  PageQueue,
  Shell,
  Image,
  Schema.Struct({
    ...subagent,
    parentSessionID: SessionId,
    outstanding: Schema.optionalKey(Schema.Array(OutstandingItem)),
  }),
])

export type Recovery = typeof RecoverySchema.Type
