import {type JSX, splitProps} from 'solid-js'
import {configureBinaryEffect} from '../core/effects/binary.js'
import type {CurveStyle} from '../core/path.js'
import {useMascotContext} from './mascot-context.js'
import {EffectHost} from './mascot-effect.js'
import type {MascotBinaryProps} from './mascot-props.js'

export type BinaryEffectHostProps = MascotBinaryProps & {fallback?: boolean}

export function BinaryEffectHost(props: BinaryEffectHostProps): JSX.Element {
  const context = useMascotContext()
  const [local, rest] = splitProps(props, ['curve'])
  const curve = (): CurveStyle | undefined => local.curve ?? context.curve()
  return <EffectHost {...rest} mount={() => configureBinaryEffect({curve: curve()})} />
}

export function MascotBinary(props: MascotBinaryProps): JSX.Element {
  return <BinaryEffectHost {...props} />
}
