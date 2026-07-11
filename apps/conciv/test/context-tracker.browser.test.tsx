import {render} from 'solid-js/web'
import {afterEach, describe, expect, it} from 'vitest'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'
import {ContextTracker} from '../src/chat/context-tracker.jsx'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

function mount(usage: UsageSnapshot | null): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = render(() => <ContextTracker usage={usage} />, host)
  disposers.push(() => {
    dispose()
    host.remove()
  })
  return host
}

describe('ContextTracker trigger badge', () => {
  it('shows percent and the ring when the context window is known', () => {
    const host = mount({inputTokens: 20_000, cacheReadTokens: 5_000, contextWindow: 200_000, outputTokens: 100})
    expect(host.textContent).toContain('12.5%')
    expect(host.querySelector('svg[aria-label="Model context usage"]')).not.toBeNull()
  })

  it('falls back to compact used-token count without a context window', () => {
    const host = mount({inputTokens: 24_000, outputTokens: 100})
    expect(host.textContent).toContain('24K')
    expect(host.querySelector('svg')).toBeNull()
  })

  it('falls back to output tokens when nothing context-shaped was reported', () => {
    const host = mount({outputTokens: 1_500})
    expect(host.textContent).toContain('1.5K')
  })

  it('renders nothing for null usage or an empty snapshot', () => {
    expect(mount(null).textContent).toBe('')
    expect(mount({}).textContent).toBe('')
  })
})
