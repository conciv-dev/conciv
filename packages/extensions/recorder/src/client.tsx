import type {JSX} from 'solid-js'
import {defineExtension} from '@conciv/extension'
import {RECORDER_NAME, recorderConfig} from './shared/protocol.js'
import {createRecorderStore, type RecorderStore} from './client/recorder-store.js'
import {CaptureDriver} from './client/capture-driver.js'
import {pullToolClient, startToolClient, stopToolClient} from './tool/client.js'

function Surface(): JSX.Element {
  const store = recorder.useContext((context: {store: RecorderStore}) => context.store)
  return <CaptureDriver store={store} />
}

export const recorder = defineExtension({
  name: RECORDER_NAME,
  configSchema: recorderConfig,
  tools: [startToolClient, stopToolClient, pullToolClient],
  Surface,
}).client(() => ({value: {store: createRecorderStore()}}))

export default recorder
