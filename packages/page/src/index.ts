import PQueue from 'p-queue'
import {
  PAGE_QUEUE_STOPPED,
  PageQuerySchema,
  PageQueueActionsSchema,
  type PageOutcome,
  type PageQuery,
} from '@conciv/protocol/page-types'
import type {ClientToolEntry} from '@conciv/extension'
import {makeDomPageDriver, type PageDriver} from './page-driver.js'

export {makeDomPageDriver, type PageDriver} from './page-driver.js'
export {grabApi} from './grab-api.js'
export {fitImagePreview} from './grab-fit.js'
export {picking, cancelPick} from './react-grab/picking.js'
export {getReactGrabAdapter, type ReactGrabAdapter} from './react-grab/adapter.js'
export {describe, locate, installReactBridge, rootFibers} from './react-bridge.js'
export {dehydrate, navigatePath, type DehydrateOptions} from './dehydrate.js'
export {showToast} from './effect-toast.js'
export {addRef, buildSnapshot, describeElement, DOM_CAP, type RefAdder, type Refs} from './page-snapshot.js'
export {isSensitiveField, MASKED_VALUE} from './element-descriptor.js'
export {startTracking, stopTracking, report as trackReport} from './render-tracker.js'
export * as reactBridge from './react-bridge.js'

export type PageQuerySource = {
  queries: (abortSignal?: AbortSignal) => AsyncIterable<{requestId: string; query: unknown}>
  reply: (input: {requestId: string; outcome: PageOutcome}) => Promise<unknown>
}

type Played = {source: PageQuerySource; driver: PageDriver; lane: PQueue}

function replyTo(source: PageQuerySource, requestId: string, outcome: PageOutcome): Promise<void> {
  return source.reply({requestId, outcome}).then(
    () => undefined,
    (error: unknown) => console.error(`[conciv] the page reply to ${requestId} could not be sent`, error),
  )
}

async function acceptance(source: PageQuerySource, requestId: string, outcome: PageOutcome): Promise<PageOutcome> {
  try {
    await source.reply({requestId, outcome})
    return outcome
  } catch (error) {
    console.error(`[conciv] the page reply to ${requestId} could not be sent`, error)
    const message = `the page could not confirm the queue to the engine, so its actions did not run: ${String(error)}`
    return {ok: false, error: {code: 'handler-error', message}}
  }
}

function unplayed(name: string, error: unknown): PageOutcome {
  if (error instanceof DOMException && error.name === 'AbortError') {
    const message = `the page closed before ${name} ran; it did not run`
    return {ok: false, error: {code: 'handler-error', message, raised: {code: PAGE_QUEUE_STOPPED, message}}}
  }
  return {ok: false, error: {code: 'handler-error', message: `${name} failed to play: ${String(error)}`}}
}

function inLane(played: Played, requestId: string, name: string, play: () => Promise<PageOutcome>): void {
  void played.lane.add(play).then(
    (outcome) => replyTo(played.source, requestId, outcome),
    (error: unknown) => replyTo(played.source, requestId, unplayed(name, error)),
  )
}

function playQueue(played: Played, requestId: string, query: PageQuery): void {
  const queue = query.queue
  if (queue === undefined) return
  const {source, driver} = played
  const of = queue.replies.length
  const listed = PageQueueActionsSchema.safeParse(query.input)
  const accepted = driver
    .execute({agentId: query.agentId, name: query.name, input: query.input, queued: {id: queue.id, index: -1, of}})
    .then((outcome) => acceptance(source, requestId, outcome))
  queue.replies.forEach((replyId, index) => {
    const action = listed.success ? listed.data.actions[index] : undefined
    if (action === undefined) {
      const message = `queued action ${index} is not a page action`
      void replyTo(source, replyId, {ok: false, error: {code: 'invalid-args', message}})
      return
    }
    const {tool, ...input} = action
    inLane(played, replyId, tool, async () => {
      const ready = await accepted
      if (!ready.ok) return ready
      return driver.execute({
        agentId: query.agentId,
        name: tool,
        input,
        mutating: true,
        queued: {id: queue.id, index, of},
      })
    })
  })
}

export async function servePageQueries(
  source: PageQuerySource,
  driver: PageDriver,
  signal: AbortSignal,
): Promise<void> {
  const played: Played = {source, driver, lane: new PQueue({concurrency: 1})}
  signal.addEventListener('abort', () => played.lane.clear(), {once: true})
  for await (const item of source.queries(signal)) {
    const parsed = PageQuerySchema.safeParse(item.query)
    if (!parsed.success) continue
    const requestId = item.requestId
    const query = parsed.data
    if (query.queue !== undefined) {
      playQueue(played, requestId, query)
      continue
    }
    if (query.mutating === true && played.lane.size + played.lane.pending > 0) {
      inLane(played, requestId, query.name, () => driver.execute(query))
      continue
    }
    void driver.execute(query).then((outcome) => replyTo(source, requestId, outcome))
  }
}

export function startPagePlane(opts: {
  source: PageQuerySource
  driver?: PageDriver
  tools?: readonly ClientToolEntry[]
}): {
  dispose: () => void
} {
  const driver = opts.driver ?? makeDomPageDriver({tools: opts.tools})
  const abort = new AbortController()
  void servePageQueries(opts.source, driver, abort.signal).catch(() => {})
  return {dispose: () => abort.abort()}
}
