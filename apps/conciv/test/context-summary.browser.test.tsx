import './helpers/utilities.css'
import {render} from '@solidjs/testing-library'
import {describe, expect, it} from 'vitest'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'
import {ContextSummary} from '../src/pane/context-tracker.jsx'

function mount(usage: UsageSnapshot | null): HTMLElement {
  return render(() => <ContextSummary usage={usage} />).container
}

describe('ContextSummary inline menu content', () => {
  it('renders the percent, used/max, and stat rows as static content with no popover trigger', () => {
    const host = mount({contextTokens: 99_400, contextWindow: 200_000, inputTokens: 4, outputTokens: 113})
    expect(host.textContent).toContain('49.7%')
    expect(host.textContent).toContain('99K / 200K')
    expect(host.querySelector('[role="progressbar"]')).not.toBeNull()
    expect(host.querySelector('button')).toBeNull()
    expect(host.querySelector('[aria-haspopup]')).toBeNull()
  })

  it('shows the cost row when a total cost is reported', () => {
    const host = mount({contextTokens: 25_000, contextWindow: 200_000, totalCostUsd: 0.06})
    expect(host.textContent).toContain('$0.06')
  })

  it('renders nothing for null usage or an empty snapshot', () => {
    expect(mount(null).textContent).toBe('')
    expect(mount({}).textContent).toBe('')
  })
})
