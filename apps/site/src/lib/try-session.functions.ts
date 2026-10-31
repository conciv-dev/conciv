import {createServerFn} from '@tanstack/react-start'
import {getCookie, setCookie} from '@tanstack/react-start/server'
import {z} from 'zod'

const TOKEN_COOKIE = 'conciv-try-token'
const DISMISSED_COOKIE = 'conciv-try-dismissed'

const TokenCookieSchema = z.uuid()

function writeTryCookie(name: string, value: string): void {
  setCookie(name, value, {httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24})
}

export const getTrySession = createServerFn({method: 'GET'}).handler(() => {
  const stored = TokenCookieSchema.safeParse(getCookie(TOKEN_COOKIE))
  const token = stored.success ? stored.data : crypto.randomUUID()
  if (!stored.success) writeTryCookie(TOKEN_COOKIE, token)
  return {token, dismissed: getCookie(DISMISSED_COOKIE) === 'true'}
})

export const dismissTry = createServerFn({method: 'POST'}).handler(() => {
  writeTryCookie(DISMISSED_COOKIE, 'true')
  return {ok: true}
})
