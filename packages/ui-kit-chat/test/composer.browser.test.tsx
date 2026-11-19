import 'virtual:uno.css'
import {page, userEvent} from 'vitest/browser'
import {expect, it, describe, onTestFinished, vi} from 'vitest'
import {
  type JSX,
  createSignal,
  For,
  Show,
  splitProps,
  untrack,
  onMount,
  type ParentProps,
  type Accessor,
} from 'solid-js'
import {ActionBar} from '../src/primitives/action-bar/action-bar.js'
import {MessageProvider} from '../src/primitives/message/message-context.js'
import {createTurnParts} from '../src/store/turn-parts.js'
import type {Turn} from '../src/store/grouping.js'
import {mountView, HARNESS_MODELS, RunSettledIndicator} from './helpers.js'
import {
  createChat,
  createChatSession,
  type ChatSessionCallbacks,
  type ChatSessionConnection,
  type ChatSessionHydration,
  type ConnectConnectionAdapter,
} from '@conciv/ai/client'
import {ChatEventType} from '@conciv/protocol/chat-event-types'
import {MAX_ATTACHMENT_RAW_BYTES} from '@conciv/protocol/chat-types'
import {ChatProvider} from '../src/store/chat-context.js'
import {Thread} from '../src/styled/thread.js'
import {ActionButton} from '../src/tools/styled/action-row.js'
import {createTextChunks, storyConnection, type StoryConnectionOptions} from '@conciv/ai/testkit'
import type {SendContent} from '@conciv/protocol/chat-message-types'
import {Chip, ChipRow} from '../src/tools/styled/chip.js'
import {range} from 'es-toolkit'
import {ComposerActions, ComposerActionsHost} from '../src/primitives/composer/composer-actions.js'
import {render} from '@solidjs/testing-library'
import {Composer as ComposerPrimitive} from '../src/primitives/composer/composer.js'
import {ComposerHandlersProvider, type ComposerHandlers} from '../src/primitives/composer/composer-handlers.js'
import {useComposerContext, type ComposerContextValue} from '../src/primitives/composer/composer-context.js'
import {
  composeAttachmentAdapters,
  createSimpleImageAttachmentAdapter,
  createTextAttachmentAdapter,
  type AttachmentAdapter,
  type CompleteAttachment,
} from '../src/primitives/attachment/attachment-adapter.js'
import {AttachmentProvider} from '../src/primitives/attachment/attachment.js'
import {AttachmentUI} from '../src/styled/attachment-ui.js'
import {SAMPLE_IMAGE_BASE64, SAMPLE_IMAGE_MIME} from '../src/store/sample-image.fixtures.js'
import type {WebStorage} from '@conciv/storage-history'
import type {ComposerDraftWriter} from '../src/behaviors/use-composer-draft.js'
import {Error as ErrorPrimitive} from '../src/primitives/error/error.js'
import {Composer} from '../src/styled/composer.js'
import {createStore} from 'solid-js/store'
import {makeEventListener} from '@solid-primitives/event-listener'
import type {ElementCapture} from '@conciv/protocol/element-capture-types'
import {
  ELEMENT_CAPTURE_FIXTURE_CSS,
  ELEMENT_CAPTURE_FIXTURE_DESCRIPTOR_ONLY,
  ELEMENT_CAPTURE_FIXTURE_FULL,
  ELEMENT_CAPTURE_FIXTURE_MASKED,
} from '../src/tools/element-capture.fixtures.js'
import {ElementPreview} from '../src/tools/styled/element-preview.js'
import {ModelSelector, type ModelOption} from '../src/primitives/model-selector/model-selector.js'
import {ModelSelector as StyledModelSelector} from '../src/styled/model-selector.js'
import {HarnessModelSelector} from '../src/styled/harness-model-selector.js'
import {useModelMenu} from '../src/primitives/model-selector/model-menu.js'
import {Thread as ThreadPrimitive} from '../src/primitives/thread/thread.js'
import {Suggestion} from '../src/primitives/suggestion/suggestion.js'

describe('action bar copy', () => {
  const COPIED_MS = 2_000

  const TURN: Turn = {
    key: 'assistant-1',
    role: 'assistant',
    parts: [{type: 'text', content: 'copied text'}],
    messages: [],
    before: undefined,
    start: 0,
    end: 0,
  }

  const copyButton = () => page.getByRole('button', {name: 'Copy'})

  const accept =
    (written: string[]) =>
    (text: string): Promise<void> => {
      written.push(text)
      return Promise.resolve()
    }

  function mountCopyAction(writeText: (text: string) => Promise<void>): void {
    mountView((): JSX.Element => (
      <MessageProvider
        value={{
          key: TURN.key,
          role: TURN.role,
          message: () => TURN,
          index: () => 0,
          parts: createTurnParts(() => TURN),
          isLast: () => true,
        }}
      >
        <ActionBar.Copy copiedDuration={COPIED_MS} writeText={writeText}>
          copy
        </ActionBar.Copy>
      </MessageProvider>
    ))
  }

  it('hands the message text to the clipboard', async () => {
    const written: string[] = []
    mountCopyAction(accept(written))

    await copyButton().click()

    await expect.element(copyButton(), {timeout: 1000}).toHaveAttribute('data-copied')
    expect(written).toEqual(['copied text'])
  })
})

describe('action bar inactive unreachable', () => {
  function twoDistinctRepliesConnection(): ConnectConnectionAdapter {
    let call = 0
    return {
      async *connect(_messages, _data, _abortSignal, runContext) {
        call += 1
        const messageId = `reply-${call}`
        const threadId = runContext?.threadId ?? 'story-thread'
        const runId = runContext?.runId ?? `story-run-${call}`
        yield {type: ChatEventType.RUN_STARTED, threadId, runId}
        yield {type: ChatEventType.TEXT_MESSAGE_START, messageId, role: 'assistant'}
        yield {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId, delta: 'reply'}
        yield {type: ChatEventType.TEXT_MESSAGE_END, messageId}
        yield {type: ChatEventType.RUN_FINISHED, threadId, runId}
      },
    }
  }

  function ComposedThread(): JSX.Element {
    const chat = createChat({threadId: 'action-bar-inactive-unreachable', connection: twoDistinctRepliesConnection()})
    return (
      <ChatProvider chat={chat}>
        <button type="button" onClick={() => void chat.sendMessage('one')}>
          ask-one
        </button>
        <button type="button" onClick={() => void chat.sendMessage('two')}>
          ask-two
        </button>
        <div class="flex flex-col h-96">
          <Thread>
            <Thread.Viewport>
              <Thread.Messages />
            </Thread.Viewport>
            <Thread.Composer>
              <span>composer region</span>
            </Thread.Composer>
          </Thread>
        </div>
      </ChatProvider>
    )
  }

  async function mountWithTwoAssistantReplies(): Promise<void> {
    mountView(() => <ComposedThread />)
    await page.getByRole('button', {name: 'ask-one'}).click()
    await expect.element(page.getByText('reply'), {timeout: 2000}).toBeVisible()
    await page.getByRole('button', {name: 'ask-two'}).click()
    await expect.element(page.getByText('reply').nth(1), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Copy'}).nth(1), {timeout: 2000}).toBeVisible()
  }

  it('restores reachability once the hidden bar becomes active on hover, and keeps focus when the pointer leaves', async () => {
    await mountWithTwoAssistantReplies()
    const firstCopy = page.getByRole('button', {name: 'Copy'}).first()

    await page.getByText('reply').first().hover({force: true})
    await expect.element(firstCopy).toBeVisible()

    await userEvent.tab()
    await expect.element(firstCopy).toHaveFocus()

    await page.getByText('one').hover()
    await expect.element(firstCopy).toHaveFocus()
  })
})

describe('action row', () => {
  it('fires onClick for a neutral action button', async () => {
    const [clicks, setClicks] = createSignal(0)
    mountView(() => (
      <>
        <ActionButton onClick={() => setClicks(clicks() + 1)}>Retry</ActionButton>
        <p>clicks {clicks()}</p>
      </>
    ))

    await userEvent.click(page.getByRole('button', {name: 'Retry'}))

    await expect.element(page.getByText('clicks 1')).toBeVisible()
  })
})

describe('assistant action bar reveal', () => {
  function ComposedThread(): JSX.Element {
    const chat = createChat({
      threadId: 'assistant-action-bar-reveal',
      connection: storyConnection({chunks: [...createTextChunks('On it.')], chunkDelay: 2}),
    })
    return (
      <ChatProvider chat={chat}>
        <button type="button" onClick={() => void chat.sendMessage('hello there')}>
          ask
        </button>
        <Thread>
          <Thread.Viewport>
            <Thread.Messages />
          </Thread.Viewport>
          <Thread.Composer>
            <span>composer region</span>
          </Thread.Composer>
        </Thread>
      </ChatProvider>
    )
  }

  async function mountWithAssistantReply(): Promise<void> {
    mountView(() => <ComposedThread />)
    await page.getByRole('button', {name: 'ask'}).click()
    await expect.element(page.getByText('On it.'), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Copy'})).toBeVisible()
  }

  it('keeps the assistant action bar reachable by Tab without hovering the turn first', async () => {
    await mountWithAssistantReply()

    await userEvent.tab()

    await expect.element(page.getByRole('button', {name: 'Copy'})).toHaveFocus()
  })

  it('says the copy did not land when the clipboard refuses a keyboard-activated copy', async () => {
    await mountWithAssistantReply()

    await userEvent.tab()
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByRole('button', {name: 'Copy failed'})).toBeVisible()
  })
})

describe('attachment image viewer', () => {
  const IMAGE = 'shot.png'
  const DOCUMENT = 'notes.txt'

  const imageFile = (): File =>
    new File([Uint8Array.from(atob(SAMPLE_IMAGE_BASE64), (character) => character.charCodeAt(0))], IMAGE, {
      type: SAMPLE_IMAGE_MIME,
    })
  const textFile = (): File => new File(['notes'], DOCUMENT, {type: 'text/plain'})

  const tile = () => page.getByRole('button', {name: `Open ${IMAGE}`})
  const viewer = () => page.getByRole('dialog', {name: IMAGE})
  const panel = () => page.getByRole('region', {name: 'panel'})

  function Panel(props: ParentProps): JSX.Element {
    return (
      <section aria-label="panel" data-conciv-panel class="[transform:translateX(0)] overflow-hidden">
        {props.children}
      </section>
    )
  }

  function Staged(props: {files: File[]}): JSX.Element {
    const composer = useComposerContext()
    onMount(() => props.files.forEach((file) => void composer.addAttachment(file)))
    return <></>
  }

  function mountComposer(
    files: File[],
    adapter: AttachmentAdapter = composeAttachmentAdapters([
      createSimpleImageAttachmentAdapter(),
      createTextAttachmentAdapter(),
    ]),
  ): void {
    render(() => {
      const chat = createChat({threadId: 'attachment-viewer', connection: storyConnection(untrack(() => undefined))})
      return (
        <ChatProvider chat={chat}>
          <Panel>
            <ComposerHandlersProvider value={{onSend: () => {}, onCancel: () => {}}}>
              <Composer attachmentAdapter={adapter}>
                <Staged files={files} />
              </Composer>
            </ComposerHandlersProvider>
          </Panel>
        </ChatProvider>
      )
    })
  }

  function mountSent(source: string): void {
    const attachment: CompleteAttachment = {
      id: 'sent',
      type: 'image',
      name: IMAGE,
      content: [{type: 'image', source: {type: 'url', value: source}}],
      status: {type: 'complete'},
    }
    render(() => (
      <Panel>
        <AttachmentProvider value={attachment}>
          <AttachmentUI />
        </AttachmentProvider>
      </Panel>
    ))
  }

  it('opens the full image outside the transformed panel, and toggles actual size', async () => {
    mountComposer([imageFile()])

    await tile().click()

    await expect.element(viewer().getByRole('img', {name: IMAGE})).toBeVisible()
    await expect.element(panel().getByRole('dialog')).not.toBeInTheDocument()
    await viewer().getByRole('button', {name: 'Show actual size'}).click()
    await expect.element(viewer().getByRole('button', {name: 'Fit to window'})).toBeVisible()
  })

  it('Escape closes the viewer and returns focus to the tile', async () => {
    mountComposer([imageFile()])

    await tile().click()
    await expect.element(viewer()).toBeVisible()
    await userEvent.keyboard('{Escape}')

    await expect.element(viewer()).not.toBeInTheDocument()
    await expect.element(tile()).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await viewer().getByRole('button', {name: 'Close'}).click()
    await expect.element(viewer()).not.toBeInTheDocument()
    await expect.element(tile()).toHaveFocus()
  })

  it('Remove drops the attachment without opening the viewer', async () => {
    mountComposer([imageFile()])

    await page.getByRole('button', {name: `Remove ${IMAGE}`}).click()

    await expect.element(tile()).not.toBeInTheDocument()
    await expect.element(viewer()).not.toBeInTheDocument()
  })

  it('a document tile stays inert', async () => {
    mountComposer([textFile()])

    await page.getByRole('button', {name: DOCUMENT}).click()

    await expect.element(page.getByRole('button', {name: `Open ${DOCUMENT}`})).not.toBeInTheDocument()
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
  })

  it('a refused image says why on its chip, by name and by a tooltip that opens on hover and keyboard focus and never blocks the input', async () => {
    const tooLarge = new File([new Uint8Array(MAX_ATTACHMENT_RAW_BYTES + 1)], 'huge.png', {type: 'image/png'})
    const reason = `huge.png exceeds the ${MAX_ATTACHMENT_RAW_BYTES / (1024 * 1024)}MB image limit`
    const tooltipCloseDelay = 80
    mountComposer([])

    await userEvent.upload(page.getByRole('button', {name: 'Choose File'}), [tooLarge])

    const refused = page.getByRole('button', {name: reason})
    await expect.element(refused).toBeVisible()
    await refused.hover()
    await expect.element(page.getByRole('tooltip').filter({hasText: reason})).toBeVisible()
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
    onTestFinished(() => {
      vi.useRealTimers()
    })
    await page.getByRole('textbox', {name: 'Message'}).click()
    await expect.element(page.getByRole('textbox', {name: 'Message'})).toHaveFocus()
    vi.advanceTimersByTime(tooltipCloseDelay)
    vi.useRealTimers()
    await expect.element(page.getByRole('tooltip').filter({hasText: reason})).not.toBeInTheDocument()
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    await expect.element(page.getByRole('button', {name: 'Remove huge.png'})).toHaveFocus()
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    await expect.element(refused).toHaveFocus()
    await expect.element(page.getByRole('tooltip').filter({hasText: reason})).toBeVisible()
    await expect.element(refused).toHaveAccessibleDescription(reason)
  })

  it('a refusal with an empty message still says why, by the file name', async () => {
    const silentRefusal: AttachmentAdapter = {
      accept: 'image/*',
      add: async ({file}) => ({
        id: 'silent',
        type: 'image',
        name: file.name,
        file,
        status: {type: 'incomplete', reason: 'error', message: ''},
      }),
      remove: async () => {},
      send: async () => {
        throw new Error('a refused attachment is never sent')
      },
    }
    mountComposer([], silentRefusal)

    await userEvent.upload(page.getByRole('button', {name: 'Choose File'}), [imageFile()])

    await expect.element(page.getByRole('button', {name: `${IMAGE} could not be attached`})).toBeVisible()
  })

  it('a sent image tile opens the viewer too', async () => {
    const source = `data:${SAMPLE_IMAGE_MIME};base64,${SAMPLE_IMAGE_BASE64}`
    mountSent(source)

    await tile().click()

    await expect.element(viewer().getByRole('img', {name: IMAGE})).toHaveAttribute('src', source)
    await expect.element(panel().getByRole('dialog')).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', {name: `Remove ${IMAGE}`})).not.toBeInTheDocument()
  })
})

describe('attachment only user message', () => {
  const GIF_BASE64 = 'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='

  function ThreadHost(props: {content: () => SendContent}): JSX.Element {
    const chat = createChat({
      threadId: 'attachment-only-user-message',
      connection: storyConnection({chunks: [], chunkDelay: 2}),
    })
    return (
      <ChatProvider chat={chat}>
        <button type="button" onClick={() => void chat.sendMessage(props.content())}>
          send
        </button>
        <Thread>
          <Thread.Viewport>
            <Thread.Messages />
          </Thread.Viewport>
        </Thread>
      </ChatProvider>
    )
  }

  it('a sent image shows in the user turn', async () => {
    const sentImage = (): SendContent => ({
      content: [
        {type: 'text', content: 'what color is this'},
        {type: 'image', source: {type: 'data', value: GIF_BASE64, mimeType: 'image/gif'}},
      ],
    })
    mountView(() => <ThreadHost content={sentImage} />)

    await page.getByRole('button', {name: 'send'}).click()

    await expect.element(page.getByText('what color is this'), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByRole('img', {name: 'image-1'})).toBeVisible()
  })

  it('an image sent as a data URL is named image, never by its data', async () => {
    const sentDataUrl = (): SendContent => ({
      content: [
        {type: 'text', content: 'what is in this'},
        {type: 'image', source: {type: 'url', value: `data:image/gif;base64,${GIF_BASE64}`}},
      ],
    })
    mountView(() => <ThreadHost content={sentDataUrl} />)

    await page.getByRole('button', {name: 'send'}).click()

    await expect.element(page.getByText('what is in this'), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Open image', exact: true})).toBeVisible()
    await expect.element(page.getByRole('img', {name: 'image', exact: true})).toBeVisible()
    await expect.element(page.getByRole('button', {name: /base64/})).not.toBeInTheDocument()
  })
})

describe('chip', () => {
  it('renders a field chip showing its name and value', async () => {
    mountView(() => (
      <ChipRow>
        <Chip name="role" value="textbox" />
      </ChipRow>
    ))

    await expect.element(page.getByText('role')).toBeVisible()
    await expect.element(page.getByText('textbox')).toBeVisible()
  })

  const LONG_VALUE = 'Frontend engineer who ships accessible interfaces and keeps the design system honest'
  const CHIP_LIST = 'm-0 p-0 list-none flex flex-row gap-1.5'
  const CHIP_SLOT = 'flex min-w-0'

  function chipShowing(host: Element, value: string): HTMLElement {
    for (const node of host.querySelectorAll('[data-scope="tooltip"][data-part="trigger"]')) {
      if (node instanceof HTMLElement && node.textContent === value) return node
    }
    throw new Error(`no chip reading "${value}" hosts a tooltip trigger`)
  }

  it('reveals a clipped chip value in a tooltip without being asked for one', async () => {
    mountView(() => (
      <ul class={CHIP_LIST}>
        <li class={CHIP_SLOT} aria-label="clipped chip">
          <Chip kind="pill" maxWidth="compact" value={LONG_VALUE} />
        </li>
      </ul>
    ))

    await page.getByRole('listitem', {name: 'clipped chip'}).hover()

    await expect.element(page.getByRole('tooltip')).toHaveTextContent(LONG_VALUE)
  })

  it('leaves a chip value that fits without a tooltip', async () => {
    const host = mountView(() => (
      <ul class={CHIP_LIST}>
        <li class={CHIP_SLOT} aria-label="clipped chip">
          <Chip kind="pill" maxWidth="compact" value={LONG_VALUE} />
        </li>
        <li class={CHIP_SLOT} aria-label="fitting chip">
          <Chip kind="pill" maxWidth="compact" value="idle" />
        </li>
      </ul>
    ))

    await page.getByRole('listitem', {name: 'clipped chip'}).hover()
    await expect.element(page.getByRole('tooltip')).toHaveTextContent(LONG_VALUE)

    await page.getByRole('listitem', {name: 'fitting chip'}).hover()

    await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument()
    expect(chipShowing(host, 'idle').hasAttribute('aria-describedby')).toBe(false)
  })
})

describe('composer actions', () => {
  const WIDE_PX = 400
  const ONE_SLOT_PX = 170
  const NO_SLOT_PX = 100
  const LEADING_BUDGET_PX = 220

  function Glyph(): JSX.Element {
    return <span aria-hidden="true" class="size-5 block" />
  }

  function Slots(props: {count: number}): JSX.Element {
    const [local] = splitProps(props, ['count'])
    return <For each={range(local.count)}>{() => <span class="size-8.5 block" />}</For>
  }

  function Fixture(props: {
    width: number
    maxInlineAuto?: number
    leading?: JSX.Element
    trailing?: JSX.Element
    onOverflowDismissed?: () => void
    children: JSX.Element
  }): JSX.Element {
    const [local] = splitProps(props, [
      'width',
      'maxInlineAuto',
      'leading',
      'trailing',
      'onOverflowDismissed',
      'children',
    ])
    return (
      <div style={{width: `${local.width}px`}}>
        <ComposerActionsHost maxInlineAuto={local.maxInlineAuto} onOverflowDismissed={local.onOverflowDismissed}>
          <ComposerActions.Trigger>
            <Glyph />
          </ComposerActions.Trigger>
          <ComposerActions.Leading>{local.leading}</ComposerActions.Leading>
          <ComposerActions.Trailing>{local.trailing ?? <Slots count={1} />}</ComposerActions.Trailing>
          {local.children}
        </ComposerActionsHost>
      </div>
    )
  }

  function StatusRegion(props: {picks: string[]}): JSX.Element {
    const [local] = splitProps(props, ['picks'])
    return <p role="status">{local.picks.join(' ')}</p>
  }

  function GrabAction(): JSX.Element {
    return (
      <ComposerActions.ActionButton
        visible="always"
        priority={40}
        tooltip="Select an element"
        onClick={() => undefined}
      >
        <Glyph />
      </ComposerActions.ActionButton>
    )
  }

  function NewSessionAction(): JSX.Element {
    return (
      <ComposerActions.ActionButton priority={30} tooltip="Start a new session" onClick={() => undefined}>
        <Glyph />
      </ComposerActions.ActionButton>
    )
  }

  function CompactAction(props: {onSelect?: () => void}): JSX.Element {
    const [local] = splitProps(props, ['onSelect'])
    return (
      <ComposerActions.ActionButton
        priority={20}
        tooltip="Compress the conversation"
        onClick={() => local.onSelect?.()}
      >
        <Glyph />
      </ComposerActions.ActionButton>
    )
  }

  function StandardActions(props: {onCompactSelect?: () => void}): JSX.Element {
    const [local] = splitProps(props, ['onCompactSelect'])
    return (
      <>
        <GrabAction />
        <NewSessionAction />
        <CompactAction onSelect={local.onCompactSelect} />
      </>
    )
  }

  function MenuOnlyAction(props: {onSelect: () => void}): JSX.Element {
    const [local] = splitProps(props, ['onSelect'])
    return (
      <ComposerActions.Action priority={5}>
        <ComposerActions.ActionMenuItem label="Menu only action" onSelect={() => local.onSelect()} />
      </ComposerActions.Action>
    )
  }

  const trigger = () => page.getByRole('button', {name: 'More composer actions'})
  const overflowMenu = () => page.getByRole('menu', {name: 'More composer actions'})
  const grabButton = () => page.getByRole('button', {name: 'Select an element'})
  const newSessionButton = () => page.getByRole('button', {name: 'Start a new session'})
  const compactButton = () => page.getByRole('button', {name: 'Compress the conversation'})
  const compactItem = () => page.getByRole('menuitem', {name: 'Compress the conversation'})
  const status = () => page.getByRole('status')

  it('keeps every action inline and hides the overflow trigger when the row is wide', async () => {
    mountView(() => (
      <Fixture width={WIDE_PX}>
        <StandardActions />
      </Fixture>
    ))

    await expect.element(grabButton()).toBeVisible()
    await expect.element(newSessionButton()).toBeVisible()
    await expect.element(compactButton()).toBeVisible()
    await expect.element(trigger()).not.toBeInTheDocument()
  })

  it('keeps every auto action in the overflow menu when the host caps inline auto actions at zero', async () => {
    const [picks, setPicks] = createSignal<string[]>(['idle'])
    mountView(() => (
      <>
        <StatusRegion picks={picks()} />
        <Fixture width={WIDE_PX} maxInlineAuto={0}>
          <StandardActions onCompactSelect={() => setPicks((current) => [...current, 'compact'])} />
        </Fixture>
      </>
    ))

    await expect.element(grabButton()).toBeVisible()
    await expect.element(trigger()).toBeVisible()
    await expect.element(newSessionButton()).not.toBeInTheDocument()
    await expect.element(compactButton()).not.toBeInTheDocument()

    await userEvent.click(trigger())
    await expect.element(page.getByRole('menuitem', {name: 'Start a new session'})).toBeVisible()
    await userEvent.click(compactItem())

    await expect.element(status()).toHaveTextContent('idle compact')
  })

  it('shows only as many auto actions inline as the cap allows while the row has room for more', async () => {
    mountView(() => (
      <Fixture width={WIDE_PX} maxInlineAuto={1}>
        <StandardActions />
      </Fixture>
    ))

    await expect.element(grabButton()).toBeVisible()
    await expect.element(newSessionButton()).toBeVisible()
    await expect.element(compactButton()).not.toBeInTheDocument()
    await expect.element(trigger()).toBeVisible()
  })

  it('collapses the lowest-priority action into the overflow menu and runs it from there', async () => {
    const [picks, setPicks] = createSignal<string[]>(['idle'])
    mountView(() => (
      <>
        <StatusRegion picks={picks()} />
        <Fixture width={ONE_SLOT_PX}>
          <StandardActions onCompactSelect={() => setPicks((current) => [...current, 'compact'])} />
        </Fixture>
      </>
    ))

    await expect.element(newSessionButton()).toBeVisible()
    await expect.element(compactButton()).not.toBeInTheDocument()
    await expect.element(trigger()).toHaveAttribute('aria-haspopup', 'menu')
    await expect.element(trigger()).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(trigger())

    await expect.element(trigger()).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(compactItem())

    await expect.element(status()).toHaveTextContent('idle compact')
    await expect.element(compactItem()).not.toBeInTheDocument()
  })

  it('keeps a pinned action inline while every auto action collapses', async () => {
    mountView(() => (
      <Fixture width={NO_SLOT_PX}>
        <GrabAction />
        <NewSessionAction />
      </Fixture>
    ))

    await expect.element(trigger()).toBeVisible()
    await expect.element(grabButton()).toBeVisible()
    await expect.element(newSessionButton()).not.toBeInTheDocument()
  })

  it('charges the leading region against the fit budget', async () => {
    const [crowded, setCrowded] = createSignal(true)
    mountView(() => (
      <Fixture
        width={LEADING_BUDGET_PX}
        leading={
          <Show when={crowded()}>
            <Slots count={1} />
          </Show>
        }
      >
        <GrabAction />
        <NewSessionAction />
        <CompactAction />
      </Fixture>
    ))

    await expect.element(newSessionButton()).toBeVisible()
    await expect.element(compactButton()).not.toBeInTheDocument()

    setCrowded(false)

    await expect.element(compactButton()).toBeVisible()
    await expect.element(trigger()).not.toBeInTheDocument()
  })

  it('hides an inline-only action when it collapses and keeps the trigger away', async () => {
    mountView(() => (
      <Fixture width={NO_SLOT_PX}>
        <GrabAction />
        <ComposerActions.Inline priority={10}>
          <span role="img" aria-label="Inline only chip" class="size-8.5 block" />
        </ComposerActions.Inline>
      </Fixture>
    ))

    await expect.element(grabButton()).toBeVisible()
    await expect.element(page.getByRole('img', {name: 'Inline only chip'})).not.toBeInTheDocument()
    await expect.element(trigger()).not.toBeInTheDocument()
  })

  it('renders an item-only action in the overflow menu even when the row is wide', async () => {
    const [picks, setPicks] = createSignal<string[]>(['idle'])
    mountView(() => (
      <>
        <StatusRegion picks={picks()} />
        <Fixture width={WIDE_PX}>
          <MenuOnlyAction onSelect={() => setPicks((current) => [...current, 'menu-only'])} />
        </Fixture>
      </>
    ))

    await expect.element(trigger()).toBeVisible()
    await userEvent.click(trigger())
    await userEvent.click(page.getByRole('menuitem', {name: 'Menu only action'}))

    await expect.element(status()).toHaveTextContent('idle menu-only')
  })

  it('keeps a multi-item action contiguous and ordered by priority in the overflow menu', async () => {
    mountView(() => (
      <Fixture width={NO_SLOT_PX}>
        <ComposerActions.Action priority={30}>
          <ComposerActions.ActionButton tooltip="Alpha" onClick={() => undefined}>
            <Glyph />
          </ComposerActions.ActionButton>
          <ComposerActions.ActionMenuItem label="Alpha one" onSelect={() => undefined} />
          <ComposerActions.ActionMenuItem label="Alpha two" onSelect={() => undefined} />
        </ComposerActions.Action>
        <ComposerActions.Action priority={20}>
          <ComposerActions.ActionButton tooltip="Bravo" onClick={() => undefined}>
            <Glyph />
          </ComposerActions.ActionButton>
          <ComposerActions.ActionMenuItem label="Bravo one" onSelect={() => undefined} />
        </ComposerActions.Action>
      </Fixture>
    ))

    await userEvent.click(trigger())

    await expect.element(overflowMenu()).toMatchTextContent(/Alpha one\s*Alpha two\s*Bravo one/)
  })

  it('disables both renderings of a disabled action and keeps its menu item out of reach', async () => {
    const [width, setWidth] = createSignal(WIDE_PX)
    const [picks, setPicks] = createSignal<string[]>(['idle'])
    mountView(() => (
      <>
        <StatusRegion picks={picks()} />
        <Fixture width={width()}>
          <ComposerActions.ActionButton priority={20} tooltip="Enabled action" onClick={() => undefined}>
            <Glyph />
          </ComposerActions.ActionButton>
          <ComposerActions.ActionButton
            priority={10}
            tooltip="Disabled action"
            disabled={() => true}
            onClick={() => undefined}
          >
            <Glyph />
          </ComposerActions.ActionButton>
          <MenuOnlyAction onSelect={() => setPicks((current) => [...current, 'menu-only'])} />
        </Fixture>
      </>
    ))

    await expect.element(page.getByRole('button', {name: 'Disabled action'})).toBeDisabled()

    setWidth(120)

    await expect.element(page.getByRole('button', {name: 'Disabled action'})).not.toBeInTheDocument()
    await userEvent.click(trigger())
    await expect.element(page.getByRole('menuitem', {name: 'Disabled action'})).toHaveAttribute('aria-disabled', 'true')

    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')

    await expect.element(status()).toHaveTextContent('idle menu-only')
  })

  it('closes the overflow menu and hands focus back to the app when the row widens', async () => {
    const [width, setWidth] = createSignal(ONE_SLOT_PX)
    const [picks, setPicks] = createSignal<string[]>(['idle'])
    mountView(() => (
      <>
        <StatusRegion picks={picks()} />
        <Fixture width={width()} onOverflowDismissed={() => setPicks((current) => [...current, 'dismissed'])}>
          <StandardActions />
        </Fixture>
      </>
    ))

    await userEvent.click(trigger())
    await expect.element(compactItem()).toBeVisible()

    setWidth(WIDE_PX)

    await expect.element(status()).toHaveTextContent('idle dismissed')
    await expect.element(overflowMenu()).not.toBeInTheDocument()
    await expect.element(compactButton()).toBeVisible()
  })
})

describe('composer attachment ops', () => {
  function textFile(body: string, name: string): File {
    return new File([body], name, {type: 'text/plain'})
  }

  function ChatHost(props: ParentProps): JSX.Element {
    const chat = createChat({
      threadId: 'composer-attachment-ops',
      connection: storyConnection(untrack(() => undefined)),
    })
    return (
      <ChatProvider chat={chat}>
        <ComposerHandlersProvider value={{}}>{props.children}</ComposerHandlersProvider>
      </ChatProvider>
    )
  }

  function ContextProbe(props: {onReady: (context: ComposerContextValue) => void}): JSX.Element {
    const context = useComposerContext()
    untrack(() => props.onReady(context))
    return null
  }

  function mountComposer(): ComposerContextValue {
    let captured: ComposerContextValue | undefined
    render(() => (
      <ChatHost>
        <ComposerPrimitive.Root attachmentAdapter={createTextAttachmentAdapter()}>
          <ComposerPrimitive.Input aria-label="Message" />
          <ContextProbe
            onReady={(context) => {
              captured = context
            }}
          />
        </ComposerPrimitive.Root>
      </ChatHost>
    ))
    if (!captured) throw new Error('expected the composer context to be captured')
    return captured
  }

  it('addAttachment resolves the id of the attachment it created', async () => {
    const composer = mountComposer()

    const id = await composer.addAttachment(textFile('one', 'one.txt'))

    expect(id).not.toBeNull()
    expect(composer.hasAttachment(id ?? '')).toBe(true)
  })

  it('hasAttachment stops reporting an attachment once it is removed', async () => {
    const composer = mountComposer()
    const id = await composer.addAttachment(textFile('one', 'one.txt'))
    if (!id) throw new Error('expected the attachment to be added')

    await composer.removeAttachment(id)

    expect(composer.hasAttachment(id)).toBe(false)
  })

  it('replaceAttachment swaps the payload in place and keeps its position', async () => {
    const composer = mountComposer()
    const first = await composer.addAttachment(textFile('one', 'one.txt'))
    const second = await composer.addAttachment(textFile('two', 'two.txt'))
    if (!first || !second) throw new Error('expected both attachments to be added')

    const replaced = await composer.replaceAttachment(first, textFile('uno', 'uno.txt'))

    expect(replaced).not.toBeNull()
    expect(composer.attachments().map((entry) => entry.name)).toEqual(['uno.txt', 'two.txt'])
  })

  it('replaceAttachment is a no-op once the attachment is gone', async () => {
    const composer = mountComposer()
    const id = await composer.addAttachment(textFile('one', 'one.txt'))
    if (!id) throw new Error('expected the attachment to be added')
    await composer.removeAttachment(id)

    expect(await composer.replaceAttachment(id, textFile('uno', 'uno.txt'))).toBeNull()
    expect(composer.attachments()).toHaveLength(0)
  })
})

describe('composer completion', () => {
  const DRAFT_KEY = 'composer-draft-test'

  function createProbeStorage(seed?: string): {storage: WebStorage; written: Accessor<string | null>} {
    const [written, setWritten] = createSignal<string | null>(seed ?? null)
    return {
      storage: {
        getItem: () => written(),
        setItem: (_key, value) => setWritten(value),
      },
      written,
    }
  }

  function ChatHost(
    props: ParentProps<{connection?: StoryConnectionOptions; handlers?: ComposerHandlers}>,
  ): JSX.Element {
    const chat = createChat({
      threadId: 'composer-completion',
      connection: storyConnection(untrack(() => props.connection)),
    })
    const handlers = untrack(() => props.handlers ?? {})
    return (
      <ChatProvider chat={chat}>
        <ComposerHandlersProvider value={handlers}>{props.children}</ComposerHandlersProvider>
      </ChatProvider>
    )
  }

  function ComposerHarness(props: {
    storage?: WebStorage
    writer?: ComposerDraftWriter
    adapter?: AttachmentAdapter
  }): JSX.Element {
    return (
      <ComposerPrimitive.Root
        draftStorage={props.storage}
        draftWriter={props.writer}
        draftKey={DRAFT_KEY}
        attachmentAdapter={props.adapter ?? createSimpleImageAttachmentAdapter()}
      >
        <ComposerPrimitive.Input aria-label="Message" />
        <AttachKeptImage />
        <ComposerPrimitive.Quote />
        <ComposerPrimitive.Send>Send</ComposerPrimitive.Send>
        <ErrorPrimitive.Root>
          <ErrorPrimitive.Message />
        </ErrorPrimitive.Root>
      </ComposerPrimitive.Root>
    )
  }

  function AttachKeptImage(): JSX.Element {
    const composer = useComposerContext()
    const image = new File(
      [Uint8Array.from(atob(SAMPLE_IMAGE_BASE64), (character) => character.charCodeAt(0))],
      'kept.png',
      {
        type: SAMPLE_IMAGE_MIME,
      },
    )
    return (
      <button type="button" onClick={() => void composer.addAttachment(image)}>
        Attach kept.png
      </button>
    )
  }

  function seeded(draft: {text?: string; quote?: string | null}): string {
    return JSON.stringify({
      text: draft.text ?? '',
      quote: draft.quote ?? null,
      attachments: [],
    })
  }

  it('persists the typed draft into the supplied storage', async () => {
    const probe = createProbeStorage()
    mountView(() => (
      <ChatHost>
        <ComposerHarness storage={probe.storage} />
        <p>persisted: {probe.written() ?? 'nothing'}</p>
      </ChatHost>
    ))

    await page.getByRole('textbox', {name: 'Message'}).fill('a draft that outlives the reload')

    await expect
      .element(page.getByText(/persisted: .*"text":"a draft that outlives the reload"/), {timeout: 3000})
      .toBeVisible()
  })

  it('hands every change to the draft writer at once, with its files, and leaves the storage alone', async () => {
    const probe = createProbeStorage()
    const [writes, setWrites] = createSignal<readonly string[]>([])
    const writer: ComposerDraftWriter = (key, draft) => {
      const files = draft.attachments.map((attachment) =>
        attachment.file instanceof File ? `${attachment.file.name} as a File` : 'no file',
      )
      setWrites((current) => [...current, `${key}: "${draft.draft}" [${files.join(', ')}]`])
    }
    mountView(() => (
      <ChatHost>
        <ComposerHarness storage={probe.storage} writer={writer} />
        <p>writes: {writes().length}</p>
        <p>last write: {writes().at(-1) ?? 'none'}</p>
        <p>storage: {probe.written() ?? 'untouched'}</p>
      </ChatHost>
    ))

    await expect.element(page.getByText('writes: 0')).toBeVisible()
    await userEvent.click(page.getByRole('textbox', {name: 'Message'}))
    await userEvent.keyboard('h')
    await expect.element(page.getByText('writes: 1')).toBeVisible()
    await expect.element(page.getByText(`last write: ${DRAFT_KEY}: "h" []`)).toBeVisible()
    await userEvent.keyboard('i')
    await expect.element(page.getByText('writes: 2')).toBeVisible()
    await expect.element(page.getByText(`last write: ${DRAFT_KEY}: "hi" []`)).toBeVisible()

    await userEvent.click(page.getByRole('button', {name: 'Attach kept.png'}))
    await expect.element(page.getByText(`last write: ${DRAFT_KEY}: "hi" [kept.png as a File]`)).toBeVisible()

    await userEvent.click(page.getByRole('textbox', {name: 'Message'}))
    await userEvent.keyboard('{Backspace}{Backspace}')
    await expect.element(page.getByText(`last write: ${DRAFT_KEY}: "" [kept.png as a File]`)).toBeVisible()
    await expect.element(page.getByText('storage: untouched')).toBeVisible()
  })

  it('restores a persisted draft and quote when the composer mounts', async () => {
    const probe = createProbeStorage(seeded({text: 'kept across the reload', quote: 'a quoted line'}))
    mountView(() => (
      <ChatHost>
        <ComposerHarness storage={probe.storage} />
      </ChatHost>
    ))

    await expect.element(page.getByRole('textbox', {name: 'Message'})).toHaveValue('kept across the reload')
    await expect.element(page.getByText('a quoted line')).toBeVisible()
  })

  it("keeps a host's blob reference on an attachment through a refused send, untouched", async () => {
    const images = createSimpleImageAttachmentAdapter()
    const adapter: AttachmentAdapter = {
      ...images,
      add: (state) => {
        const added = images.add(state)
        if (!(added instanceof Promise)) return added
        return added.then((pending) => ({...pending, blob: {id: 'stored-kept', url: ''}}))
      },
    }
    const [blobs, setBlobs] = createSignal('none')
    const writer: ComposerDraftWriter = (_key, draft) =>
      setBlobs(draft.attachments.map((attachment) => attachment.blob?.id ?? 'no blob').join(', '))
    const handlers: ComposerHandlers = {onSend: () => Promise.reject(new Error('the server rejected the send'))}
    mountView(() => (
      <ChatHost handlers={handlers}>
        <ComposerHarness writer={writer} adapter={adapter} />
        <p>blobs: {blobs()}</p>
      </ChatHost>
    ))

    await userEvent.click(page.getByRole('button', {name: 'Attach kept.png'}))
    await expect.element(page.getByText('blobs: stored-kept')).toBeVisible()
    await userEvent.click(page.getByRole('textbox', {name: 'Message'}))
    await userEvent.keyboard('send the image')
    await userEvent.click(page.getByRole('button', {name: 'Send'}))
    await expect.element(page.getByRole('textbox', {name: 'Message'})).toHaveValue('send the image')
    await expect.element(page.getByText('blobs: stored-kept')).toBeVisible()
  })

  it('restores the draft when the send handler rejects', async () => {
    const [sendError, setSendError] = createSignal('')
    const handlers: ComposerHandlers = {
      onSend: () => Promise.reject(new Error('the server rejected the send')),
      onSendError: (error) => setSendError(error instanceof Error ? error.message : String(error)),
    }
    mountView(() => (
      <ChatHost handlers={handlers}>
        <ComposerHarness />
        <p>send failed: {sendError()}</p>
      </ChatHost>
    ))

    await page.getByRole('textbox', {name: 'Message'}).fill('a message the server refuses')
    await page.getByRole('button', {name: 'Send'}).click()

    await expect.element(page.getByText('send failed: the server rejected the send')).toBeVisible()
    await expect.element(page.getByRole('textbox', {name: 'Message'})).toHaveValue('a message the server refuses')
  })

  it('keeps the draft out of the composer when a run the engine started reports an error', async () => {
    const [sendError, setSendError] = createSignal('')
    const handlers: ComposerHandlers = {
      onSendError: (error) => setSendError(error instanceof Error ? error.message : String(error)),
    }
    mountView(() => (
      <ChatHost handlers={handlers} connection={{shouldError: true, error: new Error('the run failed')}}>
        <ComposerHarness />
        <p>send failed: {sendError()}</p>
      </ChatHost>
    ))

    await page.getByRole('textbox', {name: 'Message'}).fill('a message the run accepted')
    await page.getByRole('button', {name: 'Send'}).click()

    await expect.element(page.getByText('send failed: the run failed')).toBeVisible()
    await expect.element(page.getByRole('textbox', {name: 'Message'})).toHaveValue('')
  })

  function ItemsProbe(props: {onReady: (context: ComposerContextValue) => void}): JSX.Element {
    const context = useComposerContext()
    untrack(() => props.onReady(context))
    const shown = () =>
      context
        .items()
        .map((item) => `${item.key}=${JSON.stringify(item.value)}`)
        .join(' ')
    return <p>items: {shown() || 'none'}</p>
  }

  function mountItemsComposer(
    storage: WebStorage,
    handlers: ComposerHandlers,
  ): {
    composer: ComposerContextValue
    unmount: () => void
  } {
    let captured: ComposerContextValue | undefined
    const mounted = render(() => (
      <ChatHost handlers={handlers}>
        <ComposerPrimitive.Root draftStorage={storage} draftKey={DRAFT_KEY}>
          <ComposerPrimitive.Input aria-label="Message" />
          <ComposerPrimitive.Send>Send</ComposerPrimitive.Send>
          <ItemsProbe
            onReady={(context) => {
              captured = context
            }}
          />
        </ComposerPrimitive.Root>
      </ChatHost>
    ))
    if (!captured) throw new Error('expected the composer context to be captured')
    return {composer: captured, unmount: mounted.unmount}
  }

  it('attaching the same key twice keeps the first, the items outlive a restore, a failed send and a reload, and a draft of items alone is sent with them', async () => {
    const probe = createProbeStorage()
    const [sendError, setSendError] = createSignal('')
    const [sent, setSent] = createSignal('nothing')
    const handlers: ComposerHandlers = {
      onSend: () => Promise.reject(new Error('the server rejected the send')),
      onSendError: (error) => setSendError(error instanceof Error ? error.message : String(error)),
    }
    mountView(() => (
      <>
        <p>send failed: {sendError() || 'not yet'}</p>
        <p>persisted: {probe.written() ?? 'nothing'}</p>
        <p>sent: {sent()}</p>
      </>
    ))
    const first = mountItemsComposer(probe.storage, handlers)

    first.composer.addItem({key: 'note:grab:c=1', value: {comment: 'make it blue'}})
    first.composer.addItem({key: 'note:grab:c=1', value: {comment: 'make it red'}})
    first.composer.addItem({key: 'note:recorder:c=2', value: ['a', 1, null]})
    await expect
      .element(page.getByText('items: note:grab:c=1={"comment":"make it blue"} note:recorder:c=2=["a",1,null]'))
      .toBeVisible()

    first.composer.updateItem('note:grab:c=1', {comment: 'make it green'})
    first.composer.removeItem('note:recorder:c=2')
    await expect.element(page.getByText('items: note:grab:c=1={"comment":"make it green"}')).toBeVisible()

    const snapshot = first.composer.snapshotDraft()
    first.composer.clearDraft()
    await expect.element(page.getByText('items: none')).toBeVisible()
    first.composer.restoreDraft(snapshot)
    await expect.element(page.getByText('items: note:grab:c=1={"comment":"make it green"}')).toBeVisible()

    await page.getByRole('textbox', {name: 'Message'}).fill('a message the server refuses')
    await page.getByRole('button', {name: 'Send'}).click()
    await expect.element(page.getByText('send failed: the server rejected the send')).toBeVisible()
    await expect.element(page.getByRole('textbox', {name: 'Message'})).toHaveValue('a message the server refuses')
    await expect.element(page.getByText('items: note:grab:c=1={"comment":"make it green"}')).toBeVisible()

    await expect
      .element(
        page.getByText(
          /persisted: .*"text":"a message the server refuses".*"items":\[\{"key":"note:grab:c=1","value":\{"comment":"make it green"\}\}\]/,
        ),
      )
      .toBeVisible()
    first.unmount()
    mountItemsComposer(probe.storage, {
      onSend: (content, draft) => {
        setSent(`${JSON.stringify(content)} with ${JSON.stringify(draft.items)}`)
      },
    })
    await expect.element(page.getByRole('textbox', {name: 'Message'})).toHaveValue('a message the server refuses')
    await expect.element(page.getByText('items: note:grab:c=1={"comment":"make it green"}')).toBeVisible()

    await userEvent.click(page.getByRole('textbox', {name: 'Message'}))
    await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}{Backspace}')
    await expect.element(page.getByRole('textbox', {name: 'Message'})).toHaveValue('')
    await expect.element(page.getByRole('button', {name: 'Send'})).toBeEnabled()
    await page.getByRole('button', {name: 'Send'}).click()
    await expect
      .element(page.getByText('sent: "" with [{"key":"note:grab:c=1","value":{"comment":"make it green"}}]'))
      .toBeVisible()
    await expect.element(page.getByText('items: none')).toBeVisible()
  })

  it('a note staged while the attachments finish stays staged after the send', async () => {
    const held = Promise.withResolvers<void>()
    const text = createTextAttachmentAdapter()
    const adapter: AttachmentAdapter = {...text, send: (attachment) => held.promise.then(() => text.send(attachment))}
    const [sent, setSent] = createSignal('nothing')
    let captured: ComposerContextValue | undefined
    mountView(() => (
      <ChatHost
        handlers={{
          onSend: (_content, draft) => {
            setSent(JSON.stringify(draft.items))
          },
        }}
      >
        <ComposerPrimitive.Root attachmentAdapter={adapter}>
          <ComposerPrimitive.Input aria-label="Message" />
          <ComposerPrimitive.Send>Send</ComposerPrimitive.Send>
          <ItemsProbe
            onReady={(context) => {
              captured = context
            }}
          />
        </ComposerPrimitive.Root>
        <p>sent: {sent()}</p>
      </ChatHost>
    ))
    if (!captured) throw new Error('expected the composer context to be captured')
    const composer = captured

    composer.addItem({key: 'note:grab:c=1', value: {comment: 'sent with the message'}})
    await composer.addAttachment(new File(['body'], 'held.txt', {type: 'text/plain'}))
    await page.getByRole('textbox', {name: 'Message'}).fill('a message with a held attachment')
    await page.getByRole('button', {name: 'Send'}).click()
    await expect.element(page.getByRole('button', {name: 'Send'})).toBeDisabled()

    composer.addItem({key: 'note:grab:c=2', value: {comment: 'staged while it finished'}})
    held.resolve()

    await expect
      .element(page.getByText('sent: [{"key":"note:grab:c=1","value":{"comment":"sent with the message"}}]'))
      .toBeVisible()
    await expect.element(page.getByText('items: note:grab:c=2={"comment":"staged while it finished"}')).toBeVisible()
  })

  it('a stored item that does not decode leaves the others, and with no send handler the items stay staged and alone cannot be sent', async () => {
    const probe = createProbeStorage(
      JSON.stringify({
        text: 'restored text',
        quote: null,
        attachments: [],
        items: [
          {key: 'note:grab:c=1', value: {comment: 'kept'}},
          {key: 1, value: 'a numeric key'},
        ],
      }),
    )
    mountItemsComposer(probe.storage, {})
    await expect.element(page.getByRole('textbox', {name: 'Message'})).toHaveValue('restored text')
    await expect.element(page.getByText('items: note:grab:c=1={"comment":"kept"}')).toBeVisible()

    await userEvent.click(page.getByRole('textbox', {name: 'Message'}))
    await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}{Backspace}')
    await expect.element(page.getByRole('textbox', {name: 'Message'})).toHaveValue('')
    await expect.element(page.getByRole('button', {name: 'Send'})).toBeDisabled()

    await userEvent.keyboard('a typed line')
    await page.getByRole('button', {name: 'Send'}).click()
    await expect.element(page.getByRole('textbox', {name: 'Message'})).toHaveValue('')
    await expect.element(page.getByText('items: note:grab:c=1={"comment":"kept"}')).toBeVisible()
  })
})

describe('composer send morph', () => {
  function StyledHost(props: ParentProps<{connection?: StoryConnectionOptions}>): JSX.Element {
    const chat = createChat({
      threadId: 'composer-send-morph',
      connection: storyConnection(untrack(() => props.connection)),
    })
    return (
      <ChatProvider chat={chat}>
        <ComposerHandlersProvider value={{}}>{props.children}</ComposerHandlersProvider>
      </ChatProvider>
    )
  }

  const SLOW_STREAM: StoryConnectionOptions = {
    chunks: createTextChunks('a long streamed answer that keeps the run busy'),
    chunkDelay: 200,
    runsUntilStopped: true,
  }

  it('shows send when idle and stop only while running with an empty input', async () => {
    mountView(() => (
      <StyledHost connection={SLOW_STREAM}>
        <Composer />
      </StyledHost>
    ))
    const input = page.getByRole('textbox', {name: 'Message'})
    const send = page.getByRole('button', {name: 'Send message'})
    const stop = page.getByRole('button', {name: 'Stop generating'})
    await expect.element(send).toBeVisible()
    await expect.element(stop).not.toBeInTheDocument()
    await userEvent.fill(input, 'first question')
    await userEvent.click(send)
    await expect.element(stop).toBeVisible()
    await expect.element(send).not.toBeInTheDocument()
  })

  it('typing during a run keeps showing stop, never flips back to send, and stop click ends the run', async () => {
    mountView(() => (
      <StyledHost connection={SLOW_STREAM}>
        <Composer />
      </StyledHost>
    ))
    const input = page.getByRole('textbox', {name: 'Message'})
    await userEvent.fill(input, 'first question')
    await userEvent.click(page.getByRole('button', {name: 'Send message'}))
    const stop = page.getByRole('button', {name: 'Stop generating'})
    await expect.element(stop).toBeVisible()
    await userEvent.fill(input, 'follow-up while running')
    await expect.element(stop).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Send message'})).not.toBeInTheDocument()
    await userEvent.click(stop)
    await expect.element(page.getByRole('button', {name: 'Send message'})).toBeVisible()
    await expect.element(input).toHaveValue('follow-up while running')
  })

  it('Escape while the run is stopping passes through and never stops the run a second time', async () => {
    const [state, setState] = createStore({stopRequests: 0, escape: 'no escape yet'})
    const heldStop = Promise.withResolvers<void>()
    const hydration: ChatSessionHydration = {messages: [], messageHarness: {}, lastRun: null, pendingApprovals: []}
    const untilAborted = (signal: AbortSignal | undefined): Promise<void> =>
      new Promise((resolve) => signal?.addEventListener('abort', () => resolve(), {once: true}))
    const heldRunConnection = (callbacks: ChatSessionCallbacks): ChatSessionConnection => ({
      subscribe: async function* (signal) {
        await untilAborted(signal)
        yield* []
      },
      send: async (_messages, _data, signal) => {
        const now = Date.now()
        callbacks.onLifecycle({
          runId: 'held-run',
          phase: 'running',
          startedAt: now,
          finishedAt: null,
          serverNow: now,
          error: null,
        })
        await untilAborted(signal)
      },
      refresh: () => Promise.resolve(hydration),
      close: () => undefined,
    })
    function StoppingHost(): JSX.Element {
      const session = createChatSession({
        sessionId: 'composer-escape-stopping',
        connect: heldRunConnection,
        stop: () => {
          setState('stopRequests', (count) => count + 1)
          return heldStop.promise
        },
        decide: () => Promise.resolve(),
      })
      makeEventListener(window, 'keydown', (event) => {
        if (event.key !== 'Escape') return
        setState('escape', event.defaultPrevented ? 'escape consumed' : 'escape passed through')
      })
      return (
        <ChatProvider chat={session}>
          <ComposerHandlersProvider value={{}}>
            <span>{state.escape}</span>
            <span>{`stop requests: ${state.stopRequests}`}</span>
            <RunSettledIndicator />
            <ComposerPrimitive.Root>
              <ComposerPrimitive.Input aria-label="Message" />
              <ComposerPrimitive.Send>Send</ComposerPrimitive.Send>
              <ComposerPrimitive.Cancel />
            </ComposerPrimitive.Root>
          </ComposerHandlersProvider>
        </ChatProvider>
      )
    }
    mountView(() => <StoppingHost />)
    const input = page.getByRole('textbox', {name: 'Message'})
    await userEvent.fill(input, 'keep running')
    await userEvent.click(page.getByRole('button', {name: 'Send'}))
    await expect.element(page.getByText('run live')).toBeVisible()
    const stop = page.getByRole('button', {name: 'Stop'})
    await userEvent.click(stop)
    await expect.element(page.getByText('stop requests: 1')).toBeVisible()
    await expect.element(stop).toBeDisabled()
    await userEvent.click(input)
    await expect.element(input).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByText('escape passed through')).toBeVisible()
    await expect.element(page.getByText('stop requests: 1')).toBeVisible()
    await expect.element(stop).toBeDisabled()
    heldStop.resolve()
    await expect.element(page.getByText('run settled')).toBeVisible()
    await expect.element(page.getByText('stop requests: 1')).toBeVisible()
  })
})

describe('element preview', () => {
  const XSS_FLAG = '__elementPreviewXssProbe'

  const PROBE_PREFIX = '/conciv-preview-network-probe'

  const HOSTILE_CSS =
    `@import url(${PROBE_PREFIX}/imported.css);` +
    `.capture-form {background-image: url(${PROBE_PREFIX}/sheet-background.png);}` +
    `@font-face {font-family: probe; src: url(${PROBE_PREFIX}/probe.woff2);}`

  const ENTITY_OVERFLOW_CAPTURE: ElementCapture = {
    kind: 'after',
    ts: Date.now(),
    descriptor: {tagName: 'input', accessibleName: 'overflow target', selectorPath: 'input#overflow-target'},
    node: {
      type: 2,
      tagName: 'html',
      attributes: {},
      childNodes: [
        {
          type: 2,
          tagName: 'body',
          attributes: {},
          childNodes: [
            {
              type: 2,
              tagName: 'a',
              attributes: {id: 'overflow-link', href: `&#x110000;javascript:window.${XSS_FLAG} = true`},
              childNodes: [{type: 3, textContent: 'overflowing', id: 1}],
              id: 2,
            },
            {
              type: 2,
              tagName: 'input',
              attributes: {id: 'overflow-target', value: 'overflow-target', 'data-rr-target': 'true'},
              childNodes: [],
              id: 3,
            },
          ],
          id: 4,
        },
      ],
      id: 5,
    },
  }

  const HOSTILE_CAPTURE: ElementCapture = {
    kind: 'after',
    ts: Date.now(),
    descriptor: {tagName: 'input', accessibleName: 'safe target', selectorPath: 'input#safe-target'},
    node: {
      type: 2,
      tagName: 'html',
      attributes: {},
      childNodes: [
        {
          type: 2,
          tagName: 'body',
          attributes: {},
          childNodes: [
            {
              type: 2,
              tagName: 'div',
              attributes: {},
              childNodes: [
                {
                  type: 2,
                  tagName: 'img',
                  attributes: {src: 'x', onerror: `window.${XSS_FLAG} = true`},
                  childNodes: [],
                  id: 1,
                },
                {
                  type: 2,
                  tagName: 'a',
                  attributes: {
                    id: 'hostile-click-link',
                    href: `javascript:window.${XSS_FLAG} = true`,
                    onclick: `window.${XSS_FLAG} = true`,
                  },
                  childNodes: [{type: 3, textContent: 'click me', id: 3}],
                  id: 2,
                },
                {
                  type: 2,
                  tagName: 'a',
                  attributes: {id: 'hostile-tab-link', href: `java\tscript:window.${XSS_FLAG} = true`},
                  childNodes: [{type: 3, textContent: 'click too', id: 9}],
                  id: 10,
                },
                {
                  type: 2,
                  tagName: 'iframe',
                  attributes: {srcdoc: `<script>window.${XSS_FLAG} = true</script>`},
                  childNodes: [],
                  id: 4,
                },
                {
                  type: 2,
                  tagName: 'script',
                  attributes: {},
                  childNodes: [{type: 3, textContent: `window.${XSS_FLAG} = true`, id: 11}],
                  id: 12,
                },
                {
                  type: 2,
                  tagName: 'link',
                  attributes: {rel: 'stylesheet', href: `${PROBE_PREFIX}/linked.css`},
                  childNodes: [],
                  id: 13,
                },
                {
                  type: 2,
                  tagName: 'img',
                  attributes: {id: 'hostile-srcset', srcset: `${PROBE_PREFIX}/srcset.png 1x`},
                  childNodes: [],
                  id: 14,
                },
                {
                  type: 2,
                  tagName: 'div',
                  attributes: {id: 'hostile-inline-style', style: `background-image:url(${PROBE_PREFIX}/inline.png)`},
                  childNodes: [{type: 3, textContent: 'styled', id: 15}],
                  id: 16,
                },
                {
                  type: 2,
                  tagName: 'img',
                  attributes: {id: 'hostile-rr-data', rr_dataURL: `${PROBE_PREFIX}/rr-steal.png`},
                  childNodes: [],
                  id: 17,
                },
                {
                  type: 2,
                  tagName: 'input',
                  attributes: {id: 'safe-target', value: 'safe-target', 'data-rr-target': 'true'},
                  childNodes: [],
                  id: 5,
                },
              ],
              id: 6,
            },
          ],
          id: 7,
        },
      ],
      id: 8,
    },
  }

  const NO_TARGET_CAPTURE: ElementCapture = {
    kind: 'after',
    ts: Date.now(),
    descriptor: {tagName: 'input', role: 'textbox', accessibleName: 'orphaned field', selectorPath: 'input#orphan'},
    node: {
      type: 2,
      tagName: 'html',
      attributes: {},
      childNodes: [
        {
          type: 2,
          tagName: 'body',
          attributes: {},
          childNodes: [
            {type: 2, tagName: 'input', attributes: {id: 'orphan', value: 'no marker'}, childNodes: [], id: 1},
          ],
          id: 2,
        },
      ],
      id: 3,
    },
  }

  type PreviewNode = {
    attributes?: Record<string, unknown>
    childNodes?: PreviewNode[]
  }

  function isPreviewNode(value: unknown): value is PreviewNode {
    return typeof value === 'object' && value !== null
  }

  function findById(node: unknown, id: string): PreviewNode | undefined {
    if (!isPreviewNode(node)) return undefined
    if (node.attributes?.['id'] === id) return node
    for (const child of node.childNodes ?? []) {
      const found = findById(child, id)
      if (found !== undefined) return found
    }
    return undefined
  }

  function replicaFrame(): HTMLIFrameElement {
    const frame = document.querySelector('[role="img"]')
    if (frame === null) throw new Error('the replay frame was never mounted')
    const replicaFrameElement = frame.querySelector('iframe')
    if (replicaFrameElement === null) throw new Error('the replica host inside the frame carries no sandboxed iframe')
    return replicaFrameElement
  }

  function replicaRoot(): Document {
    const replicaDocument = replicaFrame().contentDocument
    if (replicaDocument === null) throw new Error('the sandboxed replica iframe exposes no document')
    return replicaDocument
  }

  function replicaTarget(): HTMLInputElement {
    const view = replicaRoot().defaultView
    if (view === null) throw new Error('the sandboxed replica iframe exposes no window')
    const target = replicaRoot().querySelector('[data-rr-target]')
    if (!(target instanceof view.HTMLInputElement)) {
      throw new Error('the target was not rebuilt into the replica document')
    }
    return target
  }

  it('replays a frozen capture into a sandboxed replica document that still shows the original content and target marker', async () => {
    mountView(() => (
      <ElementPreview.Root capture={ELEMENT_CAPTURE_FIXTURE_FULL} css={ELEMENT_CAPTURE_FIXTURE_CSS}>
        <ElementPreview.Frame />
      </ElementPreview.Root>
    ))

    await expect.element(page.getByRole('img', {name: 'Email'})).not.toHaveAttribute('aria-busy')
    const target = replicaTarget()
    expect(target.getAttribute('data-rr-target')).toBe('true')
    expect(target.value).toBe('ada@example.com')
    expect(target.closest('[inert]')).not.toBeNull()
  })

  it('replays a capture whose node arrived wrapped in a Solid store proxy, same as query-cache data', async () => {
    const [storedCapture] = createStore(ELEMENT_CAPTURE_FIXTURE_FULL)

    mountView(() => (
      <ElementPreview.Root capture={storedCapture} css={ELEMENT_CAPTURE_FIXTURE_CSS}>
        <ElementPreview.Frame />
      </ElementPreview.Root>
    ))

    await expect.element(page.getByRole('img', {name: 'Email'})).not.toHaveAttribute('aria-busy')
    const target = replicaTarget()
    expect(target.getAttribute('data-rr-target')).toBe('true')
    expect(target.value).toBe('ada@example.com')
  })

  it('degrades to the descriptor chips when the capture carries no serialized node', async () => {
    mountView(() => (
      <ElementPreview.Root capture={ELEMENT_CAPTURE_FIXTURE_DESCRIPTOR_ONLY}>
        <ElementPreview.Descriptor />
      </ElementPreview.Root>
    ))

    await expect.element(page.getByText('textbox')).toBeVisible()
    await expect.element(page.getByText('Email')).toBeVisible()
    await expect.element(page.getByText('ada@example.com')).toBeVisible()
  })

  it('shows the already-masked value for a captured password field, never the real value', async () => {
    mountView(() => (
      <ElementPreview.Root capture={ELEMENT_CAPTURE_FIXTURE_MASKED} css={ELEMENT_CAPTURE_FIXTURE_CSS}>
        <ElementPreview.Frame />
      </ElementPreview.Root>
    ))

    await expect.element(page.getByRole('img')).not.toHaveAttribute('aria-busy')
    const target = replicaTarget()
    expect(target.value).toBe('***')
  })

  it('neutralizes a hostile payload before rebuild: no onerror/onclick/javascript: execution, no iframe, safe content still renders', async () => {
    Reflect.deleteProperty(window, XSS_FLAG)

    mountView(() => (
      <ElementPreview.Root capture={HOSTILE_CAPTURE}>
        <ElementPreview.Frame />
      </ElementPreview.Root>
    ))

    await expect.element(page.getByRole('img', {name: 'safe target'})).not.toHaveAttribute('aria-busy')

    expect(Reflect.get(window, XSS_FLAG)).toBeUndefined()
    const target = replicaTarget()
    expect(target.value).toBe('safe-target')
    const replica = replicaRoot()
    expect(replica.querySelector('iframe')).toBeNull()

    const replicaView = replica.defaultView
    if (replicaView === null) throw new Error('the sandboxed replica iframe exposes no window')
    const clickLink = replica.querySelector('#hostile-click-link')
    if (!(clickLink instanceof replicaView.HTMLElement)) throw new Error('the hostile click link was not rebuilt')
    clickLink.click()
    expect(Reflect.get(window, XSS_FLAG)).toBeUndefined()

    const tabLink = replica.querySelector('#hostile-tab-link')
    expect(tabLink?.getAttribute('href')).toBeNull()

    expect(findById(HOSTILE_CAPTURE.node, 'hostile-tab-link')?.attributes?.['href']).toBe(
      `java\tscript:window.${XSS_FLAG} = true`,
    )
  })

  function probeResourceNames(): string[] {
    const names: string[] = []
    const windows: Window[] = [window]
    for (const frame of document.querySelectorAll('iframe')) {
      const view = frame.contentWindow
      if (view !== null) windows.push(view)
    }
    for (const view of windows) {
      for (const entry of view.performance.getEntriesByType('resource')) {
        if (entry.name.includes(PROBE_PREFIX) && !entry.name.includes('sentinel')) names.push(entry.name)
      }
    }
    return names
  }

  it('replays a hostile capture without running its script or fetching a single remote resource', async () => {
    Reflect.deleteProperty(window, XSS_FLAG)

    mountView(() => (
      <ElementPreview.Root capture={HOSTILE_CAPTURE} css={HOSTILE_CSS}>
        <ElementPreview.Frame />
      </ElementPreview.Root>
    ))

    await expect.element(page.getByRole('img', {name: 'safe target'})).not.toHaveAttribute('aria-busy')
    await fetch(`${PROBE_PREFIX}/sentinel`).catch(() => undefined)

    expect(Reflect.get(window, XSS_FLAG)).toBeUndefined()
    expect(probeResourceNames()).toEqual([])
    expect(replicaTarget().value).toBe('safe-target')
    expect(replicaRoot().querySelector('#hostile-rr-data')?.getAttribute('src')).toBeNull()
  })

  function inlinedImageCapture(dataUrl: string): ElementCapture {
    return {
      kind: 'after',
      ts: Date.now(),
      descriptor: {tagName: 'input', accessibleName: 'inlined target', selectorPath: 'input#inlined-target'},
      node: {
        type: 2,
        tagName: 'html',
        attributes: {},
        childNodes: [
          {
            type: 2,
            tagName: 'body',
            attributes: {},
            childNodes: [
              {
                type: 2,
                tagName: 'img',
                attributes: {id: 'inlined-image', src: `${PROBE_PREFIX}/inlined.png`, rr_dataURL: dataUrl},
                childNodes: [],
                id: 1,
              },
              {
                type: 2,
                tagName: 'input',
                attributes: {id: 'inlined-target', value: 'inlined-target', 'data-rr-target': 'true'},
                childNodes: [],
                id: 2,
              },
            ],
            id: 3,
          },
        ],
        id: 4,
      },
    }
  }

  it('replays an image from its inlined rr_dataURL without fetching its remote src', async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 8
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('the canvas exposes no context')
    context.fillStyle = 'rgb(20, 120, 220)'
    context.fillRect(0, 0, 8, 8)
    const dataUrl = canvas.toDataURL('image/webp', 0.8)

    mountView(() => (
      <ElementPreview.Root capture={inlinedImageCapture(dataUrl)}>
        <ElementPreview.Frame />
      </ElementPreview.Root>
    ))

    await expect.element(page.getByRole('img', {name: 'inlined target'})).not.toHaveAttribute('aria-busy')
    await fetch(`${PROBE_PREFIX}/sentinel`).catch(() => undefined)

    const replicaImage = replicaRoot().querySelector('#inlined-image')
    expect(replicaImage?.getAttribute('src')).toBe(dataUrl)
    expect(probeResourceNames()).toEqual([])
  })

  it('keeps rendering when an attribute carries an out-of-range numeric character reference', async () => {
    Reflect.deleteProperty(window, XSS_FLAG)

    mountView(() => (
      <ElementPreview.Root capture={ENTITY_OVERFLOW_CAPTURE}>
        <ElementPreview.Frame />
      </ElementPreview.Root>
    ))

    await expect.element(page.getByRole('img', {name: 'overflow target'})).not.toHaveAttribute('aria-busy')

    expect(Reflect.get(window, XSS_FLAG)).toBeUndefined()
    expect(replicaTarget().value).toBe('overflow-target')
  })

  it('degrades to the descriptor when the rebuilt node has no data-rr-target marker, leaving no invisible frame or busy indicator', async () => {
    mountView(() => (
      <ElementPreview.Root capture={NO_TARGET_CAPTURE}>
        <ElementPreview.Frame />
        <ElementPreview.Descriptor />
      </ElementPreview.Root>
    ))

    await expect.element(page.getByText('orphaned field')).toBeVisible()
    await expect.element(page.getByText('textbox')).toBeVisible()

    expect(document.querySelector('[aria-busy]')).toBeNull()
    expect(document.querySelector('[role="img"]')).toBeNull()
  })
})

describe('model selector', () => {
  function Selector(): JSX.Element {
    const [value, setValue] = createSignal('claude-opus-4-8')
    return (
      <ModelSelector.Root models={HARNESS_MODELS} value={value()} onValueChange={setValue}>
        <ModelSelector.Trigger aria-label="Select model" />
        <ModelSelector.Content>
          <ModelSelector.Search />
          <ModelSelector.List />
        </ModelSelector.Content>
      </ModelSelector.Root>
    )
  }

  function tap(target: Element): void {
    const touch = {bubbles: true, composed: true, button: 0, pointerType: 'touch', isPrimary: true}
    target.dispatchEvent(new PointerEvent('pointerdown', touch))
    target.dispatchEvent(new PointerEvent('pointerup', touch))
    target.dispatchEvent(new PointerEvent('click', touch))
  }

  function tapTriggerThenTypeInTheSameTurn(text: string): void {
    const search = page.getByPlaceholder('Search models…').element()
    if (!(search instanceof HTMLInputElement)) throw new Error('Expected the model search to be an input')
    tap(page.getByRole('button', {name: 'Select model'}).element())
    search.value = text
    search.dispatchEvent(new InputEvent('input', {bubbles: true, data: text, inputType: 'insertText'}))
  }

  it('filters the list from keystrokes typed immediately after the trigger click', async () => {
    mountView(() => <Selector />)

    await userEvent.click(page.getByRole('button', {name: 'Select model'}))
    await userEvent.keyboard('haiku')

    await expect.element(page.getByText('Claude Haiku 4.5')).toBeVisible()
    await expect.element(page.getByText('Claude Sonnet 4.6')).not.toBeInTheDocument()
  })

  it('keeps a keystroke typed in the same turn as a touch tap on the trigger', async () => {
    mountView(() => <Selector />)

    tapTriggerThenTypeInTheSameTurn('haiku')

    await expect.element(page.getByText('Claude Haiku 4.5'), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByText('Claude Sonnet 4.6'), {timeout: 2000}).not.toBeInTheDocument()
  })

  function mountLateSelector(): (models: readonly ModelOption[]) => void {
    const [models, setModels] = createSignal<readonly ModelOption[]>([])
    mountView(() => (
      <ModelSelector.Root models={models()}>
        <ModelSelector.Trigger aria-label="Select model" />
        <ModelSelector.Content>
          <ModelSelector.Search />
          <ModelSelector.List />
        </ModelSelector.Content>
      </ModelSelector.Root>
    ))
    return (next) => setModels(next)
  }

  it('lists models that arrive after mount', async () => {
    const deliverModels = mountLateSelector()

    await expect.element(page.getByRole('button', {name: 'Select model'}), {timeout: 2000}).toBeVisible()
    deliverModels(HARNESS_MODELS)
    await userEvent.click(page.getByRole('button', {name: 'Select model'}))

    await expect.element(page.getByText('Claude Sonnet 4.6'), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByText('Claude Haiku 4.5'), {timeout: 2000}).toBeVisible()
  })

  it('keeps every option wholly on screen and clickable when a narrow trigger sits at the right edge', async () => {
    const models: readonly ModelOption[] = [
      {id: 'nano', name: 'Nano', description: 'Smallest and quickest'},
      {id: 'mini', name: 'Mini', description: 'Small and balanced'},
      {id: 'max', name: 'Max', description: 'Largest and most careful'},
    ]
    const [value, setValue] = createSignal('nano')
    mountView(() => (
      <div class="flex justify-end">
        <StyledModelSelector.Root models={models} value={value()} onValueChange={setValue}>
          <StyledModelSelector.Trigger />
          <StyledModelSelector.Content>
            <StyledModelSelector.Search />
            <StyledModelSelector.List />
          </StyledModelSelector.Content>
        </StyledModelSelector.Root>
      </div>
    ))
    const trigger = page.getByRole('button', {name: 'Select model'})

    for (const model of models) {
      const option = page.getByRole('option', {name: `${model.name} ${model.description}`})
      await userEvent.click(trigger)
      await expect.element(option, {timeout: 2000}).toBeInViewport({ratio: 1})
      await userEvent.click(option, {timeout: 2000})
      await expect.element(trigger).toHaveTextContent(model.name)
    }
  })

  it('the pill says Models… while the list is read, offers Retry inside itself after a failed read, and lists the models once Retry reads them', async () => {
    const [read, setRead] = createStore<{status: 'loading' | 'failed' | 'ready'; picked: string | null}>({
      status: 'failed',
      picked: null,
    })
    const models = {
      models: [
        {id: 'nano', name: 'Nano'},
        {id: 'max', name: 'Max'},
      ],
      defaultModel: 'nano',
      harness: {id: 'kit', name: 'Kit', imageInput: false as const, persistentPty: true},
    }
    function PillSelector() {
      const menu = useModelMenu()
      return (
        <HarnessModelSelector
          menu={menu}
          status={read.status}
          models={read.status === 'ready' ? models : undefined}
          value={read.picked}
          onRetry={() => setRead('status', 'loading')}
          onModelChange={(model) => setRead('picked', model)}
        />
      )
    }
    mountView(() => <PillSelector />)
    const menu = () => page.getByRole('dialog', {name: 'Model'})
    const retry = () => menu().getByRole('button', {name: 'Couldn’t load models: Retry loading models'})

    await userEvent.click(page.getByRole('button', {name: 'Couldn’t load models', exact: true}))
    await userEvent.click(retry())
    await expect.element(page.getByRole('button', {name: 'Models…'})).toHaveTextContent('Models…')
    await expect.element(menu().getByRole('status')).toHaveTextContent('Loading models…')
    await expect.element(retry()).not.toBeInTheDocument()

    setRead('status', 'ready')
    await expect.element(menu().getByRole('option', {name: 'Nano'})).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(menu().getByRole('option', {name: 'Max'}))
    await expect.element(page.getByRole('button', {name: 'Select model'})).toHaveTextContent('Max')
  })

  it('lists four models before the rest when the default and the picked model are both among the first', async () => {
    const models = {
      models: [
        {id: 'nano', name: 'Nano'},
        {id: 'mini', name: 'Mini'},
        {id: 'small', name: 'Small'},
        {id: 'medium', name: 'Medium'},
        {id: 'large', name: 'Large'},
        {id: 'max', name: 'Max'},
      ],
      defaultModel: 'nano',
      harness: {id: 'kit', name: 'Kit', imageInput: false as const, persistentPty: true},
    }
    function PillSelector() {
      const menu = useModelMenu()
      return (
        <HarnessModelSelector
          menu={menu}
          status="ready"
          models={models}
          value="mini"
          onRetry={() => undefined}
          onModelChange={() => undefined}
        />
      )
    }
    mountView(() => <PillSelector />)
    const menu = () => page.getByRole('dialog', {name: 'Model'})

    await userEvent.click(page.getByRole('button', {name: 'Select model'}))
    await expect.element(menu().getByRole('option', {name: 'Mini'})).toHaveAttribute('aria-selected', 'true')
    await expect.element(menu().getByRole('option', {name: 'Nano'})).toBeVisible()
    await expect.element(menu().getByRole('option', {name: 'Small'})).toBeVisible()
    await expect.element(menu().getByRole('option', {name: 'Medium'})).toBeVisible()
    await expect.element(menu().getByRole('option', {name: 'Large'})).not.toBeInTheDocument()
    await expect.element(menu().getByText('2 more models, type to search')).toBeVisible()
  })
})

describe('suggestions', () => {
  it('a suggestion the engine refuses reports the refusal through the send error path', async () => {
    const [failures, setFailures] = createStore<string[]>([])
    const hydration: ChatSessionHydration = {messages: [], messageHarness: {}, lastRun: null, pendingApprovals: []}
    const refusingConnection = (): ChatSessionConnection => ({
      subscribe: async function* (signal) {
        await new Promise((resolve) => signal?.addEventListener('abort', resolve, {once: true}))
        yield* []
      },
      send: () => Promise.reject(new Error('the engine refused the send')),
      refresh: () => Promise.resolve(hydration),
      close: () => undefined,
    })
    function RefusingHost(): JSX.Element {
      const session = createChatSession({
        sessionId: 'suggestions-refused',
        connect: refusingConnection,
        stop: () => Promise.resolve(),
        decide: () => Promise.resolve(),
      })
      const handlers: ComposerHandlers = {
        onSendError: (error) => setFailures(failures.length, error instanceof Error ? error.message : String(error)),
      }
      return (
        <ChatProvider chat={session}>
          <ComposerHandlersProvider value={handlers}>
            <ThreadPrimitive.Suggestions each={[{title: 'Explain', label: 'the code', prompt: 'explain the code'}]}>
              {() => (
                <Suggestion.Trigger send>
                  <Suggestion.Title />
                </Suggestion.Trigger>
              )}
            </ThreadPrimitive.Suggestions>
            <ThreadPrimitive.Suggestion prompt="fix the bug" send>
              Fix the bug
            </ThreadPrimitive.Suggestion>
            <For each={failures}>{(failure) => <p>send failed: {failure}</p>}</For>
          </ComposerHandlersProvider>
        </ChatProvider>
      )
    }
    mountView(() => <RefusingHost />)
    const refusals = page.getByText('send failed: the engine refused the send')

    await userEvent.click(page.getByRole('button', {name: 'Explain'}))
    await expect.element(refusals).toBeVisible()
    expect(refusals.elements()).toHaveLength(1)

    await userEvent.click(page.getByRole('button', {name: 'Fix the bug'}))
    await expect.poll(() => refusals.elements()).toHaveLength(2)
  })
})
