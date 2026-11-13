export * as Agent from './agent.js'

import {Schema} from 'effect'

export const ID = Schema.String.pipe(Schema.brand('Agent.ID'), Schema.annotate({identifier: 'Agent.ID'}))
export type ID = typeof ID.Type
