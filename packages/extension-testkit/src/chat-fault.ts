import type {Page, Route} from 'playwright'
import {CHAT_SSE_PATH} from '@conciv/protocol/chat-types'

export type ChatTurnFault = {repair: () => void; dispose: () => Promise<void>}

const DEFAULT_STATUS = 500
const DEFAULT_MESSAGE = 'Internal Server Error'

function turnMatcher(url: URL): boolean {
  return url.pathname.endsWith(CHAT_SSE_PATH)
}

function isTurnPost(route: Route): boolean {
  return route.request().method() === 'POST'
}

function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers().origin
  return origin === undefined ? {} : {'access-control-allow-origin': origin, vary: 'origin'}
}

function injector(page: Page, broken: {value: boolean}, handler: (route: Route) => Promise<void>): ChatTurnFault {
  return {
    repair: () => {
      broken.value = false
    },
    dispose: async () => {
      broken.value = false
      await page.unroute(turnMatcher, handler)
    },
  }
}

export async function failChatTurns(
  page: Page,
  options: {status?: number; message?: string} = {},
): Promise<ChatTurnFault> {
  const status = options.status ?? DEFAULT_STATUS
  const message = options.message ?? DEFAULT_MESSAGE
  const broken = {value: true}
  const handler = async (route: Route): Promise<void> => {
    if (!broken.value || !isTurnPost(route)) return route.continue()
    await route.fulfill({
      status,
      contentType: 'application/json',
      headers: corsHeaders(route),
      body: JSON.stringify({message}),
    })
  }
  await page.route(turnMatcher, handler)
  return injector(page, broken, handler)
}

export async function dropChatTurns(page: Page): Promise<ChatTurnFault> {
  const broken = {value: true}
  const handler = async (route: Route): Promise<void> => {
    if (!broken.value || !isTurnPost(route)) return route.continue()
    await route.abort('connectionrefused')
  }
  await page.route(turnMatcher, handler)
  return injector(page, broken, handler)
}
