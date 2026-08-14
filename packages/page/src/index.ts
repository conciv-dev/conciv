import {PageQuerySchema} from '@conciv/protocol/page-types'
import type {RpcClient} from '@conciv/contract'
import type {ClientToolEntry} from '@conciv/extension'
import {makeDomPageDriver, type PageDriver} from './page-driver.js'

export {makeDomPageDriver, type PageDriver} from './page-driver.js'
export {grabApi} from './grab-api.js'
export {picking, cancelPick} from './react-grab/picking.js'
export {getReactGrabAdapter, type ReactGrabAdapter} from './react-grab/adapter.js'
export {describe, locate, installReactBridge, rootFibers} from './react-bridge.js'
export {dehydrate, navigatePath, type DehydrateOptions} from './dehydrate.js'
export {showToast} from './effect-toast.js'
export {addRef, buildSnapshot, describeElement, DOM_CAP, type RefAdder, type Refs} from './page-snapshot.js'
export {isSensitiveField, MASKED_VALUE} from './element-descriptor.js'
export {startTracking, stopTracking, report as trackReport} from './render-tracker.js'
export * as reactBridge from './react-bridge.js'

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      {once: true},
    )
  })
}

export type PagePlaneRpc = {
  page: {
    queries: RpcClient['page']['queries']
    reply: RpcClient['page']['reply']
  }
}

async function serveQueries(rpc: PagePlaneRpc, driver: PageDriver, signal: AbortSignal): Promise<void> {
  const iterator = await rpc.page.queries(undefined, {signal})
  for await (const item of iterator) {
    const parsed = PageQuerySchema.safeParse(item.query)
    if (!parsed.success) continue
    const requestId = item.requestId
    void driver.execute(parsed.data).then((outcome) => rpc.page.reply({requestId, outcome}).catch(() => {}))
  }
}

const PAGE_PLANE_POLL_MS = 500
const PAGE_PLANE_OFFLINE_POLL_MS = 2000

export function pagePlanePollDelayMs(isOnline: () => boolean): number {
  return isOnline() ? PAGE_PLANE_POLL_MS : PAGE_PLANE_OFFLINE_POLL_MS
}

export async function pump(
  rpc: PagePlaneRpc,
  driver: PageDriver,
  signal: AbortSignal,
  isOnline: () => boolean,
): Promise<void> {
  while (!signal.aborted) {
    try {
      await serveQueries(rpc, driver, signal)
    } catch {
      if (signal.aborted) return
    }
    await sleep(pagePlanePollDelayMs(isOnline), signal)
  }
}

export function startPagePlane(opts: {
  rpc: RpcClient
  document: Document
  driver?: PageDriver
  tools?: readonly ClientToolEntry[]
  isOnline?: () => boolean
}): {
  dispose: () => void
} {
  const driver = opts.driver ?? makeDomPageDriver({tools: opts.tools})
  const abort = new AbortController()
  void pump(opts.rpc, driver, abort.signal, opts.isOnline ?? (() => true))
  return {dispose: () => abort.abort()}
}
