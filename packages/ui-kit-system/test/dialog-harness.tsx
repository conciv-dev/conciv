import {render} from '@solidjs/testing-library'
import {render as renderInShadow} from 'solid-js/web'
import type {JSX} from 'solid-js'

const shadowDisposers: (() => void)[] = []
const shadowHosts: HTMLElement[] = []

export function mountStyled(view: () => JSX.Element): HTMLElement {
  return render(view).container
}

export function mountInShadow(view: (root: ShadowRoot) => JSX.Element, owner: Document = document): ShadowRoot {
  const host = owner.createElement('div')
  owner.body.appendChild(host)
  shadowHosts.push(host)
  const root = host.attachShadow({mode: 'open'})
  const style = owner.createElement('style')
  style.textContent = Array.from(document.styleSheets, (sheet) =>
    Array.from(sheet.cssRules, (rule) => rule.cssText).join(''),
  ).join('')
  root.appendChild(style)
  shadowDisposers.push(renderInShadow(() => view(root), root))
  return root
}

export function cleanupMounts(): void {
  for (const dispose of shadowDisposers.splice(0)) dispose()
  for (const host of shadowHosts.splice(0)) host.remove()
}
