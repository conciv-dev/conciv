import {Effect} from 'effect'
import type {QueryClient} from '@conciv/client'
import type {Desktop, MountedSession} from '@conciv/frontend-plugin-api'
import type {GrabFrame} from '@conciv/frontend-plugin-api/grab'
import type {LocateResult, Page, SourceLoc} from '@conciv/frontend-plugin-api/page'
import {Definition} from './rpc.js'
import {pageErrors} from './errors/errors.js'

export type OpenedSource = 'opened' | 'no-source' | 'failed'

export type SourceOpener = {
  locate: (element: Element) => Promise<LocateResult | null>
  symbolicate: (frames: readonly GrabFrame[]) => Promise<SourceLoc | null>
  desktop: Desktop | undefined
}

export function symbolicateInSession(routed: () => MountedSession | undefined, queryClient: QueryClient) {
  return (frames: Parameters<Page['symbolicate']>[0]['frames']) => {
    const session = routed()

    if (!session) return Promise.reject(pageErrors.SESSION_NOT_ROUTED())

    return queryClient.fetchQuery(
      session.server.client.rpc(Definition).symbolicate.queryOptions({input: {frames: [...frames]}}),
    )
  }
}

function attempt<A>(run: () => Promise<A>) {
  return Effect.tryPromise({
    try: run,
    catch: (cause) => pageErrors.SOURCE_OPEN_FAILED({cause: cause instanceof Error ? cause : undefined}),
  })
}

export const openSource = Effect.fn('Page.openSource')(
  function* (opener: SourceOpener, element: Element) {
    const located = yield* attempt(() => opener.locate(element))

    if (!located) return yield* Effect.fail(pageErrors.SOURCE_NOT_FOUND())
    const desktop = opener.desktop

    if (!desktop) return yield* Effect.fail(pageErrors.DESKTOP_UNAVAILABLE())
    const frames = located.frames.flatMap(({fileName, line, column}) =>
      fileName === undefined || line === undefined ? [] : [{fileName, line, column}],
    )
    const source = located.source ?? (frames.length > 0 ? yield* attempt(() => opener.symbolicate(frames)) : null)

    if (!source) return yield* Effect.fail(pageErrors.SOURCE_NOT_FOUND())
    yield* attempt(() => desktop.launch(source.file, {line: source.line, column: source.column}))
  },
  Effect.as<OpenedSource>('opened'),
  Effect.catch((error) =>
    Effect.succeed<OpenedSource>(error.code === pageErrors.SOURCE_NOT_FOUND.code ? 'no-source' : 'failed'),
  ),
)
