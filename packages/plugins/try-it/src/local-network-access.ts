import {Data, Effect, Stream, SubscriptionRef} from 'effect'

declare global {
  interface Permissions {
    query(descriptor: {name: 'local-network-access'}): Promise<PermissionStatus>
  }
}

export type LocalNetworkAccessState = 'unknown' | 'unsupported' | PermissionState

const PermissionUnsupported = Data.TaggedError('TryItPermissionUnsupported')<{readonly cause: unknown}>

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
    catch: (cause) => new PermissionUnsupported({cause}),
  }).pipe(
    Effect.flatMap((status) => follow(state, status)),
    Effect.catchTag('TryItPermissionUnsupported', () => SubscriptionRef.set(state, 'unsupported')),
    Effect.forkScoped,
  )
  return state
})
