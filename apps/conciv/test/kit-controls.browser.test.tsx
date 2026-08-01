import '@conciv/ui-kit-system/tokens.css'
import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {render} from 'solid-js/web'
import type {JSX} from 'solid-js'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {UiAnswerValue} from '@conciv/protocol/ui-types'
import type {Notify} from '../src/chat/notify.js'
import {NoticeProvider, NoticeStrip, useNotify} from '../src/shell/notices.js'
import {QuickTerminalHeader} from '../src/routes/quick.js'
import {makeConcivUiCard} from '../src/chat/conciv-ui-card.js'

const disposers: (() => void)[] = []

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

function mount(view: () => JSX.Element): void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = render(view, host)
  disposers.push(() => {
    dispose()
    host.remove()
  })
}

function uiPart(spec: unknown): ToolCallPart {
  return {type: 'tool-call', id: 'call-1', name: 'conciv_ui', arguments: JSON.stringify(spec), state: 'input-complete'}
}

test('the way out of a notice explains itself with a tooltip a touch reader can reach, not a native title', async () => {
  let notify: Notify = () => {}
  const Strip = (): JSX.Element => {
    notify = useNotify()
    return <NoticeStrip />
  }
  mount(() => (
    <NoticeProvider announce={() => {}}>
      <Strip />
    </NoticeProvider>
  ))
  notify('Command copied. Paste it in your terminal.')

  await page.getByRole('button', {name: 'Dismiss'}).hover()

  await expect.element(page.getByRole('tooltip')).toHaveTextContent('Dismiss')
})

test('the quick terminal pop-out control explains itself with a tooltip, not a native title', async () => {
  mount(() => <QuickTerminalHeader onPip={() => {}} onSplit={() => {}} onClose={() => {}} />)

  await page.getByRole('button', {name: 'Pop out to a window'}).hover()

  await expect.element(page.getByRole('tooltip')).toHaveTextContent('Pop out to a window')
})

test('a form question answers with the option the reader picks out of the listbox', async () => {
  const answers: UiAnswerValue[] = []
  const Card = makeConcivUiCard({reply: (_toolCallId, value) => answers.push(value)})
  mount(() => (
    <Card
      part={uiPart({
        kind: 'form',
        title: 'Deploy settings',
        fields: [{name: 'env', label: 'Environment', type: 'select', options: ['staging', 'production']}],
      })}
      result={undefined}
      ctx={{apiBase: '', harnessId: 'fake', sendMessage: () => {}}}
    />
  ))

  await page.getByRole('combobox', {name: 'Environment'}).click()
  await page.getByRole('option', {name: 'production'}).click()

  await expect.element(page.getByRole('combobox', {name: 'Environment'})).toHaveTextContent('production')

  await page.getByRole('button', {name: 'Submit'}).click()

  expect(answers).toEqual([{env: 'production'}])
})
