import type {Page} from 'playwright'
import type {AnyExtension} from '@conciv/extension'
import type {HarnessAdapter} from '@conciv/harness'
import {bootExtensionServer} from './boot-server.js'
import {
  makeApprovingCallTool,
  makeCallTool,
  makeDiscoverTools,
  makeRunTypescript,
  resolveSession,
  type CallTool,
  type DiscoverTools,
  type RunTypescript,
} from '@conciv/harness-testkit'
import {magicLink} from '@conciv/harness-testkit/login'
import {launch, openObservedPage} from './launch.js'
import {rpcObserverFor} from './rpc-observer.js'
import {settleTeardown, type TeardownStep} from './settle-teardown.js'

export type HostEngine = {apiBase: string; session: string}
export type HostHandle = {origin: string; close: () => Promise<void>}

export type ExtensionUnderTest = {
  server: AnyExtension
  host: (engine: HostEngine) => Promise<HostHandle>
  harness?: HarnessAdapter
}

export type SecondClient = {page: Page; close: () => Promise<void>}

export type ExtensionTestApi = {
  page: Page
  callTool: CallTool

  callToolApproved: CallTool
  runTypescript: RunTypescript
  discoverTools: DiscoverTools
  session: string
  apiBase: string
  serverContext: unknown

  secondClient: () => Promise<SecondClient>
  dispose: () => Promise<void>
}

export {serveDir, type ServedHost} from './serve.js'
export {fixtureHost} from './fixture-host.js'

export async function getExtensionTestApi(extension: ExtensionUnderTest): Promise<ExtensionTestApi> {
  const engine = await bootExtensionServer(extension.server, {harness: extension.harness})
  const {apiBase, extensionContexts, stop} = engine
  const teardown: TeardownStep[] = [{name: 'stop', run: () => stop()}]
  const dispose = () => settleTeardown(teardown)
  try {
    const session = await resolveSession(apiBase)
    const {origin, close} = await extension.host({apiBase: engine.origin, session})
    teardown.push({name: 'close', run: () => close()})
    const {page, context, close: closeBrowser} = await launch(await magicLink(engine.origin, engine.terminal, origin))
    teardown.push({name: 'closeBrowser', run: () => closeBrowser()})
    await rpcObserverFor(page).completed({path: ['auth', 'exchange'], status: 200})
    return {
      page,
      callTool: makeCallTool(apiBase, session),
      callToolApproved: makeApprovingCallTool(apiBase, session),
      runTypescript: makeRunTypescript(apiBase, session),
      discoverTools: makeDiscoverTools(apiBase, session),
      session,
      apiBase,
      serverContext: extensionContexts[extension.server.name],
      secondClient: async () => {
        const second = await openObservedPage(context, origin)
        return {page: second, close: () => second.close()}
      },
      dispose,
    }
  } catch (error) {
    await dispose().catch(() => undefined)
    throw error
  }
}
