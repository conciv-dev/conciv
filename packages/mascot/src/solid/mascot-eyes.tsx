import type {JSX} from 'solid-js'
import {useMascotContext} from './mascot-context.js'
import {MascotLayer} from './mascot-layer.js'
import type {MascotLayerProps} from './mascot-props.js'

export function MascotEyes(props: MascotLayerProps): JSX.Element {
  const context = useMascotContext()
  context.claimPart('eyes')
  return <MascotLayer layer="eyes" {...props} />
}
