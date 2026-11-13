import {Effect} from 'effect'
import {ManagedPolicy} from '../../../src/core/managed-policy.js'
import type {ConfigPolicy} from '../../../src/schema/config/policy.js'

export const setOrganizationPolicy =
  (policies: readonly ConfigPolicy.Info[] | undefined) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provideService(ManagedPolicy.ConfiguredPolicies, policies ?? []))
