import {onCleanup, onMount, type JSX} from 'solid-js'
import {getExtensionApi} from '@conciv/extension'
import {RECORDER_NAME} from '../shared/protocol.js'
import {bootRecorder} from './boot.js'
import type {RecorderStore} from './recorder-store.js'

export function CaptureDriver(props: {store: RecorderStore}): JSX.Element {
  const host = getExtensionApi(RECORDER_NAME)
  const apiBase = host.useApiBase()
  onMount(() => {
    const dispose = bootRecorder(apiBase(), props.store)
    onCleanup(dispose)
  })
  return <></>
}
