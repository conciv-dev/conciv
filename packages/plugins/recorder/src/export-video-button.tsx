import type {JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {Effect} from 'effect'
import {usePlugin} from '@conciv/plugin/experimental'
import {saveFileToDisk, videoPieceReader} from './download.js'
import {exportRecording} from './panel.js'
import type {PluginRuntime} from './subscription-ref-signal.js'

export function ExportVideoButton(props: {
  clientId: string
  recordingId: string
  runtime: PluginRuntime
  disabled?: boolean
}): JSX.Element {
  const ctx = usePlugin()
  const [state, setState] = createStore({exporting: false})

  const exportVideo = (): void => {
    setState('exporting', true)
    void props.runtime.runPromise(
      exportRecording({
        save: Effect.succeed({recordingId: props.recordingId}),
        readPiece: videoPieceReader(ctx, props.clientId),
        saveFile: (file) => Effect.sync(() => saveFileToDisk(file)),
      }).pipe(
        Effect.catch((error) =>
          Effect.andThen(
            Effect.logError('recorder: the recording could not be exported', error),
            Effect.sync(
              () => void ctx.toast.show({title: 'Could not export the recording. Try again.', variant: 'error'}),
            ),
          ),
        ),
        Effect.ensuring(Effect.sync(() => setState('exporting', false))),
      ),
    )
  }

  return (
    <ctx.ui.Button
      variant="neutral"
      size="small"
      disabled={state.exporting || props.disabled}
      busy={state.exporting}
      onClick={exportVideo}
    >
      {state.exporting ? 'Exporting…' : 'Export video'}
    </ctx.ui.Button>
  )
}
