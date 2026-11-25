export * as ManagedPolicy from './managed-policy.js'

import {Context} from 'effect'
import {Wildcard} from './util/wildcard.js'
import {ConfigPolicy} from '../schema/config/policy.js'

export const ConfiguredPolicies = Context.Service<readonly ConfigPolicy.Info[]>('@conciv/ConfiguredPolicies')

export function statements(policies: readonly ConfigPolicy.Info[]) {
  return policies.map((policy) => ({
    ...policy,
    message: 'Blocked by configuration policy',
  }))
}

export function match<Policy extends ConfigPolicy.Info>(
  policies: readonly Policy[],
  action: ConfigPolicy.Action,
  resource: string,
) {
  return policies.findLast((policy) => policy.action === action && Wildcard.match(resource, policy.resource))
}

export function decision(policies: readonly ConfigPolicy.Info[], action: ConfigPolicy.Action, resource: string) {
  return match(policies, action, resource)?.effect ?? 'allow'
}
