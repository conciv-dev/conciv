import {type JSX, splitProps, untrack} from 'solid-js'
import {configureBinaryEffect} from '../core/effects/binary.js'
import type {CurveStyle, EmitterRect} from '../core/path.js'
import {useMascotContext} from './mascot-context.js'
import {EffectHost} from './mascot-effect.js'
import type {MascotBinaryProps} from './mascot-props.js'

export type BinaryEffectHostProps = MascotBinaryProps & {fallback?: boolean}

export function BinaryEffectHost(props: BinaryEffectHostProps): JSX.Element {
  const context = useMascotContext()
  const [local, rest] = splitProps(props, ['curve', 'avoid'])
  const curve = (): CurveStyle | undefined => local.curve ?? context.curve()
  const latestAvoid = (): EmitterRect | undefined => untrack(() => local.avoid)
  const avoid = 'avoid' in props ? latestAvoid : undefined
  return (
    <EffectHost {...rest} mount={() => configureBinaryEffect({curve: curve(), avoid})} replanOn={() => local.avoid} />
  )
}

export function MascotBinary(props: MascotBinaryProps): JSX.Element {
  return <BinaryEffectHost {...props} />
}
