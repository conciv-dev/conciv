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
  it('shows percent and the ring from the contextTokens occupancy', () => {
    const host = mount({contextTokens: 25_000, contextWindow: 200_000, inputTokens: 20_000, outputTokens: 100})
    expect(host.textContent).toContain('12.5%')
    expect(host.querySelector('svg[aria-label="Model context usage"]')).not.toBeNull()
  })

  it('never derives a percent from cumulative billing totals (issue #78: 773K/200K = 386%)', () => {
    const host = mount({inputTokens: 700_000, cacheReadTokens: 73_000, contextWindow: 200_000, outputTokens: 5_000})
    expect(host.textContent).not.toContain('%')
    expect(host.querySelector('svg')).toBeNull()
    expect(host.textContent).toContain('778K')
  })

  it('falls back to a compact billing-token count when no occupancy is reported', () => {
    const host = mount({inputTokens: 24_000, outputTokens: 100})
    expect(host.textContent).toContain('24K')
    expect(host.querySelector('svg')).toBeNull()
  })

  it('renders nothing for null usage or an empty snapshot', () => {
    expect(mount(null).textContent).toBe('')
    expect(mount({}).textContent).toBe('')
  })
})
