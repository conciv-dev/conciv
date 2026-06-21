import {render} from 'solid-js/web'
import {createRoot, createEffect} from 'solid-js'
import type {EffectDefinition, EffectCtx} from '@mandarax/extensions'

export type EffectInfo = {name: string; description: string; enabled: boolean}
export type EffectResult = {effect: string; enabled: boolean} | {error: string}

const MARKER = 'data-mandarax-effects'

// Stateless effect dispatcher over a live getter (no registry, no singleton): renders an effect's overlay
// into a shared shadow mount on enable, disposes on disable, runs each effect's setup() once.
export function makeEffects(
  getEffects: () => readonly EffectDefinition[],
  ctx: Omit<EffectCtx, 'disable'>,
  styles?: string,
) {
  const active = new Map<string, () => void>()
  const setupDone = new Set<string>()
  let mount: HTMLDivElement | undefined

  const effectRoot = (root: ShadowRoot): HTMLElement => {
    const existing = root.querySelector<HTMLElement>('[data-effect-root]')
    if (existing) return existing
    if (styles) {
      const style = document.createElement('style')
      style.textContent = styles
      root.appendChild(style)
    }
    const container = document.createElement('div')
    container.setAttribute('data-effect-root', '')
    root.appendChild(container)
    return container
  }

  const ensureMount = (): HTMLElement => {
    const found = mount?.isConnected ? mount : (document.querySelector<HTMLDivElement>(`[${MARKER}]`) ?? undefined)
    if (found) {
      mount = found
      return effectRoot(found.shadowRoot ?? found.attachShadow({mode: 'open'}))
    }
    const el = document.createElement('div')
    el.setAttribute(MARKER, '')
    el.setAttribute('aria-hidden', 'true')
    el.style.position = 'fixed'
    el.style.zIndex = '2147483000'
    const root = el.attachShadow({mode: 'open'})
    document.body.appendChild(el)
    mount = el
    return effectRoot(root)
  }

  const setEffect = (name: string, on: boolean): EffectResult => {
    const effect = getEffects().find((e) => e.name === name)
    if (!effect) return {error: `unknown effect: ${name}`}
    const isOn = active.has(name)
    if (on && !isOn) {
      active.set(
        name,
        render(() => effect.render({...ctx, disable: () => setEffect(name, false)}), ensureMount()),
      )
    } else if (!on && isOn) {
      active.get(name)!()
      active.delete(name)
    }
    return {effect: name, enabled: active.has(name)}
  }

  const toggleEffect = (name: string): EffectResult => setEffect(name, !active.has(name))
  const listEffects = (): {effects: EffectInfo[]} => ({
    effects: getEffects().map((e) => ({name: e.name, description: e.description, enabled: active.has(e.name)})),
  })

  const dispose = createRoot((disposeRoot) => {
    createEffect(() => {
      for (const e of getEffects()) {
        if (!e.setup || setupDone.has(e.name)) continue
        setupDone.add(e.name)
        e.setup({
          enable: () => setEffect(e.name, true),
          disable: () => setEffect(e.name, false),
          isEnabled: () => active.has(e.name),
        })
      }
    })
    return disposeRoot
  })

  return {setEffect, toggleEffect, listEffects, dispose}
}
