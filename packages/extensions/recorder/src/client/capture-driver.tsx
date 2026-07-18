import {onCleanup, onMount, type JSX} from 'solid-js'
import {getHostApi} from '@conciv/extension'
import {bootRecorder} from './boot.js'
import type {RecorderStore} from './recorder-store.js'

export function CaptureDriver(props: {store: RecorderStore}): JSX.Element {
  const host = getHostApi()
  const apiBase = host.useApiBase()
  onMount(() => {
    const dispose = bootRecorder(apiBase, props.store)
    onCleanup(dispose)
  })
  return <></>
}
