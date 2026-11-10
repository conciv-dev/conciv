import {acquirePushChannel} from '@conciv/client'
import {browserRpcConnection, forgetMagicLinkCode, makeBrowserRpcClient, readMagicLinkCode} from '@conciv/contract'
import {collectClientEffects, collectClientTools, type AnyExtension, type ClientEffect} from '@conciv/extension'
import {installReactBridge, makeDomPageDriver, startPagePlane} from '@conciv/page'

type PageHost = {apiBase: string; session: string; clientValue: object}

export async function startPageHost(extension: AnyExtension): Promise<PageHost> {
  installReactBridge()
  const apiBase = metaContent('conciv-api-base')
  const session = metaContent('conciv-session')
  await loginHost(apiBase).catch((error: unknown) =>
    console.error('[conciv testkit] the host could not log in to the engine', error),
  )
  const client = runClientFactory(extension)
  servePagePlane({extension, effects: client.effects, apiBase, session})
  return {apiBase, session, clientValue: client.value}
}

function runClientFactory(extension: AnyExtension): {value: object; effects: readonly ClientEffect[]} {
  const client = extension.__client?.() ?? {value: {}}
  return {value: client.value, effects: client.effects ?? []}
}

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

async function loginHost(apiBase: string): Promise<void> {
  const {trust} = browserRpcConnection(apiBase)
  const code = readMagicLinkCode()
  if (!(await trust.requestTrust()) && code !== undefined) await trust.requestTrustWithCode(code)
  forgetMagicLinkCode()
}

function servePagePlane(input: {
  extension: AnyExtension
  effects: readonly ClientEffect[]
  apiBase: string
  session: string
}): void {
  if (input.session === '') return
  const channel = acquirePushChannel({apiBase: input.apiBase, sessionId: input.session})
  const {rpc} = makeBrowserRpcClient(input.apiBase, {session: () => input.session})
  startPagePlane({
    source: {queries: channel.queries, reply: (reply) => rpc.page.reply(reply)},
    driver: makeDomPageDriver({
      tools: collectClientTools([input.extension]),
      effects: collectClientEffects([{name: input.extension.name, effects: input.effects}]),
    }),
  })
}
