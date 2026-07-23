import type {Page} from 'playwright'
import type {AnyExtension} from '@conciv/extension'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {bootExtensionServer} from './boot-server.js'
import {makeCallTool, resolveSession, type CallTool} from '@conciv/harness-testkit'
import {launch} from './launch.js'

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
  session: string
  apiBase: string
  serverContext: unknown

  secondClient: () => Promise<SecondClient>
  dispose: () => Promise<void>
}

export {serveDir} from './serve.js'
export {buildConcivHost, type BuildConcivHostOptions} from './build-host.js'
export {fixtureHost} from './fixture-host.js'

export async function getExtensionTestApi(extension: ExtensionUnderTest): Promise<ExtensionTestApi> {
  const {apiBase, extensionContexts, stop} = await bootExtensionServer(extension.server, {
    harness: extension.harness,
  })
  const session = await resolveSession(apiBase)
  const {origin, close} = await extension.host({apiBase, session})
  const {page, context, close: closeBrowser} = await launch(origin)
  return {
    page,
    callTool: makeCallTool(apiBase, session),
    session,
    apiBase,
    serverContext: extensionContexts[extension.server.name],
    secondClient: async () => {
      const second = await context.newPage()
      await second.goto(origin, {waitUntil: 'domcontentloaded'})
      return {page: second, close: () => second.close()}
    },
    dispose: async () => {
      await closeBrowser()
      await close()
      await stop()
    },
  }
}
