import {createServerFn} from '@tanstack/react-start'
import {getCookie, setCookie, deleteCookie} from '@tanstack/react-start/server'

const COOKIE = 'mirror_session'

export const hasSession = createServerFn({method: 'GET'}).handler(() => getCookie(COOKIE) === 'ok')

export const logIn = createServerFn({method: 'POST'}).handler(() => {
  setCookie(COOKIE, 'ok', {httpOnly: true, path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24})
})

export const logOut = createServerFn({method: 'POST'}).handler(() => {
  deleteCookie(COOKIE, {path: '/'})
})
