import {log} from 'evlog'
import {Cause, Duration, Effect, Option, Schedule, Semaphore, Stream} from 'effect'
import {z} from 'zod'
import type {ConcivClient} from '@conciv/client'
import {createEffectClient} from '@orpc/effect'
import {BrowserTab, type BrowserTabId} from '@conciv/protocol/schema/browser-tab'
import {SECRET_KEY} from '@conciv/types/secret-key'

export type OpenBrowserTab = {
  readonly client: Pick<ConcivClient, 'tabs' | 'event'>
  readonly sessionId: string
  readonly browserTab: {readonly id: BrowserTabId; readonly connectionId: string}
  readonly redact: (href: string) => string
  readonly refused: (title: string) => void
}

const TAB_EVENTS = ['focus', 'blur']

const URL_MAX = BrowserTab.shape.url.maxLength ?? Number.POSITIVE_INFINITY

const TITLE_MAX = BrowserTab.shape.title.maxLength ?? Number.POSITIVE_INFINITY

const REFUSED = 'This page couldn’t open in this session. Reload the page or start a new session.'

const STATE_RETRY = Schedule.max([Schedule.exponential(Duration.millis(250)), Schedule.recurs(6)])

const RpcCode = z.object({code: z.string()})

function readCode(cause: unknown) {
  return RpcCode.safeParse(cause).data?.code
}

function redactedPairs(text: string): string {
  const pairs = [...new URLSearchParams(text.slice(1))]
  if (!pairs.some(([key]) => SECRET_KEY.test(key))) return text
  return new URLSearchParams(pairs.map(([key, value]) => [key, SECRET_KEY.test(key) ? '[redacted]' : value])).toString()
}

function redactedUrl(href: string): string {
  const url = new URL(href)
  url.username = ''
  url.password = ''
  url.search = redactedPairs(url.search)
  url.hash = redactedPairs(url.hash)
  return url.href
}

export function readBrowserTab(id: BrowserTabId, redact: (href: string) => string): BrowserTab {
  return {
    id,
    url: redact(redactedUrl(location.href)).slice(0, URL_MAX),
    title: document.title.slice(0, TITLE_MAX),
    focused: document.hasFocus(),
    visible: document.visibilityState === 'visible',
  }
}

function reportRouteChanges(report: () => void, signal: AbortSignal) {
  if (typeof navigation === 'undefined') return
  navigation.addEventListener('currententrychange', report, {signal})
}

export function reportBrowserTabChanges(report: () => void, signal: AbortSignal) {
  TAB_EVENTS.forEach((type) => window.addEventListener(type, report, {signal}))
  document.addEventListener('visibilitychange', report, {signal})
  reportRouteChanges(report, signal)
  const last = {title: document.title}
  const titles = new MutationObserver(() => {
    if (document.title === last.title) return
    last.title = document.title
    report()
  })

  titles.observe(document.head, {childList: true, subtree: true, characterData: true})
  signal.addEventListener('abort', () => titles.disconnect(), {once: true})
}

const scopedSignal = Effect.acquireRelease(
  Effect.sync(() => new AbortController()),
  (controller) => Effect.sync(() => controller.abort()),
).pipe(Effect.map((controller) => controller.signal))

function sessionCreated(input: OpenBrowserTab, signal: AbortSignal) {
  return Stream.fromAsyncIterable(
    input.client.event.subscribe({types: ['session.created'], signal}),
    (cause) => cause,
  ).pipe(
    Stream.filter((event) => event.type === 'session.created' && event.data.sessionID === input.sessionId),
    Stream.runHead,
    Effect.map(Option.isSome),
  )
}

function held(input: OpenBrowserTab, signal: AbortSignal): Effect.Effect<void, unknown> {
  const opened = createEffectClient(input.client.tabs).open(
    {
      sessionId: input.sessionId,
      connectionId: input.browserTab.connectionId,
      tab: readBrowserTab(input.browserTab.id, input.redact),
    },
    {signal},
  )
  return opened.pipe(
    Effect.asVoid,
    Effect.catchIf(
      (cause) => readCode(cause) === 'NOT_FOUND',
      () => sessionCreated(input, signal).pipe(Effect.flatMap((born) => (born ? held(input, signal) : Effect.void))),
    ),
    Effect.catchIf(
      (cause) => readCode(cause) === 'UNAVAILABLE',
      () => Effect.sync(() => input.refused(REFUSED)),
    ),
  )
}

function reported(input: OpenBrowserTab, signal: AbortSignal) {
  return createEffectClient(input.client.tabs)
    .state(
      {
        sessionId: input.sessionId,
        connectionId: input.browserTab.connectionId,
        tab: readBrowserTab(input.browserTab.id, input.redact),
      },
      {signal},
    )
    .pipe(
      Effect.retry({schedule: STATE_RETRY, while: (cause) => readCode(cause) === 'UNAVAILABLE'}),
      Effect.catch((cause) =>
        Effect.sync(
          () =>
            signal.aborted ||
            log.warn({action: 'browser tab', message: 'reporting the browser tab failed', error: cause}),
        ),
      ),
      Effect.asVoid,
    )
}

export const openBrowserTab = Effect.fn('BrowserTab.open')(function* (input: OpenBrowserTab) {
  const signal = yield* scopedSignal
  const outbound = yield* Semaphore.make(1)
  const report = () => void Effect.runFork(outbound.withPermit(reported(input, signal)))
  reportBrowserTabChanges(report, signal)
  yield* held(input, signal).pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause) || signal.aborted
        ? Effect.void
        : Effect.sync(() =>
            log.warn({action: 'browser tab', message: 'the browser tab could not open', error: Cause.pretty(cause)}),
          ),
    ),
    Effect.forkScoped,
  )
})
