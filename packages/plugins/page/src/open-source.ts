import {Data, Effect} from 'effect'
import type {QueryClient} from '@conciv/client'
import type {Desktop, MountedSession} from '@conciv/plugin/experimental'
import type {GrabFrame} from '@conciv/plugin/experimental/grab'
import type {Page, SourceLoc} from '@conciv/plugin/experimental/page'
import type {LocateResult} from './contract.js'
import {Definition} from './rpc.js'

export type OpenedSource = 'opened' | 'no-source' | 'failed'

export type SourceOpener = {
  locate: (element: Element) => Promise<LocateResult | null>
  symbolicate: (frames: readonly GrabFrame[]) => Promise<SourceLoc | null>
  desktop: Desktop | undefined
}

export function symbolicateInSession(routed: () => MountedSession | undefined, queryClient: QueryClient) {
  return (frames: Parameters<Page['symbolicate']>[0]['frames']) => {
    const session = routed()

    if (!session) return Promise.reject(new Error('Page.symbolicate needs a routed session'))

    return queryClient.fetchQuery(
      session.server.client.rpc(Definition).symbolicate.queryOptions({input: {frames: [...frames]}}),
    )
  }
}

const NoDesktop = Data.TaggedError('OpenSourceNoDesktop')<Record<never, never>>
const NoSource = Data.TaggedError('OpenSourceNoSource')<Record<never, never>>
const OpenFailed = Data.TaggedError('OpenSourceFailed')<{readonly cause: unknown}>

function attempt<A>(run: () => Promise<A>) {
  return Effect.tryPromise({try: run, catch: (cause) => new OpenFailed({cause})})
}

function settle(outcome: OpenedSource) {
  return () => Effect.succeed(outcome)
}

export const openSource = Effect.fn('Page.openSource')(
  function* (opener: SourceOpener, element: Element) {
    const located = yield* attempt(() => opener.locate(element))

    if (!located) return yield* new NoSource()
    const desktop = opener.desktop

    if (!desktop) return yield* new NoDesktop()
    const frames = located.frames.flatMap(({fileName, line, column}) =>
      fileName === undefined || line === undefined ? [] : [{fileName, line, column}],
    )
    const source = located.source ?? (frames.length > 0 ? yield* attempt(() => opener.symbolicate(frames)) : null)

    if (!source) return yield* new NoSource()
    yield* attempt(() => desktop.launch(source.file, {line: source.line, column: source.column}))
  },
  Effect.as<OpenedSource>('opened'),
  Effect.catchTags({
    OpenSourceNoSource: settle('no-source'),
    OpenSourceNoDesktop: settle('failed'),
    OpenSourceFailed: settle('failed'),
  }),
)
