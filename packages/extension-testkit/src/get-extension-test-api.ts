import type {Page} from 'playwright'
import type {AnyExtension} from '@conciv/extension'
import {bootExtensionServer} from './boot-server.js'
import {resolveSession} from './session.js'
import {buildHost} from './build-host.js'
import {serveDir} from './serve.js'
import {launch} from './launch.js'
import {makeCallTool, type CallTool} from './call-tool.js'

// The extension's two real halves: the server builder start() mounts + the client entry the host imports.
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
  // A second browser page on the SAME served host (same injected session → same room), for two-client
  // CRDT behavior (echo, dedup, presence). Reuses the first page's browser context.
  secondClient: () => Promise<SecondClient>
  dispose: () => Promise<void>
}

export async function getExtensionTestApi(extension: ExtensionUnderTest): Promise<ExtensionTestApi> {
  const {apiBase, stop} = await bootExtensionServer(extension.server)
  const session = await resolveSession(apiBase)
  const outDir = await buildHost(extension.clientEntry)
  const host = await serveDir(outDir, {apiBase, session})
  const {page, context, close} = await launch(host.origin)
  return {
    page,
    callTool: makeCallTool(apiBase, session),
    session,
    apiBase,
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
