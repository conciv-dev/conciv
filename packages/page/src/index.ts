import {PageQuerySchema, type PageOutcome} from '@conciv/protocol/page-types'
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

export async function servePageQueries(
  source: PageQuerySource,
  driver: PageDriver,
  signal: AbortSignal,
): Promise<void> {
  for await (const item of source.queries(signal)) {
    const parsed = PageQuerySchema.safeParse(item.query)
    if (!parsed.success) continue
    const requestId = item.requestId
    void driver.execute(parsed.data).then((outcome) => source.reply({requestId, outcome}).catch(() => {}))
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
