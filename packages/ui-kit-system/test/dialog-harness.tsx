import {render} from '@solidjs/testing-library'
import {render as renderInShadow} from 'solid-js/web'
import type {JSX} from 'solid-js'

const LAYERING = '.fixed{position:fixed}.inset-0{inset:0}'

const shadowDisposers: (() => void)[] = []
const shadowHosts: HTMLElement[] = []

export function mountStyled(view: () => JSX.Element): HTMLElement {
  return render(view).container
}

export function mountInShadow(view: (root: ShadowRoot) => JSX.Element): ShadowRoot {
  const host = document.createElement('div')
  document.body.appendChild(host)
  shadowHosts.push(host)
  const root = host.attachShadow({mode: 'open'})
  const style = document.createElement('style')
  style.textContent = LAYERING
  root.appendChild(style)
  shadowDisposers.push(renderInShadow(() => view(root), root))
  return root
}

export function cleanupMounts(): void {
  for (const dispose of shadowDisposers.splice(0)) dispose()
  for (const host of shadowHosts.splice(0)) host.remove()
}
