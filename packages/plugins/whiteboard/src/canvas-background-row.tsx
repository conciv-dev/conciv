import type {JSX} from 'solid-js'
import {usePlugin} from '@conciv/plugin/experimental'
import type {whiteboardStores} from './stores.js'

export const CANVAS_BACKGROUND_ROW = 'settings-whiteboard-canvas-background'
const LABEL = 'Canvas background: see the page through the canvas'

export function CanvasBackgroundRow(): JSX.Element {
  const ctx = usePlugin<{stores: typeof whiteboardStores}>()
  const ui = ctx.ui
  const canvas = ctx.stores.canvas
  return (
    <ui.SettingsRow
      id={CANVAS_BACKGROUND_ROW}
      title={LABEL}
      description="Off, the whiteboard draws on a solid background that follows the theme."
    >
      <ui.Switch
        label={LABEL}
        hideLabel
        checked={canvas.value.transparent}
        onChange={(checked) =>
          canvas.update((draft) => {
            draft.transparent = checked
          })
        }
      />
    </ui.SettingsRow>
  )
}
