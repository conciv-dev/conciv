export * as Agent from './agent.js'

import {Schema} from 'effect'

export const Id = Schema.String.pipe(Schema.brand('Agent.ID'), Schema.annotate({identifier: 'Agent.ID'}))
export type Id = typeof Id.Type
