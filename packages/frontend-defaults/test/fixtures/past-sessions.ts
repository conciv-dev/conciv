import type {FakeEngineOptions} from '@conciv/client/testing'
import {pastSessionHandlers, sessionRow, textMessage} from '../utils/sessions-engine.js'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const ALPHA_ID = 'ses_pastalpha'

export function pastSessions(): FakeEngineOptions {
  const startOfToday = new Date().setHours(0, 0, 0, 0)
  return {
    sessions: [{id: ALPHA_ID, title: 'Alpha'}],
    handlers: {
      sessions: pastSessionHandlers(
        [sessionRow(ALPHA_ID, 'Alpha', Date.now())],
        [
          {
            nativeId: 'past-login',
            title: 'Fix the login form',
            updatedAt: startOfToday - 12 * HOUR_MS,
            messages: [
              textMessage('login-1', 'user', 'why does login fail'),
              textMessage('login-2', 'assistant', 'The session cookie expires too early'),
            ],
          },
          {
            nativeId: 'past-footer',
            title: 'Tidy the footer',
            updatedAt: startOfToday - 30 * DAY_MS,
            messages: [
              textMessage('footer-1', 'user', 'make the footer smaller'),
              textMessage('footer-2', 'assistant', 'Moved the links into one row'),
            ],
          },
          {
            nativeId: 'past-checkout',
            cwd: '/elsewhere/storefront',
            title: 'Ship the checkout page',
            updatedAt: startOfToday - 20 * DAY_MS,
            messages: [
              textMessage('checkout-1', 'user', 'where does the order start'),
              textMessage('checkout-2', 'assistant', 'In the cart page'),
            ],
          },
        ],
      ),
    },
  }
}
