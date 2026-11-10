import type {JSX} from 'solid-js'
import {Mascot, type EmitterRect} from '@conciv/mascot/solid'

export function FabRobot(props: {
  open: () => boolean
  working: () => boolean
  avoid: () => EmitterRect | undefined
}): JSX.Element {
  return (
    <Mascot
      class="conciv-fab-rig"
      state={props.open() && !props.working() ? 'awake' : 'rest'}
      working={props.working()}
      follow={!props.open()}
    >
      <Mascot.Head />
      <Mascot.Antenna />
      <Mascot.Eyes class="conciv-rig-eyes" />
      <Mascot.Binary avoid={props.avoid()} />
    </Mascot>
  )
}
