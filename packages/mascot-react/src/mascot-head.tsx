import {type ReactElement, useRef} from 'react'
import {type ClaimToken, useMascotContext} from './mascot-context.js'
import {MascotLayer} from './mascot-layer.js'
import type {MascotLayerProps} from './mascot-props.js'
import {useIsomorphicLayoutEffect} from './use-layout-effect.js'

export function MascotHead(props: MascotLayerProps): ReactElement {
  const {claimPart} = useMascotContext()
  const token = useRef<ClaimToken>({}).current
  useIsomorphicLayoutEffect(() => claimPart('head', token, undefined), [claimPart, token])
  return <MascotLayer layer="head" {...props} />
}
