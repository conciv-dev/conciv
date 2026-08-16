import {type ReactElement, useId, useMemo, useRef} from 'react'
import type {EffectMount} from '../core/effects/effect.js'
import {useMascotContext} from './mascot-context.js'
import {composeRefs, type MascotLayerProps, mergeStyle} from './mascot-props.js'
import {useIsomorphicLayoutEffect} from './use-layout-effect.js'

export type MascotEffectProps = MascotLayerProps & {mount: () => EffectMount}

type EffectHostProps = MascotEffectProps & {fallback?: boolean}

export function EffectHost({mount, fallback, style, ref, ...rest}: EffectHostProps): ReactElement {
  const {service, effectHostProps, effectCount, claimEffect} = useMascotContext()
  const id = useId()
  const element = useRef<HTMLSpanElement | null>(null)
  const setElement = useMemo(() => composeRefs(element, ref), [ref])

  const standsDown = () => fallback === true && effectCount() > 0

  useIsomorphicLayoutEffect(() => {
    if (fallback === true) return
    return claimEffect()
  }, [claimEffect, fallback])

  useIsomorphicLayoutEffect(() => {
    const node = element.current
    if (node === null || standsDown()) return
    const host = effectHostProps(id)
    host.ref(node)
    return () => {
      service.unmountEffect(id)
      host.release(node)
    }
  }, [service, effectHostProps, effectCount, fallback, id])

  useIsomorphicLayoutEffect(() => {
    if (standsDown()) return
    service.mountEffect(id, mount())
  }, [service, effectCount, fallback, id, mount])

  return (
    <span
      aria-hidden="true"
      {...rest}
      data-scope="mascot"
      data-part="effect"
      style={mergeStyle(effectHostProps(id).style, style)}
      ref={setElement}
    />
  )
}

export const MascotEffect: (props: MascotEffectProps) => ReactElement = EffectHost
