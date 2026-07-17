import type {JSX} from 'solid-js'
import {Clapperboard} from 'lucide-solid'
import {defineExtension} from '@conciv/extension'
import {RECORDER_NAME, recorderConfig} from './shared/protocol.js'
import {createRecorderStore} from './client/recorder-store.js'
import {useRecorderContext} from './client/recorder-context.js'
import {CaptureDriver} from './client/capture-driver.js'
import {RecorderPanelView} from './client/panel-view.js'
import {pullToolClient, startToolClient, stopToolClient} from './tool/client.js'

function Surface(): JSX.Element {
  const store = useRecorderContext((context) => context.store)
  return <CaptureDriver store={store} />
}

export const recorder = defineExtension({
  name: RECORDER_NAME,
  configSchema: recorderConfig,
  tools: [startToolClient, stopToolClient, pullToolClient],
  views: [{id: 'recorder', label: 'Recorder', icon: Clapperboard, Component: RecorderPanelView}],
  Surface,
}).client(() => ({value: {store: createRecorderStore()}}))

export default recorder
