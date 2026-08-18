import 'virtual:uno.css'
import {describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {Markdown} from '../src/styled/markdown.js'
import {mountView} from './mount-view.js'

function fence(lang: string, lines: Array<string>): string {
  return ['```' + lang, ...lines, '```'].join('\n')
}

function preElement(host: HTMLElement): HTMLElement {
  const found = host.querySelector('pre')
  if (found === null) throw new Error('expected a rendered pre element')
  return found
}

describe('highlight worker fallback', () => {
  it('renders code fences as permanent plain escaped text when Worker is unavailable in the host page', async () => {
    const originalWorker = globalThis.Worker
    // @ts-expect-error simulating a host page without Worker support (e.g. strict CSP worker-src)
    globalThis.Worker = undefined

    const host = mountView(() => <Markdown content={fence('typescript', ['const fallbackMarker = 1'])} />)

    expect(preElement(host).className).not.toContain('shiki')

    await expect.element(page.getByText('fallbackMarker')).toBeVisible()
    expect(preElement(host).className).not.toContain('shiki')
    expect(preElement(host).querySelector('code')).not.toBeNull()

    globalThis.Worker = originalWorker
  })
})
