import {defineExtension} from '@conciv/extension'
import {buildErrorToAppError, makeDiagnosticsRing} from './server/diagnostics.js'
import {makeServerFnTraceRing} from './server/serverfn-trace.js'
import {readRouteManifest} from './server/route-manifest.js'
import {makeTanstackAdapter} from './server/adapter.js'
import type {tanstackVerbs} from './client/verbs.js'
import {
  backServer,
  buildErrorsServer,
  loaderDataServer,
  navigateServer,
  queryCacheServer,
  queryInvalidateServer,
  queryRefetchServer,
  routeManifestServer,
  routeTreeServer,
  routerInvalidateServer,
  routerStateServer,
  serverFnTraceServer,
} from './tool/server.js'

export const tanstack = defineExtension({
  name: 'tanstack',
  tools: [
    routerStateServer,
    routeTreeServer,
    loaderDataServer,
    queryCacheServer,
    navigateServer,
    routerInvalidateServer,
    backServer,
    queryInvalidateServer,
    queryRefetchServer,
    buildErrorsServer,
    routeManifestServer,
    serverFnTraceServer,
  ],
})
  .pageVerbs<typeof tanstackVerbs>()
  .server((server) => {
    const ring = makeDiagnosticsRing()
    const serverFnRing = makeServerFnTraceRing()
    const bundler = server.bundler
    const bundlerAvailable = typeof bundler?.subscribe === 'function'
    const unsubscribe = bundler?.subscribe?.((diagnostic) => {
      if (diagnostic.kind === 'build-error') ring.push(buildErrorToAppError(diagnostic))
      serverFnRing.observe(diagnostic)
    })
    const adapter = makeTanstackAdapter({
      page: server.page,
      buildErrors: () => {
        if (!bundlerAvailable) throw new Error('bundler bridge unavailable')
        return ring.list()
      },
      routeManifest: () => readRouteManifest(server.cwd),
      serverFnTraces: (count) => serverFnRing.traces(count),
      serverFns: () => serverFnRing.functions(),
      bundlerSubscribe: (listener) => bundler?.subscribe?.(listener) ?? (() => {}),
    })
    return {
      context: {adapter},
      dispose: () => unsubscribe?.(),
    }
  })

export default tanstack
