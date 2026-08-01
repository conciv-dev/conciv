import {PageQuerySchema} from '@conciv/protocol/page-types'
import type {RpcClient} from '@conciv/contract'
import {makeDomPageDriver, type PageDriver} from './page-driver.js'

export {makeDomPageDriver, type PageDriver} from './page-driver.js'
export {grabApi} from './grab-api.js'
export {picking, cancelPick} from './react-grab/picking.js'
export {getReactGrabAdapter, type ReactGrabAdapter} from './react-grab/adapter.js'
export {describe, locate, installReactBridge, rootFibers} from './react-bridge.js'
export {dehydrate, type DehydrateOptions} from './dehydrate.js'
export {showToast} from './effect-toast.js'
export {addRef, type Refs} from './page-snapshot.js'
export {
  registerExtensionPageVerbs,
  unregisterExtensionPageVerbs,
  clearExtensionPageVerbs,
  bindExtensionPageVerbs,
} from './page-verb-registry.js'
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

async function serveQueries(rpc: RpcClient, driver: PageDriver, signal: AbortSignal): Promise<void> {
  const iterator = await rpc.page.queries(undefined, {signal})
  for await (const item of iterator) {
    const parsed = PageQuerySchema.safeParse(item.query)
    if (!parsed.success) continue
    const requestId = item.requestId
    void driver.execute(parsed.data).then((data) => rpc.page.reply({requestId, data}).catch(() => {}))
  }
}

async function pump(rpc: RpcClient, driver: PageDriver, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      await serveQueries(rpc, driver, signal)
    } catch {
      if (signal.aborted) return
    }
    await sleep(500, signal)
  }
}

export function startPagePlane(opts: {rpc: RpcClient; document: Document; driver?: PageDriver}): {
  dispose: () => void
} {
  const driver = opts.driver ?? makeDomPageDriver()
  const abort = new AbortController()
  void pump(opts.rpc, driver, abort.signal)
  return {dispose: () => abort.abort()}
}
