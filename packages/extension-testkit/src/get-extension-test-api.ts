import type {Page} from 'playwright'
import type {AnyExtension} from '@conciv/extension'
import {bootExtensionServer} from './boot-server.js'
import {makeCallTool, resolveSession, type CallTool} from '@conciv/harness-testkit'
import {buildHost} from './build-host.js'
import {serveDir} from './serve.js'
import {launch} from './launch.js'

export type ExtensionUnderTest = {
  server: AnyExtension
  clientEntry: string
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

export async function getExtensionTestApi(extension: ExtensionUnderTest): Promise<ExtensionTestApi> {
  const {apiBase, stateBase, extensionContexts, stop} = await bootExtensionServer(extension.server)
  const session = await resolveSession(apiBase)
  const outDir = await buildHost(extension.clientEntry)
  const host = await serveDir(outDir, {apiBase, session, stateBase})
  const {page, context, close} = await launch(host.origin)
  return {
    page,
    callTool: makeCallTool(apiBase, session),
    session,
    apiBase,
    serverContext: extensionContexts[extension.server.name],
    secondClient: async () => {
      const second = await context.newPage()
      await second.goto(host.origin, {waitUntil: 'domcontentloaded'})
      return {page: second, close: () => second.close()}
    },
    dispose: async () => {
      await close()
      await host.close()
      await stop()
    },
  }
}
