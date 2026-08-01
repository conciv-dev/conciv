import {render} from 'solid-js/web'
import type {JSX} from 'solid-js'

const disposers: (() => void)[] = []
const hosts: HTMLElement[] = []

export function mountView(view: () => JSX.Element): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  hosts.push(host)
  disposers.push(render(view, host))
  return host
}

export function cleanupViews(): void {
  for (const dispose of disposers.splice(0)) dispose()
  for (const host of hosts.splice(0)) host.remove()
}
