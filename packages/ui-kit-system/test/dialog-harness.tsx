import {render} from 'solid-js/web'
import type {JSX} from 'solid-js'

const LAYERING = '.fixed{position:fixed}.inset-0{inset:0}'

const disposers: (() => void)[] = []
const nodes: HTMLElement[] = []

export function mountStyled(view: () => JSX.Element): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  nodes.push(host)
  disposers.push(render(view, host))
  return host
}

export function mountInShadow(view: (root: ShadowRoot) => JSX.Element): ShadowRoot {
  const host = document.createElement('div')
  document.body.appendChild(host)
  nodes.push(host)
  const root = host.attachShadow({mode: 'open'})
  const style = document.createElement('style')
  style.textContent = LAYERING
  root.appendChild(style)
  disposers.push(render(() => view(root), root))
  return root
}

export function cleanupMounts(): void {
  for (const dispose of disposers.splice(0)) dispose()
  for (const node of nodes.splice(0)) node.remove()
}
