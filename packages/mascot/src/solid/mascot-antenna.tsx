import {type JSX, splitProps} from 'solid-js'
import {useMascotContext} from './mascot-context.js'
import {MascotLayer} from './mascot-layer.js'
import type {MascotFollowPartProps} from './mascot-props.js'

export function MascotAntenna(props: MascotFollowPartProps): JSX.Element {
  const context = useMascotContext()
  const [local, rest] = splitProps(props, ['follow'])
  context.claimPart('antenna', local)
  return <MascotLayer layer="antenna" {...rest} />
}
