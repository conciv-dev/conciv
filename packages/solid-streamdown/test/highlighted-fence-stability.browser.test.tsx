import {describe, it, expect} from 'vitest'
import {createSignal} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {page} from 'vitest/browser'
import {Streamdown, type HastElement} from '../src/streamdown.js'

function token(text: string): HastElement {
  return {
    type: 'element',
    tagName: 'span',
    properties: {style: 'color:var(--demo-token)'},
    children: [{type: 'text', value: text}],
  }
}

function highlighted(tokens: string[], version = 0): HastElement {
  return {
    type: 'element',
    tagName: 'pre',
    properties: {class: 'demo-shiki', 'data-version': String(version)},
    children: [{type: 'element', tagName: 'code', properties: {}, children: tokens.map(token)}],
  }
}

function fence(code: string): string {
  return ['```ts', code, '```'].join('\n')
}

function tokenSpan(container: HTMLElement, text: string): HTMLElement {
  const found = [...container.querySelectorAll('span')].find((span) => span.textContent === text)
  if (!found) throw new Error(`expected a token span for ${text}`)
  return found
}

function preElement(container: HTMLElement): HTMLElement {
  const found = container.querySelector('pre')
  if (!found) throw new Error('expected a rendered pre element')
  return found
}

function watchRemovals(target: Node): () => Node[] {
  const removed: Node[] = []
  const observer = new MutationObserver((records) => {
    removed.push(...records.flatMap((record) => [...record.removedNodes]))
  })
  observer.observe(target, {childList: true, subtree: true})
  return () => {
    removed.push(...observer.takeRecords().flatMap((record) => [...record.removedNodes]))
    observer.disconnect()
    return removed
  }
}

describe('Streamdown highlighted fences', () => {
  it('renders the token elements a highlight hook returns for a fence', async () => {
    render(() => (
      <Streamdown highlightCode={() => highlighted(['alphaToken', ' ', 'betaToken'])}>
        {fence('alphaToken betaToken')}
      </Streamdown>
    ))

    await expect.element(page.getByText('alphaToken', {exact: true})).toBeVisible()
    await expect.element(page.getByText('betaToken', {exact: true})).toBeVisible()
  })

  it('keeps the same token nodes when the hook re-runs with equal tokens', async () => {
    const [version, setVersion] = createSignal(0)
    const {container} = render(() => (
      <Streamdown highlightCode={() => highlighted(['alphaToken', ' ', 'betaToken'], version())}>
        {fence('alphaToken betaToken')}
      </Streamdown>
    ))

    await expect.element(page.getByText('alphaToken', {exact: true})).toBeVisible()
    const settled = tokenSpan(container, 'alphaToken')
    const settledText = settled.firstChild
    const removals = watchRemovals(preElement(container))

    setVersion(1)

    await expect.element(page.elementLocator(preElement(container))).toHaveAttribute('data-version', '1')
    expect(tokenSpan(container, 'alphaToken')).toBe(settled)
    expect(settled.firstChild).toBe(settledText)
    expect(removals()).toEqual([])
  })

  it('mounts only the new tokens while a highlighted fence grows during streaming', async () => {
    const [text, setText] = createSignal(fence('alphaToken'))
    const {container} = render(() => (
      <Streamdown animated={true} isAnimating={true} highlightCode={(code) => highlighted(code.trim().split(/(\s+)/))}>
        {text()}
      </Streamdown>
    ))

    await expect.element(page.getByText('alphaToken', {exact: true})).toBeVisible()
    const settled = tokenSpan(container, 'alphaToken')
    const removals = watchRemovals(preElement(container))

    setText(fence('alphaToken betaToken'))
    setText(fence('alphaToken betaToken gammaToken'))

    await expect.element(page.getByText('gammaToken', {exact: true})).toBeVisible()
    expect(tokenSpan(container, 'alphaToken')).toBe(settled)
    expect(removals().filter((node) => node === settled || node === settled.firstChild)).toEqual([])
  })
})
