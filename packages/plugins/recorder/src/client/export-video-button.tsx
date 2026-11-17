import type {JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {usePlugin} from '@conciv/plugin/experimental'
import {readRecordingVideo, saveFileToDisk} from './download.js'

export function ExportVideoButton(props: {
  clientId: string
  recordingId: () => Promise<string | undefined>
  disabled?: boolean
}): JSX.Element {
  const ctx = usePlugin()
  const [state, setState] = createStore({exporting: false})

  const exportVideo = async (): Promise<void> => {
    setState('exporting', true)
    try {
      const recordingId = await props.recordingId()
      if (recordingId === undefined) return
      saveFileToDisk(await readRecordingVideo(ctx, props.clientId, recordingId))
    } catch {
      ctx.toast.show({title: 'Could not export the recording. Try again.', variant: 'error'})
    } finally {
      setState('exporting', false)
    }
  }

  return (
    <ctx.ui.Button
      variant="neutral"
      size="small"
      disabled={state.exporting || props.disabled}
      busy={state.exporting}
      onClick={() => void exportVideo()}
    >
      {state.exporting ? 'Exporting…' : 'Export video'}
    </ctx.ui.Button>
  )
}
