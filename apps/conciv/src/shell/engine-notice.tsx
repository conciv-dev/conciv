import {createEffect, type JSX} from 'solid-js'
import {useQuery} from '@tanstack/solid-query'
import {useRouter} from '@tanstack/solid-router'
import {engineProbeRefetchInterval, voteEngineProbeSettled} from '@conciv/client'
import {reprobeBrowserRpcConnection} from '@conciv/contract'
import {useApiBase, useAppData, useConnected} from '../app/context.js'
import {useEngineReachability} from '../app/reachability.js'
import {useNotices} from './notice-context.js'

const ENGINE_STALE_MESSAGE =
  'Engine is running outdated code: the server code on disk is newer than the running engine. Restart the dev server.'

const ENGINE_UNREACHABLE_KEY = 'engine-unreachable'
const ENGINE_UNREACHABLE_MESSAGE = 'conciv lost connection to the engine.'

export function EngineStaleNotice(): JSX.Element {
  const appData = useAppData()
  const connected = useConnected()
  const reachability = useEngineReachability()
  const notices = useNotices()
  const engine = useQuery(() => ({
    ...appData.utils.meta.engine.queryOptions(),
    enabled: connected(),
    networkMode: 'always',
    refetchInterval: engineProbeRefetchInterval(reachability.online()),
  }))
  const standing = {fingerprint: null as string | null}
  const clear = (): void => {
    if (standing.fingerprint === null) return
    notices.remove(standing.fingerprint)
    standing.fingerprint = null
  }
  const lastSettle = {at: 0}
  createEffect(() => {
    const settledAt = engine.dataUpdatedAt
    if (settledAt === lastSettle.at) return
    lastSettle.at = settledAt
    voteEngineProbeSettled(engine.isSuccess, engine.error)
  })
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
    notices.notify(ENGINE_STALE_MESSAGE, {key: reading.fingerprint, tone: 'danger', persist: true})
  })
  return null
}

export function EngineUnreachableNotice(): JSX.Element {
  const reachability = useEngineReachability()
  const notices = useNotices()
  const apiBase = useApiBase()
  const router = useRouter()
  const retry = (): void => {
    reprobeBrowserRpcConnection(apiBase())
    void router.invalidate()
  }
  createEffect(() => {
    if (!reachability.sustainedOffline()) {
      notices.remove(ENGINE_UNREACHABLE_KEY)
      return
    }
    notices.notify(ENGINE_UNREACHABLE_MESSAGE, {
      key: ENGINE_UNREACHABLE_KEY,
      tone: 'danger',
      persist: true,
      action: {label: 'Retry', run: retry},
    })
  })
  return null
}
