import './helpers/utilities.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import {render} from '@solidjs/testing-library'
import {expect, test, vi} from 'vitest'
import {page} from 'vitest/browser'
import {createSignal, onMount, type Component, type JSX} from 'solid-js'
import {makeRpcClient} from '@conciv/contract'
import {useChatSession} from '@conciv/client'
import {defineAttachment, defineExtension} from '@conciv/extension'
import {
  AttachmentByMime,
  ChatProvider,
  Composer,
  ComposerHandlersProvider,
  useComposerContext,
  type AttachmentAdapter,
} from '@conciv/ui-kit-chat'
import {paneAttachments} from '../src/pane/pane-attachments.js'

function fixtureExtension() {
  const attachment = defineAttachment({mime: 'application/x-fixture'})
  attachment.card((props) => (
    <div>
      <span>fixture player</span>
      {props.remove}
    </div>
  ))
  return defineExtension({name: 'fixture', attachments: [attachment]})
}

function AttachmentFeeder(props: {file: File}): JSX.Element {
  const composer = useComposerContext()
  onMount(() => void composer.addAttachment(props.file))
  return <></>
}

test('composer chip area renders the fixture card with a remove affordance', async () => {
  const {cards, adapter} = paneAttachments([fixtureExtension()], false)
  const file = new File(['{"x":1}'], 'fixture.bin', {type: 'application/x-fixture'})
  render(() => {
    const chat = useChatSession({
      rpc: makeRpcClient('http://127.0.0.1:9'),
      apiBase: 'http://127.0.0.1:9',
      sessionId: 'conciv_widget',
    })
    return (
      <ChatProvider chat={chat}>
        <ComposerHandlersProvider value={{onSend: () => {}, onCancel: () => {}}}>
          <Composer
            attachmentAdapter={adapter}
            AttachmentComponent={(slotProps) => <AttachmentByMime cards={cards} removable={slotProps.removable} />}
          >
            <AttachmentFeeder file={file} />
          </Composer>
        </ComposerHandlersProvider>
      </ChatProvider>
    )
  })
  await expect.element(page.getByText('fixture player'), {timeout: 2000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Remove fixture.bin'}), {timeout: 2000}).toBeVisible()
})

function crashingChipSetup() {
  const crashing = defineAttachment({mime: 'application/x-crashing'})
  crashing.card(() => {
    throw new Error('fixture crash')
  })
  const calm = defineAttachment({mime: 'application/x-fixture'})
  calm.card(() => <span>calm player</span>)
  const extension = defineExtension({name: 'crash-attachment', attachments: [crashing, calm]})
  return {
    ...paneAttachments([extension], false),
    crashingFile: new File(['{}'], 'crashing.bin', {type: 'application/x-crashing'}),
    calmFile: new File(['{}'], 'calm.bin', {type: 'application/x-fixture'}),
  }
}

function ComposerFixture(props: {
  adapter: AttachmentAdapter
  AttachmentComponent: Component<{removable?: boolean}>
  onSend?: (content: unknown) => void
  children: JSX.Element
}): JSX.Element {
  const chat = useChatSession({
    rpc: makeRpcClient('http://127.0.0.1:9'),
    apiBase: 'http://127.0.0.1:9',
    sessionId: 'conciv_widget',
  })
  return (
    <ChatProvider chat={chat}>
      <ComposerHandlersProvider value={{onSend: (content) => props.onSend?.(content), onCancel: () => {}}}>
        <Composer attachmentAdapter={props.adapter} AttachmentComponent={props.AttachmentComponent}>
          {props.children}
        </Composer>
      </ComposerHandlersProvider>
    </ChatProvider>
  )
}

test('a throwing attachment card reads as a failed card in the thread and a failed chip in the composer', async () => {
  const crash = vi.spyOn(console, 'error').mockImplementation(() => {})
  const {cards, chips, adapter, crashingFile, calmFile} = crashingChipSetup()
  render(() => (
    <ComposerFixture
      adapter={adapter}
      AttachmentComponent={(slotProps) => (
        <>
          <section aria-label="thread card">
            <AttachmentByMime cards={cards} />
          </section>
          <section aria-label="composer chip">
            <AttachmentByMime cards={chips} removable={slotProps.removable} />
          </section>
        </>
      )}
    >
      <AttachmentFeeder file={crashingFile} />
      <AttachmentFeeder file={calmFile} />
    </ComposerFixture>
  ))
  const threadCards = page.getByRole('region', {name: 'thread card'})
  const composerChips = page.getByRole('region', {name: 'composer chip'})

  await expect.element(threadCards.getByText('This card failed to render'), {timeout: 2000}).toBeVisible()
  await expect.element(composerChips.getByText('calm player').first(), {timeout: 2000}).toBeVisible()
  await expect
    .element(composerChips.getByRole('button', {name: 'Failed to render crash-attachment'}), {timeout: 2000})
    .toBeVisible()
  expect(crash.mock.calls.filter((call) => call[0] === '[conciv] extension "crash-attachment" crashed').length).toBe(2)
  crash.mockRestore()
})

test('removing a failed chip un-stages its attachment, so the next send carries none', async () => {
  const crash = vi.spyOn(console, 'error').mockImplementation(() => {})
  const {chips, adapter, crashingFile} = crashingChipSetup()
  render(() => {
    const [sent, setSent] = createSignal<string>()
    return (
      <>
        <ComposerFixture
          adapter={adapter}
          onSend={(content) => setSent(JSON.stringify(content))}
          AttachmentComponent={(slotProps) => <AttachmentByMime cards={chips} removable={slotProps.removable} />}
        >
          <AttachmentFeeder file={crashingFile} />
        </ComposerFixture>
        <p>sent {sent()}</p>
      </>
    )
  })
  const failedChip = page.getByRole('button', {name: 'Failed to render crash-attachment'})

  await expect.element(failedChip, {timeout: 2000}).toBeVisible()
  await page.screenshot({path: '__screenshots__/extension-boundary/failed-chip.png'})
  await page.getByRole('button', {name: 'Remove crashing.bin'}).click()
  await expect.element(failedChip).not.toBeInTheDocument()

  await page.getByRole('textbox').fill('no attachment here')
  await page.getByRole('button', {name: 'Send message'}).click()
  await expect.element(page.getByText('sent "no attachment here"'), {timeout: 2000}).toBeVisible()
  crash.mockRestore()
})

test('a failed chip names the extension whose card was selected, not an earlier declaration of the mime', async () => {
  const crash = vi.spyOn(console, 'error').mockImplementation(() => {})
  const declared = defineAttachment({mime: 'application/x-crashing'})
  const carded = defineAttachment({mime: 'application/x-crashing'})
  carded.card(() => {
    throw new Error('fixture crash')
  })
  const {chips, adapter} = paneAttachments(
    [
      defineExtension({name: 'declares-only', attachments: [declared]}),
      defineExtension({name: 'card-owner', attachments: [carded]}),
    ],
    false,
  )
  render(() => (
    <ComposerFixture
      adapter={adapter}
      AttachmentComponent={(slotProps) => <AttachmentByMime cards={chips} removable={slotProps.removable} />}
    >
      <AttachmentFeeder file={new File(['{}'], 'crashing.bin', {type: 'application/x-crashing'})} />
    </ComposerFixture>
  ))

  await expect.element(page.getByRole('button', {name: 'Failed to render card-owner'}), {timeout: 2000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Failed to render declares-only'})).not.toBeInTheDocument()
  crash.mockRestore()
})
