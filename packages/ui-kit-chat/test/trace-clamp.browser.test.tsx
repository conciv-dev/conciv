import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {createSignal, For} from 'solid-js'
import {TraceClamp} from '../src/styled/trace/clamp.js'
import {mountView} from './mount-view.js'

function overflowLabel(hiddenLines: number): string {
  return hiddenLines >= 20 ? 'reveal-large' : 'reveal-small'
}

it('re-measures overflow of a live streaming block once the viewport is already clamped at its max height', async () => {
  const [lineCount, setLineCount] = createSignal(5)

  mountView(() => (
    <TraceClamp size="default" live overflowLabel={overflowLabel}>
      <For each={Array.from({length: 200}, (_, i) => i)}>
        {(i) => <div style={i < lineCount() ? undefined : {display: 'none'}}>trace line {i}</div>}
      </For>
    </TraceClamp>
  ))

  setLineCount(50)

  await expect.element(page.getByText('reveal-large')).toBeVisible()
})
