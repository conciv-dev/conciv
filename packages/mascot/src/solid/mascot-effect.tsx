import {createEffect, createUniqueId, type JSX, onCleanup, onMount, splitProps, untrack} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {EffectMount} from '../core/effects/effect.js'
import {useMascotContext} from './mascot-context.js'
import {composeRefs, type MascotLayerProps, mergeStyle} from './mascot-props.js'

export type MascotEffectProps = MascotLayerProps & {mount: () => EffectMount; fallback?: boolean}

export function MascotEffect(props: MascotEffectProps): JSX.Element {
  const context = useMascotContext()
  const id = createUniqueId()
  const host = context.effectHostProps(id)
  const [local, rest] = splitProps(props, ['mount', 'fallback', 'style', 'ref'])
  if (untrack(() => local.fallback) !== true) context.claimEffect()
  let element: HTMLSpanElement | undefined
  onMount(() => {
    if (element !== undefined) host.ref(element)
  })
  createEffect(() => context.service.mountEffect(id, local.mount()))
  onCleanup(() => {
    context.service.unmountEffect(id)
    if (element !== undefined) host.release(element)
  })
  return (
    <Dynamic
      component="span"
      aria-hidden="true"
      {...rest}
      data-scope="mascot"
      data-part="effect"
      style={mergeStyle(host.style, local.style)}
      ref={composeRefs((node) => {
        element = node
      }, local.ref)}
    />
  )
}
