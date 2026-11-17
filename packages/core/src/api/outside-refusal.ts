import type {State} from '@conciv/plugin-page/rpc'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {SessionScope} from '../runtime/scope-types.js'

export async function outsideRefusal(
  pageTabs: (sessionId: SessionId) => Promise<State>,
  scope: SessionScope,
  client: string | null,
  reason: 'asked' | 'denied',
): Promise<string> {
  const who = client ?? 'An outside agent'
  const title = await pageTitle(pageTabs, scope.id)
  const tab = title === null ? 'the conciv tab' : `the conciv tab "${title}"`
  if (reason === 'denied') {
    return `The user denied ${who} access to ${tab}; do not retry unless they allow outside agents again from that tab.`
  }
  return `${who} is waiting for the user to allow it in ${tab}; retry after they click Approve.`
}

async function pageTitle(pageTabs: (sessionId: SessionId) => Promise<State>, sessionId: SessionId) {
  const {tabs, focusedTabId} = await pageTabs(sessionId)
  const focused = tabs.find((tab) => tab.id === focusedTabId) ?? tabs[0]
  return focused === undefined || focused.title === '' ? null : focused.title
}
