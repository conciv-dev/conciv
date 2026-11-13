import {Agent} from '../schema/agent.js'
import {Permission} from '../schema/permission.js'
import {Schema} from 'effect'

export const AssertInput = Schema.Struct({
  sessionId: Permission.Request.fields.sessionId,
  agent: Agent.Id.pipe(Schema.optional),
  action: Permission.Request.fields.action,
  resources: Permission.Request.fields.resources,
  save: Permission.Request.fields.save,
  metadata: Permission.Request.fields.metadata,
  source: Permission.Request.fields.source,
})
export interface AssertInput extends Schema.Schema.Type<typeof AssertInput> {}
