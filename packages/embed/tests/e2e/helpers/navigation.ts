import {interpolatePath} from '@tanstack/router-core'
import type {EmbedKit} from '../../helpers/boot.js'

const RELATIVE_HREF_BASE = 'http://widget.invalid'
const SESSION_PROBE = 'conciv-session-probe'

function panelHref(sessionId: string): string {
  return interpolatePath({path: '/panel/$sessionId', params: {sessionId}}).interpolatedPath
}

function panelSessionIdOf(href: string): string {
  const [panelPrefix] = panelHref(SESSION_PROBE).split(SESSION_PROBE)
  const {pathname} = new URL(href, RELATIVE_HREF_BASE)
  if (panelPrefix === undefined || !pathname.startsWith(panelPrefix)) return ''
  const [sessionId] = pathname.slice(panelPrefix.length).split('/')
  if (!sessionId) return ''
  return panelHref(sessionId) === panelPrefix + sessionId ? sessionId : ''
}

export async function panelSessionId(kit: EmbedKit): Promise<string> {
  const persisted = await kit.rpc.navigation.get()
  const entries = persisted?.entries ?? []
  return entries.map((entry) => panelSessionIdOf(entry.href)).find((sessionId) => sessionId !== '') ?? ''
}
