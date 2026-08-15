import type {JSX} from 'solid-js'
import {useMascotContext} from './mascot-context.js'
import {MascotLayer} from './mascot-layer.js'
import type {MascotLayerProps} from './mascot-props.js'

export function MascotHead(props: MascotLayerProps): JSX.Element {
  const context = useMascotContext()
  context.claimPart('head')
  return <MascotLayer layer="head" {...props} />
}
