import {Data, Effect} from 'effect'
import type {Desktop} from '@conciv/plugin/experimental'
import type {GrabFrame} from '@conciv/plugin/experimental/grab'
import type {LocateResult, SourceLoc} from '@conciv/plugin/experimental/page'

export type OpenedSource = 'opened' | 'no-source' | 'failed'

export type SourceOpener = {
  locate: (element: Element) => Promise<LocateResult | null>
  symbolicate: (frames: readonly GrabFrame[]) => Promise<SourceLoc | null>
  desktop: Desktop | undefined
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
