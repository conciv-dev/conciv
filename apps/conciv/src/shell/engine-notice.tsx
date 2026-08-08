import {createEffect, type JSX} from 'solid-js'
import {useQuery} from '@tanstack/solid-query'
import {useAppData, useConnected} from '../app/context.js'
import {notify, toaster} from './notices.js'

const ENGINE_STALE_MESSAGE =
  'Engine is running outdated code: the server code on disk is newer than the running engine. Restart the dev server.'

export function EngineStaleNotice(): JSX.Element {
  const appData = useAppData()
  const connected = useConnected()
  const engine = useQuery(() => ({...appData.utils.meta.engine.queryOptions(), enabled: connected()}))
  const standing = {fingerprint: null as string | null}
  const clear = (): void => {
    if (standing.fingerprint === null) return
    toaster.remove(standing.fingerprint)
    standing.fingerprint = null
  }
  createEffect(() => {
    const reading = engine.data
    if (reading === undefined) return
    if (!reading.stale) {
      clear()
      return
    }
    if (standing.fingerprint === reading.fingerprint) return
    clear()
    standing.fingerprint = reading.fingerprint
    notify(ENGINE_STALE_MESSAGE, {key: reading.fingerprint, tone: 'danger', persist: true})
  })
  return null
}
