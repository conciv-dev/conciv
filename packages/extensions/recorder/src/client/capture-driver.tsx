import {onCleanup, onMount, Show, type JSX} from 'solid-js'
import {getExtensionApi} from '@conciv/extension'
import {RECORDER_NAME} from '../shared/protocol.js'
import {bootRecorder} from './boot.js'
import type {RecorderStore} from './recorder-store.js'

function BoundRecorder(props: {apiBase: string; store: RecorderStore}): JSX.Element {
  onMount(() => onCleanup(bootRecorder(props.apiBase, props.store)))
  return <></>
}

export function CaptureDriver(props: {store: RecorderStore}): JSX.Element {
  const apiBase = getExtensionApi(RECORDER_NAME).useApiBase()
  return (
    <Show when={apiBase()} keyed>
      {(bound) => <BoundRecorder apiBase={bound} store={props.store} />}
    </Show>
  )
}
