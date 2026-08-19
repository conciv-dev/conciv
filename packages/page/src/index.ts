import {PageQuerySchema} from '@conciv/protocol/page-types'
import type {RpcClient} from '@conciv/contract'
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

async function sleep(
  ms: number,
  signal: AbortSignal,
  subscribeOnline?: (listener: () => void) => () => void,
): Promise<void> {
  await new Promise<void>((resolve) => {
    const finish = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      unsubscribe?.()
      resolve()
    }
    const onAbort = (): void => finish()
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', onAbort, {once: true})
    const unsubscribe = subscribeOnline?.(finish)
  })
}

export type PagePlaneRpc = {
  page: {
    queries: RpcClient['page']['queries']
    reply: RpcClient['page']['reply']
  }
}

async function serveQueries(
  rpc: PagePlaneRpc,
  driver: PageDriver,
  sessionId: string,
  signal: AbortSignal,
): Promise<void> {
  const iterator = await rpc.page.queries({sessionId}, {signal})
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
  sessionId: string,
  signal: AbortSignal,
  isOnline: () => boolean,
  subscribeOnline?: (listener: () => void) => () => void,
): Promise<void> {
  while (!signal.aborted) {
    try {
      await serveQueries(rpc, driver, sessionId, signal)
    } catch {
      if (signal.aborted) return
    }
    await sleep(pagePlanePollDelayMs(isOnline), signal, subscribeOnline)
  }
}

export function startPagePlane(opts: {
  rpc: RpcClient
  document: Document
  sessionId?: string
  driver?: PageDriver
  tools?: readonly ClientToolEntry[]
  isOnline?: () => boolean
  subscribeOnline?: (listener: () => void) => () => void
}): {
  dispose: () => void
} {
  const driver = opts.driver ?? makeDomPageDriver({tools: opts.tools})
  const abort = new AbortController()
  void pump(opts.rpc, driver, opts.sessionId ?? '', abort.signal, opts.isOnline ?? (() => true), opts.subscribeOnline)
  return {dispose: () => abort.abort()}
}
