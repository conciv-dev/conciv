import type {EngineStart} from '@conciv/plugin-testkit'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const startOfToday = new Date().setHours(0, 0, 0, 0)

export const pastSessions = {
  harnesses: [
    {
      id: 'engine',
      sessions: [
        {
          id: 'past-login',
          derivedTitle: 'Fix the login form',
          updatedAt: startOfToday - 12 * HOUR_MS,
          messages: [
            {id: 'login-1', role: 'user', parts: [{type: 'text', content: 'why does login fail'}]},
            {
              id: 'login-2',
              role: 'assistant',
              parts: [{type: 'text', content: 'The session cookie expires too early'}],
            },
          ],
        },
        {
          id: 'past-footer',
          derivedTitle: 'Tidy the footer',
          updatedAt: startOfToday - 30 * DAY_MS,
          messages: [
            {id: 'footer-1', role: 'user', parts: [{type: 'text', content: 'make the footer smaller'}]},
            {id: 'footer-2', role: 'assistant', parts: [{type: 'text', content: 'Moved the links into one row'}]},
          ],
        },
        {
          id: 'past-checkout',
          cwd: '/elsewhere/storefront',
          derivedTitle: 'Ship the checkout page',
          updatedAt: startOfToday - 20 * DAY_MS,
          messages: [
            {id: 'checkout-1', role: 'user', parts: [{type: 'text', content: 'where does the order start'}]},
            {id: 'checkout-2', role: 'assistant', parts: [{type: 'text', content: 'In the cart page'}]},
          ],
        },
      ],
    },
  ],
} satisfies EngineStart
