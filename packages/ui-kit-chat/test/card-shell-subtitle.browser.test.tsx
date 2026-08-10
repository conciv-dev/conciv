import {describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import type {ToolCallPart} from '@tanstack/ai-client'
import {CardShell} from '../src/tools/styled/card-shell.js'

const PART: ToolCallPart = {type: 'tool-call', id: 't1', name: 'demo_tool', arguments: '{}', state: 'input-complete'}

describe('CardShell subtitle', () => {
  it('renders a distinct muted subtitle next to a shrink-fit title', async () => {
    render(() => (
      <CardShell
        meta={undefined}
        title="Read the router state"
        subtitle="/about · 2 matches"
        part={PART}
        result={undefined}
      />
    ))
    await expect.element(page.getByText('Read the router state', {exact: true})).toBeVisible()
    await expect.element(page.getByText('/about · 2 matches', {exact: true})).toBeVisible()
  })
})
