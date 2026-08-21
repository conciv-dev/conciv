import './helpers/utilities.css'
import {render} from '@solidjs/testing-library'
import {describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {ThinkingSpinner} from '../src/pane/indicators.jsx'

describe('ThinkingSpinner', () => {
  it('announces itself to assistive tech via a status role', async () => {
    render(() => <ThinkingSpinner />)
    await expect.element(page.getByRole('status', {name: 'Assistant is thinking'})).toBeInTheDocument()
  })

  it('shows the dim thinking label alongside the spinner glyph', async () => {
    render(() => <ThinkingSpinner />)
    await expect.element(page.getByText('thinking', {exact: true})).toBeVisible()
  })

  it('cycles the braille spinner glyph over time', async () => {
    render(() => <ThinkingSpinner />)
    await expect.element(page.getByText('⠋', {exact: true})).toBeVisible()
    await expect.element(page.getByText('⠙', {exact: true})).toBeVisible()
  })

  it('shows a static glyph under prefers-reduced-motion instead of cycling', async () => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    Object.defineProperty(media, 'matches', {value: true})
    const originalMatchMedia = window.matchMedia
    window.matchMedia = (query: string) =>
      query === '(prefers-reduced-motion: reduce)' ? media : originalMatchMedia(query)
    render(() => <ThinkingSpinner />)
    await expect.element(page.getByText('⠿', {exact: true})).toBeVisible()
    window.matchMedia = originalMatchMedia
  })
})
