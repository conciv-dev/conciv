import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {CodeBlock} from '../src/tools/styled/code-block.js'
import {mountView} from './mount-view.js'

const CONTENTS = ['const first = 1', 'const second = 2', 'const third = 3'].join('\n')

it('renders a code body that never changes after mount', async () => {
  mountView(() => <CodeBlock file={{name: 'static.ts', lang: 'ts', contents: CONTENTS}} />)

  await expect.element(page.getByText('const third = 3', {exact: false})).toBeVisible()
})
