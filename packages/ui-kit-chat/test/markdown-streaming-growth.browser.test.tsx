import 'virtual:uno.css'
import {createSignal} from 'solid-js'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {Markdown} from '../src/styled/markdown.js'
import {mountView} from './mount-view.js'

const CHUNK = 56
const CLOSING = 'That is the whole helper.'
const CODE_LINES = 12

function answer(): string {
  return [
    'Here is the helper you asked for.',
    '',
    '```ts',
    'export async function resolveEveryStep(input: Input): Promise<Step[]> {',
    ...Array.from({length: CODE_LINES}, (_, index) => `  const step${index} = await resolve(input.steps[${index}])`),
    '  return [step0]',
    '}',
    '```',
    '',
    CLOSING,
  ].join('\n')
}

function slices(text: string): string[] {
  return Array.from({length: Math.ceil(text.length / CHUNK)}, (_, index) => text.slice(0, (index + 1) * CHUNK))
}

it('grows a fenced code block as the markdown streams in', async () => {
  const full = answer()
  const [content, setContent] = createSignal('')
  mountView(() => <Markdown content={content()} streaming />)

  const sampled: number[] = []
  for (const step of slices(full)) {
    setContent(step)
    await new Promise((resolve) => setTimeout(resolve, 16))
    const block = document.querySelector('.prose-chat pre')
    sampled.push((block?.textContent ?? '').length)
  }

  await expect.element(page.getByText(CLOSING, {exact: true})).toBeVisible()
  expect(document.querySelectorAll('.prose-chat pre').length).toBe(1)
  expect(sampled.filter((length) => length > 0).length).toBeGreaterThanOrEqual(10)
  expect(sampled.toSorted((left, right) => left - right)).toEqual(sampled)
})
