import type {JSX} from 'solid-js'
import {Mascot, type EmitterBounds} from '@conciv/mascot/solid'

const PANEL_ID = 'conciv-chat-panel'

export function FabRobot(props: {open: () => boolean; working: () => boolean}): JSX.Element {
  let stage: HTMLSpanElement | undefined
  const roomUnderPanel = (): EmitterBounds => clipUnderPanel(stage)
  return (
    <Mascot
      ref={(element) => {
        stage = element
      }}
      class="conciv-fab-rig"
      state={props.open() && !props.working() ? 'awake' : 'rest'}
      working={props.working()}
      follow={!props.open()}
    >
      <Mascot.Head />
      <Mascot.Antenna />
      <Mascot.Eyes class="conciv-rig-eyes" />
      <Mascot.Binary bounds={props.open() ? roomUnderPanel : undefined} />
    </Mascot>
  )
}

function clipUnderPanel(stage: HTMLElement | undefined): EmitterBounds {
  const viewport: EmitterBounds = {top: 0, left: 0, right: document.documentElement.clientWidth}
  const panel = stage === undefined ? null : panelOf(stage)
  if (stage === undefined || panel === null) return viewport
  const panelBottom = panel.getBoundingClientRect().bottom
  if (panelBottom > stage.getBoundingClientRect().top) return viewport
  return {...viewport, top: Math.max(viewport.top, panelBottom)}
}

function panelOf(stage: HTMLElement): HTMLElement | null {
  const root = stage.getRootNode()
  if (root instanceof ShadowRoot || root instanceof Document) return root.getElementById(PANEL_ID)
  return null
}
