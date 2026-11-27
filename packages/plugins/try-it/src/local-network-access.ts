import {Effect, Stream, SubscriptionRef} from 'effect'
import {tryItErrors} from './errors/errors.js'

declare global {
  interface Permissions {
    query(descriptor: {name: 'local-network-access'}): Promise<PermissionStatus>
  }
}

export type LocalNetworkAccessState = 'unknown' | 'unsupported' | PermissionState

const follow = (state: SubscriptionRef.SubscriptionRef<LocalNetworkAccessState>, status: PermissionStatus) =>
  SubscriptionRef.set(state, status.state).pipe(
    Effect.andThen(
      Stream.fromEventListener(status, 'change').pipe(
        Stream.runForEach(() => SubscriptionRef.set(state, status.state)),
      ),
    ),
  )

export const localNetworkAccess = Effect.fn('try-it.localNetworkAccess')(function* () {
  const state = yield* SubscriptionRef.make<LocalNetworkAccessState>('unknown')
  yield* Effect.tryPromise({
    try: () => navigator.permissions.query({name: 'local-network-access'}),
    catch: (cause) => tryItErrors.PERMISSION_UNSUPPORTED({cause: cause instanceof Error ? cause : undefined}),
  }).pipe(
    Effect.flatMap((status) => follow(state, status)),
    Effect.catchIf(
      (error) => error.code === tryItErrors.PERMISSION_UNSUPPORTED.code,
      () => SubscriptionRef.set(state, 'unsupported'),
    ),
    Effect.forkScoped,
  )
  return state
})
