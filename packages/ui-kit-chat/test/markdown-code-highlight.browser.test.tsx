import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {Markdown} from '../src/styled/markdown.js'
import {mountView} from './mount-view.js'

const FENCE = ['```ts', 'const total = 1', '```'].join('\n')

it('paints a fenced block with shiki tokens delivered by the inline highlight worker', async () => {
  mountView(() => <Markdown content={FENCE} />)

  await expect.element(page.getByText('const', {exact: true})).toBeVisible()
})
