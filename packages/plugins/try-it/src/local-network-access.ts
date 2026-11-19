import {Effect, Schema, Stream, SubscriptionRef} from 'effect'

declare global {
  interface Permissions {
    query(descriptor: {name: 'local-network-access'}): Promise<PermissionStatus>
  }
}

export type LocalNetworkAccessState = 'unknown' | 'unsupported' | PermissionState

const PermissionUnsupported = Schema.TaggedStruct('TryIt.PermissionUnsupported', {cause: Schema.Defect()})
type PermissionUnsupported = typeof PermissionUnsupported.Type & globalThis.Error

const makePermissionUnsupported = (fields: Omit<typeof PermissionUnsupported.Type, '_tag'>): PermissionUnsupported =>
  Object.assign(new globalThis.Error(), PermissionUnsupported.make(fields), {name: 'TryIt.PermissionUnsupported'})

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
    catch: (cause) => makePermissionUnsupported({cause}),
  }).pipe(
    Effect.flatMap((status) => follow(state, status)),
    Effect.catchTag('TryIt.PermissionUnsupported', () => SubscriptionRef.set(state, 'unsupported')),
    Effect.forkScoped,
  )
  return state
})
