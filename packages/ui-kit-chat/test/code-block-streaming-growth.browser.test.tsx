import 'virtual:uno.css'
import {createSignal} from 'solid-js'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {CodeBlock} from '../src/tools/styled/code-block.js'
import {mountView} from './mount-view.js'

const LINES = 24

function line(index: number): string {
  return `const step${index} = await resolve(steps[${index}])`
}

function body(count: number): string {
  return Array.from({length: count}, (_, index) => line(index)).join('\n')
}

it('grows the tool card code body line by line while the file contents stream in', async () => {
  const [lines, setLines] = createSignal(1)
  mountView(() => <CodeBlock file={{name: 'pipeline.ts', lang: 'ts', contents: body(lines())}} />)

  for (let count = 1; count <= LINES; count += 1) {
    setLines(count)
    await expect.element(page.getByText(line(count - 1), {exact: false})).toBeVisible()
  }
  await expect.element(page.getByText(line(0), {exact: false})).toBeVisible()
})
