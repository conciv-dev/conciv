import 'virtual:uno.css'
import '@conciv/ui-kit-system/tokens.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import {createSignal} from 'solid-js'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {Markdown} from '../src/styled/markdown.js'
import {mountView} from './mount-view.js'

const FLOWCHART_FENCE = ['```mermaid', 'flowchart LR', '  A[Save file] --> B[Watcher fires]', '```'].join('\n')
const SECOND_FENCE = ['```mermaid', 'flowchart LR', '  C[Rebuild] --> D[Reload page]', '```'].join('\n')
const INVALID_FENCE = ['```mermaid', 'flowchart LR', '  E[Broken --> ((', '```'].join('\n')

it('draws a settled mermaid fence as a diagram', async () => {
  mountView(() => <Markdown content={FLOWCHART_FENCE} />)

  await expect.element(page.getByText('Watcher fires', {exact: true})).toBeVisible()
  await expect.element(page.getByText('A[Save file] --> B[Watcher fires]', {exact: false})).not.toBeInTheDocument()
})

it('keeps a streaming mermaid fence as code and draws it once streaming settles', async () => {
  const [streaming, setStreaming] = createSignal(true)
  mountView(() => <Markdown content={FLOWCHART_FENCE} streaming={streaming()} />)
  mountView(() => <Markdown content={SECOND_FENCE} />)

  await expect.element(page.getByText('Reload page', {exact: true})).toBeVisible()
  await expect.element(page.getByText('A[Save file] --> B[Watcher fires]', {exact: false})).toBeVisible()
  await expect.element(page.getByText('Watcher fires', {exact: true})).not.toBeInTheDocument()

  setStreaming(false)

  await expect.element(page.getByText('Watcher fires', {exact: true})).toBeVisible()
})

it('leaves a mermaid fence that does not parse as a plain code block', async () => {
  mountView(() => <Markdown content={INVALID_FENCE} />)
  mountView(() => <Markdown content={SECOND_FENCE} />)

  await expect.element(page.getByText('Reload page', {exact: true})).toBeVisible()
  await expect.element(page.getByText('E[Broken --> ((', {exact: false})).toBeVisible()
})
