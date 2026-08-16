import {render} from '@solidjs/testing-library'
import {expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {GrabSnapshotFrame} from '../src/client/cards/grab-snapshot-frame.js'

function hostileMarkup(marker: string): string {
  return `<img src="x" onerror="window.parent.document.body.insertAdjacentHTML('beforeend', '<p>${marker}</p>')">`
}

test('the snapshot frame renders the markup in its own document', async () => {
  render(() => (
    <GrabSnapshotFrame html="<p>Payroll Deposit clone</p>" width={200} height={40} class="block max-w-full" />
  ))

  await expect.element(page.getByTitle('Grabbed element snapshot')).toBeVisible()
})

test('inline handlers in captured markup never run inside the widget', async () => {
  render(() => (
    <>
      <iframe title="Unsandboxed control" srcdoc={hostileMarkup('control escaped')} />
      <GrabSnapshotFrame html={hostileMarkup('snapshot escaped')} width={200} height={40} class="block max-w-full" />
    </>
  ))

  await expect.element(page.getByText('control escaped')).toBeVisible()
  await expect.element(page.getByText('snapshot escaped')).not.toBeInTheDocument()
})
