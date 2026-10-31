import {render} from '@solidjs/testing-library'
import {expect, test, vi} from 'vitest'
import {page} from 'vitest/browser'
import {onMount, type JSX} from 'solid-js'
import {makeRpcClient} from '@conciv/contract'
import {useChatSession} from '@conciv/client'
import {defineAttachment, defineExtension} from '@conciv/extension'
import {
  AttachmentByMime,
  ChatProvider,
  Composer,
  ComposerHandlersProvider,
  useComposerContext,
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

test('a throwing attachment card reads as a failed card in the thread and as nothing in the composer', async () => {
  const crash = vi.spyOn(console, 'error').mockImplementation(() => {})
  const crashing = defineAttachment({mime: 'application/x-crashing'})
  crashing.card(() => {
    throw new Error('fixture crash')
  })
  const calm = defineAttachment({mime: 'application/x-fixture'})
  calm.card(() => <span>calm player</span>)
  const extension = defineExtension({name: 'crash-attachment', attachments: [crashing, calm]})
  const {cards, chips, adapter} = paneAttachments([extension], false)
  const crashingFile = new File(['{}'], 'crashing.bin', {type: 'application/x-crashing'})
  const calmFile = new File(['{}'], 'calm.bin', {type: 'application/x-fixture'})
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
          </Composer>
        </ComposerHandlersProvider>
      </ChatProvider>
    )
  })
  const threadCards = page.getByRole('region', {name: 'thread card'})
  const composerChips = page.getByRole('region', {name: 'composer chip'})

  await expect.element(threadCards.getByText('This card failed to render'), {timeout: 2000}).toBeVisible()
  await expect.element(composerChips.getByText('calm player').first(), {timeout: 2000}).toBeVisible()
  await expect.element(composerChips.getByText('This card failed to render')).not.toBeInTheDocument()
  expect(crash.mock.calls.filter((call) => call[0] === '[conciv] extension "crash-attachment" crashed').length).toBe(2)
  crash.mockRestore()
})
