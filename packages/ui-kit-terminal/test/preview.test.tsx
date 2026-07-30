import {describe, expect, it} from 'vitest'
import {render} from 'solid-js/web'
import {until} from '@conciv/harness-testkit/until'
import {TerminalPreview} from '../src/preview.js'

function mount(content: string): {host: HTMLElement; dispose: () => void} {
  const host = document.createElement('div')
  host.style.width = '640px'
  document.body.appendChild(host)
  const dispose = render(() => <TerminalPreview content={content} />, host)
  return {host, dispose}
}

describe('the static terminal preview', () => {
  it('writes the given transcript once and shows it', async () => {
    const {host, dispose} = mount('● Looking at the manifests now.\r\n⏺ Read')

    await until(() => (host.textContent ?? '').includes('Looking at the manifests now.'))
    expect(host.textContent).toContain('⏺ Read')
    dispose()
    host.remove()
  })

  it('keeps itself out of the tab order and the accessibility tree', async () => {
    const {host, dispose} = mount('● done')

    await until(() => host.querySelector('textarea') !== null)
    expect(host.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
    for (const field of host.querySelectorAll('textarea')) expect(field.tabIndex).toBe(-1)
    dispose()
    host.remove()
  })
})
