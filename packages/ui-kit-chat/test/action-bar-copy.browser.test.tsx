import {page} from 'vitest/browser'
import {afterEach, expect, it} from 'vitest'
import type {JSX} from 'solid-js'
import {ActionBar} from '../src/primitives/action-bar/action-bar.js'
import {MessageProvider} from '../src/primitives/message/message-context.js'
import type {Turn} from '../src/store/grouping.js'
import {cleanupViews, mountView} from './mount-view.js'

const COPIED_MS = 2_000
const RE_ARM_AFTER_MS = 1_200
const PAST_FIRST_DEADLINE_MS = 1_250

const TURN: Turn = {
  key: 'assistant-1',
  role: 'assistant',
  parts: [{type: 'text', content: 'copied text'}],
  start: 0,
  end: 0,
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const copyButton = () => page.getByRole('button', {name: 'Copy'})

function mountCopyAction(): void {
  mountView(
    (): JSX.Element => (
      <MessageProvider
        value={{
          message: () => TURN,
          index: () => 0,
          pairing: () => ({byCallId: new Map(), hiddenResultIds: new Set()}),
          isLast: () => true,
        }}
      >
        <ActionBar.Copy copiedDuration={COPIED_MS}>copy</ActionBar.Copy>
      </MessageProvider>
    ),
  )
}

afterEach(() => {
  cleanupViews()
})

it('keeps the copied state when a second copy re-arms the window', async () => {
  mountCopyAction()
  await copyButton().click()
  await expect.element(copyButton(), {timeout: 1000}).toHaveAttribute('data-copied')
  await wait(RE_ARM_AFTER_MS)
  await copyButton().click()
  await wait(PAST_FIRST_DEADLINE_MS)
  await expect.element(copyButton(), {timeout: 300}).toHaveAttribute('data-copied')
})

it('drops the copied state once the re-armed window runs out', async () => {
  mountCopyAction()
  await copyButton().click()
  await expect.element(copyButton(), {timeout: 1000}).toHaveAttribute('data-copied')
  await wait(RE_ARM_AFTER_MS)
  await copyButton().click()
  await expect.element(copyButton(), {timeout: COPIED_MS * 2}).not.toHaveAttribute('data-copied')
})
