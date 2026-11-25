export * as ConfigPolicy from './policy.js'

import {Schema, SchemaGetter} from 'effect'

export const Effect = Schema.Literals(['allow', 'deny'])
export type Effect = typeof Effect.Type

export const Action = Schema.Literals([
  'provider.use',
  'tool.use',
  'integration.connect',
  'integration.use',
  'mcp.use',
  'skill.use',
  'plugin.use',
  'websearch.use',
])
export type Action = typeof Action.Type

const Statement = Schema.Struct({
  action: Action,
  resource: Schema.String,
  effect: Effect,
})

const legacy = new Map<string, Action>([
  ['mcp', 'mcp.use'],
  ['skill', 'skill.use'],
  ['plugin', 'plugin.use'],
])

export const Info = Statement.pipe(
  Schema.decodeTo(Schema.toType(Statement), {
    decode: SchemaGetter.transform((policy) => {
      if (policy.action !== 'integration.use') return policy
      const separator = policy.resource.indexOf(':')
      const action = separator === -1 ? undefined : legacy.get(policy.resource.slice(0, separator))
      if (!action) return policy
      return {...policy, action, resource: policy.resource.slice(separator + 1)}
    }),
    encode: SchemaGetter.passthrough(),
  }),
)
export type Info = typeof Info.Type
