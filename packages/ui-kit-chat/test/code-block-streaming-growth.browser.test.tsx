import 'virtual:uno.css'
import {createSignal} from 'solid-js'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {CodeBlock} from '../src/tools/styled/code-block.js'
import {mountView} from './mount-view.js'

const LINES = 24
const STEP_MS = 40
const LAST_LINE = `const step${LINES - 1} = await resolve(steps[${LINES - 1}])`

function body(count: number): string {
  return Array.from({length: count}, (_, index) => `const step${index} = await resolve(steps[${index}])`).join('\n')
}

it('grows the tool card code body while the file contents stream in', async () => {
  const [lines, setLines] = createSignal(1)
  mountView(() => <CodeBlock file={{name: 'pipeline.ts', lang: 'ts', contents: body(lines())}} />)

  const sampled: number[] = []
  for (let count = 1; count <= LINES; count += 1) {
    setLines(count)
    await new Promise((resolve) => setTimeout(resolve, STEP_MS))
    const host = document.querySelector('diffs-container')
    sampled.push(((host?.shadowRoot ?? host)?.textContent ?? '').length)
  }

  await expect.element(page.getByText(LAST_LINE, {exact: false})).toBeVisible()
  expect(sampled.toSorted((left, right) => left - right)).toEqual(sampled)
  expect(new Set(sampled).size).toBeGreaterThanOrEqual(10)
})
