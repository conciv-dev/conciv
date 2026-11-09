import {type ReactElement, useCallback, useRef} from 'react'
import type {EmitterRect} from '../core/path.js'
import {useIsomorphicLayoutEffect} from './use-layout-effect.js'
import {configureBinaryEffect} from '../core/effects/binary.js'
import {useMascotContext} from './mascot-context.js'
import {EffectHost} from './mascot-effect.js'
import type {MascotBinaryProps} from './mascot-props.js'

export type BinaryEffectHostProps = MascotBinaryProps & {fallback?: boolean}

export function BinaryEffectHost(props: BinaryEffectHostProps): ReactElement {
  const {curve, avoid, ...rest} = props
  const context = useMascotContext()
  const resolved = curve ?? context.curve()
  const avoids = 'avoid' in props
  const latest = useRef<EmitterRect | undefined>(avoid)
  useIsomorphicLayoutEffect(() => {
    latest.current = avoid
  }, [avoid])
  const mount = useCallback(
    () => configureBinaryEffect({curve: resolved, avoid: avoids ? () => latest.current : undefined}),
    [resolved, avoids],
  )
  return <EffectHost {...rest} mount={mount} replanOn={avoid} />
}

export function MascotBinary(props: MascotBinaryProps): ReactElement {
  return <BinaryEffectHost {...props} />
}
