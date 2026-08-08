import {createEffect, type JSX} from 'solid-js'
import {useQuery} from '@tanstack/solid-query'
import {useAppData, useConnected} from '../app/context.js'
import {notify} from './notices.js'

const ENGINE_STALE_MESSAGE =
  'Engine is running outdated code: the server code on disk is newer than the running engine. Restart the dev server.'

export function EngineStaleNotice(): JSX.Element {
  const appData = useAppData()
  const connected = useConnected()
  const engine = useQuery(() => ({...appData.utils.meta.engine.queryOptions(), enabled: connected()}))
  createEffect(() => {
    if (engine.data?.stale !== true) return
    notify(ENGINE_STALE_MESSAGE, {key: 'engine-stale', tone: 'danger', persist: true})
  })
  return null
}
