import {browserRpcConnection, forgetMagicLinkCode, readMagicLinkCode, type EngineTrust} from '@conciv/contract'
import type {AnyExtension} from '@conciv/extension'
import {installReactBridge} from '@conciv/page'

type PageHost = {apiBase: string; session: string; clientValue: object}

export async function startPageHost(extension: AnyExtension): Promise<PageHost> {
  installReactBridge()
  const apiBase = metaContent('conciv-api-base')
  const session = metaContent('conciv-session')
  const connection = browserRpcConnection(apiBase)
  window.addEventListener('pagehide', connection.release, {once: true})
  await loginHost(connection.trust).catch((error: unknown) =>
    console.error('[conciv testkit] the host could not log in to the engine', error),
  )
  const client = extension.__client?.() ?? {value: {}}
  return {apiBase, session, clientValue: client.value}
}

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

async function loginHost(trust: EngineTrust): Promise<void> {
  const code = readMagicLinkCode()
  if (!(await trust.requestTrust()) && code !== undefined) await trust.requestTrustWithCode(code)
  forgetMagicLinkCode()
}
