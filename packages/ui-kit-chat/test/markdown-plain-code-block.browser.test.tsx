import 'virtual:uno.css'
import '@conciv/ui-kit-system/tokens.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import {createSignal} from 'solid-js'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {Markdown} from '../src/styled/markdown.js'
import {mountView} from './mount-view.js'

const UNKNOWN_LANGUAGE_FENCE = ['```mermaid', 'flowchart', '```'].join('\n')
const HIGHLIGHTED_FENCE = ['```markdown', 'flowchart', '**done**', '```'].join('\n')
const LATE_GRAMMAR_FENCE = ['```bash', 'echo', '```'].join('\n')

function mountStreamedReply(reply: string): void {
  const [content, setContent] = createSignal('')
  const [streaming, setStreaming] = createSignal(true)
  mountView(() => <Markdown content={content()} streaming={streaming()} />)
  setContent(reply.slice(0, reply.length / 2))
  setContent(reply)
  setStreaming(false)
}

it('paints an unhighlighted fence exactly like the base text of a highlighted one', async () => {
  mountStreamedReply(UNKNOWN_LANGUAGE_FENCE)
  mountStreamedReply(HIGHLIGHTED_FENCE)
  mountStreamedReply(LATE_GRAMMAR_FENCE)

  await expect.element(page.getByText('echo', {exact: true})).toBeVisible()
  await expect.element(page.getByText('**done**', {exact: true})).toBeVisible()
  const words = page.getByText('flowchart', {exact: true})

  const plain = await words.first().screenshot({save: false, animations: 'disabled'})
  const highlighted = await words.last().screenshot({save: false, animations: 'disabled'})
  expect(plain).toBe(highlighted)
})
