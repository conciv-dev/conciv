import {type JSX, splitProps} from 'solid-js'
import {configureBinaryEffect} from '../core/effects/binary.js'
import type {CurveStyle} from '../core/path.js'
import {useMascotContext} from './mascot-context.js'
import {MascotEffect} from './mascot-effect.js'
import type {MascotBinaryProps} from './mascot-props.js'

const DEFAULT_CURVE: CurveStyle = 'straight'

export function BinaryEffectHost(props: MascotBinaryProps): JSX.Element {
  const context = useMascotContext()
  const [local, rest] = splitProps(props, ['curve'])
  const curve = (): CurveStyle => local.curve ?? context.curve() ?? DEFAULT_CURVE
  return <MascotEffect {...rest} mount={() => configureBinaryEffect({curve: curve()})} />
}

export function MascotBinary(props: MascotBinaryProps): JSX.Element {
  const context = useMascotContext()
  context.claimEffect()
  return <BinaryEffectHost {...props} />
}
