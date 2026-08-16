import {type ReactElement, useCallback} from 'react'
import {configureBinaryEffect} from '../core/effects/binary.js'
import {useMascotContext} from './mascot-context.js'
import {EffectHost} from './mascot-effect.js'
import type {MascotBinaryProps} from './mascot-props.js'

export type BinaryEffectHostProps = MascotBinaryProps & {fallback?: boolean}

export function BinaryEffectHost({curve, ...rest}: BinaryEffectHostProps): ReactElement {
  const context = useMascotContext()
  const resolved = curve ?? context.curve()
  const mount = useCallback(() => configureBinaryEffect({curve: resolved}), [resolved])
  return <EffectHost {...rest} mount={mount} />
}

export function MascotBinary(props: MascotBinaryProps): ReactElement {
  return <BinaryEffectHost {...props} />
}
