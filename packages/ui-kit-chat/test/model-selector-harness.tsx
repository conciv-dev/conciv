import {render} from 'solid-js/web'
import type {JSX} from 'solid-js'
import type {ModelOption} from '../src/primitives/model-selector/model-selector.js'

export const HARNESS_MODELS: readonly ModelOption[] = [
  {id: 'claude-opus-4-8', name: 'Claude Opus 4.8', description: 'Most capable'},
  {id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: 'Balanced speed and depth'},
  {id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', description: 'Fastest'},
]

const disposers: (() => void)[] = []
const hosts: HTMLElement[] = []

export function mountSelector(view: () => JSX.Element): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  hosts.push(host)
  disposers.push(render(view, host))
  return host
}

export function cleanupSelectors(): void {
  for (const dispose of disposers.splice(0)) dispose()
  for (const host of hosts.splice(0)) host.remove()
}
