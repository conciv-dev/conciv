import {render} from 'solid-js/web'
import {afterEach, expect, test} from 'vitest'
import type {JSX} from 'solid-js'
import {AttachmentByMime, AttachmentProvider, type CompleteAttachment} from '@conciv/ui-kit-chat'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

function mount(element: () => JSX.Element): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = render(element, host)
  disposers.push(() => {
    dispose()
    host.remove()
  })
  return host
}

const complete: CompleteAttachment = {
  id: 'a',
  type: 'document',
  name: 'rec',
  contentType: 'application/x-test',
  status: {type: 'complete'},
  content: [{type: 'document', source: {type: 'data', mimeType: 'application/x-test', value: 'eyJ4IjoxfQ=='}}],
}

test('renders the matching card for a document mime', () => {
  const Card = (): JSX.Element => <div data-testid="card">player</div>
  const host = mount(() => (
    <AttachmentProvider value={complete}>
      <AttachmentByMime cards={[{mime: 'application/x-test', render: Card}]} />
    </AttachmentProvider>
  ))
  expect(host.querySelector('[data-testid="card"]')).not.toBeNull()
})

test('falls back to the generic tile for an unknown mime', () => {
  const host = mount(() => (
    <AttachmentProvider value={complete}>
      <AttachmentByMime cards={[]} />
    </AttachmentProvider>
  ))
  expect(host.querySelector('[aria-label="rec"]')).not.toBeNull()
})
