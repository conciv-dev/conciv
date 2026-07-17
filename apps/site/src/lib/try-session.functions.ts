import {createServerFn} from '@tanstack/react-start'
import {useSession} from '@tanstack/react-start/server'

type TrySession = {token?: string; dismissed?: boolean}

const DEMO_PASSWORD = 'conciv-try-pairing-token-cookie-not-a-secret'

const SESSION_CONFIG = {
  password: process.env.TRY_SESSION_SECRET ?? DEMO_PASSWORD,
  name: 'conciv-try',
  maxAge: 60 * 60 * 24,
}

export const getTrySession = createServerFn({method: 'GET'}).handler(async () => {
  const session = await useSession<TrySession>(SESSION_CONFIG)
  const token = session.data.token ?? crypto.randomUUID()
  if (!session.data.token) await session.update({token})
  return {token, dismissed: session.data.dismissed === true}
})

export const dismissTry = createServerFn({method: 'POST'}).handler(async () => {
  const session = await useSession<TrySession>(SESSION_CONFIG)
  await session.update({dismissed: true})
  return {ok: true}
})
