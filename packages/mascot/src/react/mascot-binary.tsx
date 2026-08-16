import {type ReactElement, useCallback} from 'react'
import {configureBinaryEffect} from '../core/effects/binary.js'
import type {CurveStyle} from '../core/path.js'
import {useMascotContext} from './mascot-context.js'
import {MascotEffect} from './mascot-effect.js'
import type {MascotBinaryProps} from './mascot-props.js'

const DEFAULT_CURVE: CurveStyle = 'straight'

export type BinaryEffectHostProps = MascotBinaryProps & {fallback?: boolean}

export function BinaryEffectHost({curve, ...rest}: BinaryEffectHostProps): ReactElement {
  const context = useMascotContext()
  const resolved = curve ?? context.curve() ?? DEFAULT_CURVE
  const mount = useCallback(() => configureBinaryEffect({curve: resolved}), [resolved])
  return <MascotEffect {...rest} mount={mount} />
}

export function MascotBinary(props: MascotBinaryProps): ReactElement {
  return <BinaryEffectHost {...props} />
}
