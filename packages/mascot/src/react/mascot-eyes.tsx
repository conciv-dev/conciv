import {type ReactElement, useRef} from 'react'
import {type ClaimToken, useMascotContext} from './mascot-context.js'
import {MascotLayer} from './mascot-layer.js'
import type {MascotFollowPartProps} from './mascot-props.js'
import {useIsomorphicLayoutEffect} from './use-layout-effect.js'

export function MascotEyes({follow, ...rest}: MascotFollowPartProps): ReactElement {
  const {claimPart} = useMascotContext()
  const token = useRef<ClaimToken>({}).current
  useIsomorphicLayoutEffect(() => claimPart('eyes', token, follow), [claimPart, token, follow])
  return <MascotLayer layer="eyes" {...rest} />
}
