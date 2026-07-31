import '@conciv/ui-kit-system/tokens.css'
import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {render} from 'solid-js/web'
import {createSignal} from 'solid-js'
import {ATTACHED_MESSAGE, NO_CONFLICT, type Conflict} from '../src/chat/conflict.js'
import {TerminalConflictDialog} from '../src/chat/terminal-conflict-dialog.js'

const disposers: (() => void)[] = []

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

const SEND_TRIGGER = 'Send it with the mouse'
const BLOCKED_MESSAGE = 'Claude is working in your terminal right now.'

function mountRaisedByTheMouse(conflict: Conflict): void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const [raised, setRaised] = createSignal<Conflict>(NO_CONFLICT)
  const dispose = render(
    () => (
      <>
        <button type="button" onClick={() => setRaised(conflict)}>
          {SEND_TRIGGER}
        </button>
        <TerminalConflictDialog
          conflict={raised()}
          onCancel={() => setRaised(NO_CONFLICT)}
          onTakeOver={() => {}}
          onSendAnyway={() => {}}
        />
      </>
    ),
    host,
  )
  disposers.push(() => {
    dispose()
    host.remove()
  })
}

test('a take-over question raised by a mouse send lands the keyboard on the way out', async () => {
  mountRaisedByTheMouse({kind: 'attached', message: ATTACHED_MESSAGE})

  await page.getByRole('button', {name: SEND_TRIGGER}).click()

  await expect.element(page.getByRole('button', {name: 'Cancel'})).toHaveFocus()
})

test('a blocked send raised by the mouse lands the keyboard on its only way out', async () => {
  mountRaisedByTheMouse({kind: 'blocked', message: BLOCKED_MESSAGE})

  await page.getByRole('button', {name: SEND_TRIGGER}).click()

  await expect.element(page.getByRole('button', {name: 'OK'})).toHaveFocus()
})
