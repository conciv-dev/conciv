import {render} from 'solid-js/web'
import {afterEach, expect, test} from 'vitest'
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
import {paneAttachments} from '../src/chat/pane-attachments.js'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

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
  const host = document.createElement('div')
  document.body.appendChild(host)
  const file = new File(['{"x":1}'], 'fixture.bin', {type: 'application/x-fixture'})
  const dispose = render(() => {
    const chat = useChatSession({rpc: makeRpcClient('http://127.0.0.1:9'), sessionId: 'conciv_widget'})
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
  }, host)
  disposers.push(() => {
    dispose()
    host.remove()
  })
  await expect.poll(() => host.textContent).toContain('fixture player')
  expect(host.querySelector('button[aria-label="Remove fixture.bin"]')).not.toBeNull()
})
