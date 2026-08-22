import type {JSX} from 'solid-js'
import {Mascot} from '@conciv/mascot/solid'

export function FabRobot(props: {open: () => boolean; working: () => boolean}): JSX.Element {
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
      <Mascot.Binary />
    </Mascot>
  )
}
