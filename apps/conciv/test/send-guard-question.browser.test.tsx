import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {render} from 'solid-js/web'
import {createSignal} from 'solid-js'
import type {MultimodalContent} from '@tanstack/ai-client'
import {makeSendGuard} from '../src/chat/send-guard.js'
import {TerminalConflictDialog} from '../src/chat/terminal-conflict-dialog.js'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

const MESSAGE = 'rename the widget package'
const SEND_LABEL = 'Send it'

function rpcError(code: string, message: string): Error {
  return Object.assign(new Error(message), {code})
}

type Scene = {
  sent: (string | MultimodalContent)[]
  reject: (error: unknown) => void
  setDelivered: (value: boolean) => void
}

function mountScene(): Scene {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const sent: (string | MultimodalContent)[] = []
  const [delivered, setDelivered] = createSignal(false)
  let reject: (error: unknown) => void = () => {}

  const dispose = render(() => {
    const guard = makeSendGuard({
      attached: () => false,
      delivered,
      snapshot: () => null,
      restore: () => {},
      clearDraft: () => {},
      grabs: () => [],
      stageGrabs: () => {},
      clearGrabs: () => {},
      focusComposer: () => {},
      detach: () => Promise.resolve(),
      dispatch: (content) => {
        sent.push(content)
        return new Promise(() => {})
      },
      onFailed: () => {},
    })
    reject = guard.rejected
    return (
      <>
        <button
          type="button"
          onClick={() => {
            if (guard.beforeSend(MESSAGE)) guard.onSend(MESSAGE)
          }}
        >
          {SEND_LABEL}
        </button>
        <TerminalConflictDialog
          conflict={guard.conflict()}
          onCancel={guard.cancel}
          onTakeOver={guard.takeOver}
          onSendAnyway={guard.sendAnyway}
        />
      </>
    )
  }, host)

  disposers.push(() => {
    dispose()
    host.remove()
  })
  return {sent, reject: (error) => reject(error), setDelivered}
}

const question = () => page.getByRole('alertdialog')
const sendAnyway = () => page.getByRole('button', {name: 'Send anyway'})

test('a question the message already outran closes itself instead of waiting on a dead answer', async () => {
  const scene = mountScene()

  await page.getByRole('button', {name: SEND_LABEL}).click()
  scene.reject(rpcError('EXTERNAL_CONFIRM', 'Claude is open in your terminal.'))
  await expect.element(sendAnyway()).toBeVisible()

  scene.setDelivered(true)
  scene.reject(rpcError('EXTERNAL_CONFIRM', 'Claude is open in your terminal.'))

  await expect.element(question()).not.toBeInTheDocument()
})

test('a later failure never turns the open question into buttons that do nothing', async () => {
  const scene = mountScene()

  await page.getByRole('button', {name: SEND_LABEL}).click()
  scene.reject(rpcError('EXTERNAL_CONFIRM', 'Claude is open in your terminal.'))
  await expect.element(sendAnyway()).toBeVisible()

  scene.reject(new Error('Failed to fetch'))
  await sendAnyway().click()

  await expect.element(question()).not.toBeInTheDocument()
  expect(scene.sent).toHaveLength(2)
})
