import {PageQuerySchema, PageQueueActionsSchema, type PageOutcome, type PageQuery} from '@conciv/protocol/page-types'
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

type Lane = {tail: Promise<void>; queued: number}

type Played = {source: PageQuerySource; driver: PageDriver; lane: Lane; signal: AbortSignal}

function replyTo(source: PageQuerySource, requestId: string, outcome: PageOutcome): Promise<void> {
  return source.reply({requestId, outcome}).then(
    () => undefined,
    (error: unknown) => console.error(`[conciv] the page reply to ${requestId} could not be sent`, error),
  )
}

function inLane(lane: Lane, play: () => Promise<void>): void {
  lane.queued += 1
  lane.tail = lane.tail
    .then(play)
    .catch((error: unknown) => console.error('[conciv] a queued page action failed to play', error))
    .finally(() => {
      lane.queued -= 1
    })
}

function playQueue(played: Played, requestId: string, query: PageQuery): void {
  const queue = query.queue
  if (queue === undefined) return
  const {source, driver, lane, signal} = played
  const of = queue.replies.length
  const listed = PageQueueActionsSchema.safeParse(query.input)
  const accepted = driver.execute({
    agentId: query.agentId,
    name: query.name,
    input: query.input,
    queued: {id: queue.id, index: -1, of},
  })
  void accepted.then((outcome) => replyTo(source, requestId, outcome))
  queue.replies.forEach((replyId, index) =>
    inLane(lane, async () => {
      const action = listed.success ? listed.data.actions[index] : undefined
      if (signal.aborted || action === undefined || !(await accepted).ok) return
      const {tool, ...input} = action
      const outcome = await driver.execute({
        agentId: query.agentId,
        name: tool,
        input,
        mutating: true,
        queued: {id: queue.id, index, of},
      })
      await replyTo(source, replyId, outcome)
    }),
  )
}

export async function servePageQueries(
  source: PageQuerySource,
  driver: PageDriver,
  signal: AbortSignal,
): Promise<void> {
  const played: Played = {source, driver, lane: {tail: Promise.resolve(), queued: 0}, signal}
  for await (const item of source.queries(signal)) {
    const parsed = PageQuerySchema.safeParse(item.query)
    if (!parsed.success) continue
    const requestId = item.requestId
    const query = parsed.data
    if (query.queue !== undefined) {
      playQueue(played, requestId, query)
      continue
    }
    const answer = (): Promise<void> => driver.execute(query).then((outcome) => replyTo(source, requestId, outcome))
    if (query.mutating === true && played.lane.queued > 0) {
      inLane(played.lane, answer)
      continue
    }
    void answer()
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
