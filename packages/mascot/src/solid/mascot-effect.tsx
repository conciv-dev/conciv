import {createEffect, createUniqueId, type JSX, onCleanup, onMount, splitProps} from 'solid-js'
import type {EffectMount} from '../core/effects/effect.js'
import {useMascotContext} from './mascot-context.js'
import {composeRefs, type MascotLayerProps, mergeStyle} from './mascot-props.js'

export type MascotEffectProps = MascotLayerProps & {mount: () => EffectMount}

const EFFECT_DEPTH: Record<string, string> = {'z-index': '3'}

export function MascotEffect(props: MascotEffectProps): JSX.Element {
  const context = useMascotContext()
  const id = createUniqueId()
  const host = context.effectHostProps(id)
  const [local, rest] = splitProps(props, ['mount', 'style', 'ref'])
  let element: HTMLDivElement | undefined
  onMount(() => host.ref(element ?? null))
  createEffect(() => context.service.mountEffect(id, local.mount()))
  onCleanup(() => {
    context.service.unmountEffect(id)
    host.ref(null)
  })
  return (
    <div
      data-scope="mascot"
      data-part="effect"
      aria-hidden="true"
      {...rest}
      style={mergeStyle({...EFFECT_DEPTH, ...host.style}, local.style)}
      ref={composeRefs((node) => {
        element = node
      }, local.ref)}
    />
  )
}
