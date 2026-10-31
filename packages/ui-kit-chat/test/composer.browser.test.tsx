import 'virtual:uno.css'
import {page, userEvent} from 'vitest/browser'
import {expect, it, vi, describe} from 'vitest'
import {
  type JSX,
  createSignal,
  For,
  Show,
  splitProps,
  untrack,
  type ParentProps,
  type Accessor,
  onMount,
  type Component,
} from 'solid-js'
import {ActionBar} from '../src/primitives/action-bar/action-bar.js'
import {MessageProvider} from '../src/primitives/message/message-context.js'
import type {Turn} from '../src/store/grouping.js'
import {mountView, HARNESS_MODELS} from './helpers.js'
import {createChat, type ConnectConnectionAdapter} from '@conciv/ai/client'
import {ChatEventType} from '@conciv/protocol/chat-event-types'
import {ChatProvider} from '../src/store/chat-context.js'
import {Thread} from '../src/styled/thread.js'
import {ActionRow, ActionButton} from '../src/tools/styled/action-row.js'
import {createTextChunks, storyConnection, type StoryConnectionOptions} from '@conciv/ai/testkit'
import type {SendContent} from '@conciv/protocol/chat-message-types'
import {Chip, ChipGroup, ChipRow} from '../src/tools/styled/chip.js'
import {range} from 'es-toolkit'
import {ComposerActions, ComposerActionsHost} from '../src/primitives/composer/composer-actions.js'
import {render} from '@solidjs/testing-library'
import {Composer as ComposerPrimitive} from '../src/primitives/composer/composer.js'
import {ComposerHandlersProvider, type ComposerHandlers} from '../src/primitives/composer/composer-handlers.js'
import {useComposerContext, type ComposerContextValue} from '../src/primitives/composer/composer-context.js'
import {
  createTextAttachmentAdapter,
  type Attachment,
  type AttachmentAdapter,
  type PendingAttachment,
} from '../src/primitives/attachment/attachment-adapter.js'
import type {WebStorage} from '@conciv/storage-history'
import {Error as ErrorPrimitive} from '../src/primitives/error/error.js'
import {Composer} from '../src/styled/composer.js'
import {TooltipIconButtonSlot} from '@conciv/ui-kit-system'
import {createStore} from 'solid-js/store'
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

describe('action bar copy', () => {
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

  const accept =
    (written: string[]) =>
    (text: string): Promise<void> => {
      written.push(text)
      return Promise.resolve()
    }

  const refuse = (): Promise<void> => Promise.reject(new Error('the document is not focused'))

  function mountCopyAction(writeText: (text: string) => Promise<void>): void {
    mountView((): JSX.Element => (
      <MessageProvider
        value={{
          message: () => TURN,
          index: () => 0,
          pairing: () => ({byCallId: new Map(), hiddenResultIds: new Set()}),
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

  it('does not claim the message was copied when the clipboard refuses', async () => {
    mountCopyAction(refuse)

    await copyButton().click()

    await expect.element(copyButton(), {timeout: 1000}).toHaveAttribute('data-copy-failed')
    expect(copyButton().element().hasAttribute('data-copied')).toBe(false)
  })

  it('keeps the copied state when a second copy re-arms the window', async () => {
    mountCopyAction(accept([]))
    await copyButton().click()
    await expect.element(copyButton(), {timeout: 1000}).toHaveAttribute('data-copied')
    await wait(RE_ARM_AFTER_MS)
    await copyButton().click()
    await wait(PAST_FIRST_DEADLINE_MS)
    await expect.element(copyButton(), {timeout: 300}).toHaveAttribute('data-copied')
  })

  it('drops the copied state once the re-armed window runs out', async () => {
    mountCopyAction(accept([]))
    await copyButton().click()
    await expect.element(copyButton(), {timeout: 1000}).toHaveAttribute('data-copied')
    await wait(RE_ARM_AFTER_MS)
    await copyButton().click()
    await expect.element(copyButton(), {timeout: COPIED_MS * 2}).not.toHaveAttribute('data-copied')
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

  async function mountWithTwoAssistantReplies(): Promise<void> {
    mountView(() => <ComposedThread />)
    await page.getByRole('button', {name: 'ask-one'}).click()
    await expect.element(page.getByText('reply'), {timeout: 2000}).toBeVisible()
    await page.getByRole('button', {name: 'ask-two'}).click()
    await expect.element(page.getByText('reply').nth(1), {timeout: 2000}).toBeVisible()
  }

  it('keeps an autohidden, not-last action bar unreachable by Tab until it becomes active', async () => {
    await mountWithTwoAssistantReplies()

    await expect.element(page.getByRole('button', {name: 'ask-two'})).toHaveFocus()
    await expect.element(page.getByRole('button', {name: 'Copy'}).last()).toBeVisible()

    await userEvent.tab()

    await expect.element(page.getByRole('button', {name: 'Copy'}).last()).toHaveFocus()
  })

  it('restores reachability once the hidden bar becomes active on hover', async () => {
    await mountWithTwoAssistantReplies()

    const firstReplyText = page.getByText('reply').first()
    await firstReplyText.hover({force: true})

    await expect.element(page.getByRole('button', {name: 'Copy'}).first()).toBeVisible()

    await userEvent.tab()

    await expect.element(page.getByRole('button', {name: 'Copy'}).first()).toHaveFocus()
  })
})

describe('action row', () => {
  it('renders allow and deny buttons reachable by role and name', async () => {
    mountView(() => (
      <ActionRow>
        <ActionButton intent="deny">Deny</ActionButton>
        <ActionButton intent="allow">Allow</ActionButton>
      </ActionRow>
    ))

    await expect.element(page.getByRole('button', {name: 'Deny'})).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Allow'})).toBeVisible()
  })

  it('fires onClick for a neutral action button', async () => {
    const onClick = vi.fn()
    mountView(() => <ActionButton onClick={onClick}>Retry</ActionButton>)

    await userEvent.click(page.getByRole('button', {name: 'Retry'}))

    await expect.element(page.getByRole('button', {name: 'Retry'})).toBeVisible()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('respects disabled and does not fire onClick when clicked', async () => {
    const onClick = vi.fn()
    mountView(() => (
      <ActionButton intent="allow" disabled onClick={onClick}>
        Allow
      </ActionButton>
    ))

    const button = page.getByRole('button', {name: 'Allow'})
    await expect.element(button).toBeDisabled()

    await expect(userEvent.click(button, {timeout: 500})).rejects.toThrow()

    await expect.element(button).toBeDisabled()
    expect(onClick).not.toHaveBeenCalled()
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

describe('attachment only user message', () => {
  const GIF_BASE64 = 'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='
  const GIF = `data:image/gif;base64,${GIF_BASE64}`

  function imagePart() {
    return {type: 'image', source: {type: 'data', value: GIF, mimeType: 'image/gif'}} as const
  }

  function withText(): SendContent {
    return {content: [{type: 'text', content: 'here it is'}, imagePart()]}
  }

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

  it('a user message that carries text still renders it', async () => {
    mountView(() => <ThreadHost content={withText} />)

    await page.getByRole('button', {name: 'send'}).click()

    await expect.element(page.getByText('here it is'), {timeout: 2000}).toBeVisible()
  })

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
})

describe('chip', () => {
  it('renders a field chip showing its name and value', async () => {
    const host = mountView(() => (
      <ChipRow>
        <Chip name="role" value="textbox" />
      </ChipRow>
    ))

    await expect.element(page.getByText('role')).toBeVisible()
    await expect.element(page.getByText('textbox')).toBeVisible()
    expect(host.querySelector('dl')).not.toBeNull()
    expect(host.querySelector('dl dt')).not.toBeNull()
    expect(host.querySelector('dl dd')).not.toBeNull()
  })

  it('renders ChipGroup as a plain container, not a definition list', async () => {
    const host = mountView(() => (
      <ChipGroup>
        <Chip kind="pill" value="npm run build" />
      </ChipGroup>
    ))

    await expect.element(page.getByText('npm run build')).toBeVisible()
    expect(host.querySelector('dl')).toBeNull()
  })

  it('renders a pill chip showing its value, reachable by role, with the tooltip reachable by role when set', async () => {
    mountView(() => <Chip kind="pill" value="npm run build" tooltip="Runs the project build script" />)

    const trigger = page.getByRole('button', {name: 'npm run build'})
    await expect.element(trigger).toBeVisible()

    await userEvent.hover(trigger)
    await expect.element(page.getByRole('tooltip', {name: 'Runs the project build script'})).toBeVisible()
  })

  it('renders a field chip with a tooltip inside a ChipGroup, keeping the dl child model valid elsewhere, while still exposing name, value and tooltip', async () => {
    const host = mountView(() => (
      <ChipGroup>
        <Chip kind="field" name="selector" value="#submit" tooltip="The CSS selector that was matched" />
      </ChipGroup>
    ))

    const trigger = page.getByRole('button', {name: 'selector #submit'})
    await expect.element(trigger).toBeVisible()

    await userEvent.hover(trigger)
    await expect.element(page.getByRole('tooltip', {name: 'The CSS selector that was matched'})).toBeVisible()

    expect(host.querySelector('dl')).toBeNull()
    expect(host.querySelector('dt')).toBeNull()
    expect(host.querySelector('dd')).toBeNull()
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

  it('gives each tone its own accessible tooltip content, distinguishing tones without relying on class names', async () => {
    mountView(() => (
      <ChipGroup>
        <Chip kind="pill" tone="neutral" value="idle" tooltip="status: neutral" />
        <Chip kind="pill" tone="accent" value="running" tooltip="status: accent" />
        <Chip kind="pill" tone="success" value="passed" tooltip="status: success" />
        <Chip kind="pill" tone="danger" value="failed" tooltip="status: danger" />
      </ChipGroup>
    ))

    const cases: Array<[string, string]> = [
      ['idle', 'status: neutral'],
      ['running', 'status: accent'],
      ['passed', 'status: success'],
      ['failed', 'status: danger'],
    ]

    for (const [value, tooltip] of cases) {
      await userEvent.hover(page.getByRole('button', {name: value}))
      await expect.element(page.getByRole('tooltip', {name: tooltip})).toBeVisible()
    }
  })
})

describe('composer actions', () => {
  const WIDE_PX = 400
  const ONE_SLOT_PX = 170
  const NO_SLOT_PX = 100
  const LEADING_BUDGET_PX = 220
  const RACE_PX = 230

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

  it('keeps the overflow menu open when leading and trailing regions resize together', async () => {
    const [swapped, setSwapped] = createSignal(false)
    const [picks, setPicks] = createSignal<string[]>(['idle'])
    mountView(() => (
      <>
        <StatusRegion picks={picks()} />
        <Fixture
          width={RACE_PX}
          onOverflowDismissed={() => setPicks((current) => [...current, 'dismissed'])}
          leading={
            <Show when={!swapped()}>
              <Slots count={2} />
            </Show>
          }
          trailing={
            <Show when={swapped()} fallback={<Slots count={1} />}>
              <Slots count={2} />
              <span role="img" aria-label="Wide trailing marker" class="size-8.5 block" />
            </Show>
          }
        >
          <StandardActions />
        </Fixture>
      </>
    ))

    await userEvent.click(trigger())
    await expect.element(compactItem()).toBeVisible()

    setSwapped(true)

    await expect.element(page.getByRole('img', {name: 'Wide trailing marker'})).toBeVisible()
    await expect.element(status()).toHaveTextContent('idle')
    await expect.element(compactItem()).toBeVisible()
  })

  it('opens with Enter, highlights with ArrowDown and returns focus to the trigger on Escape', async () => {
    mountView(() => (
      <Fixture width={NO_SLOT_PX}>
        <StandardActions />
      </Fixture>
    ))

    await expect.element(trigger()).toBeVisible()
    await userEvent.tab()
    await userEvent.tab()
    await expect.element(trigger()).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    await expect.element(compactItem()).toBeVisible()

    await userEvent.keyboard('{ArrowDown}')
    await expect.element(overflowMenu()).toHaveAttribute('aria-activedescendant')

    await userEvent.keyboard('{Escape}')
    await expect.element(overflowMenu()).not.toBeInTheDocument()
    await expect.element(trigger()).toHaveFocus()
  })

  function SwappingMenuAction(props: {alternate: boolean}): JSX.Element {
    const [local] = splitProps(props, ['alternate'])
    return (
      <ComposerActions.Action priority={5}>
        <Show
          when={local.alternate}
          fallback={<ComposerActions.ActionMenuItem label="Menu only action" onSelect={() => undefined} />}
        >
          <ComposerActions.ActionMenuItem label="Alternate action" onSelect={() => undefined} />
        </Show>
      </ComposerActions.Action>
    )
  }

  it('keeps live trailing content mounted when an action swaps its overflow entries', async () => {
    const [alternate, setAlternate] = createSignal(false)
    mountView(() => (
      <Fixture width={WIDE_PX} maxInlineAuto={0} trailing={<input aria-label="Trailing draft" />}>
        <StandardActions />
        <SwappingMenuAction alternate={alternate()} />
      </Fixture>
    ))

    const draft = () => page.getByRole('textbox', {name: 'Trailing draft'})
    await userEvent.fill(draft(), 'kept')
    await expect.element(draft()).toHaveValue('kept')

    setAlternate(true)

    await userEvent.click(trigger())
    await expect.element(page.getByRole('menuitem', {name: 'Alternate action'})).toBeVisible()
    await expect.element(draft()).toHaveValue('kept')
  })
})

describe('composer attachment ops', () => {
  function textFile(body: string, name: string): File {
    return new File([body], name, {type: 'text/plain'})
  }

  function trackedAdapter(onRemove?: (attachment: Attachment) => void): AttachmentAdapter {
    const adapter = createTextAttachmentAdapter()
    return {
      ...adapter,
      remove: async (attachment) => {
        onRemove?.(attachment)
        await adapter.remove(attachment)
      },
    }
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

  function mountComposer(options: {onAdapterRemove?: (attachment: Attachment) => void} = {}): ComposerContextValue {
    let captured: ComposerContextValue | undefined
    render(() => (
      <ChatHost>
        <ComposerPrimitive.Root attachmentAdapter={trackedAdapter(options.onAdapterRemove)}>
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

  it('replaceAttachment releases the displaced attachment through the adapter', async () => {
    const removed: string[] = []
    const composer = mountComposer({onAdapterRemove: (attachment) => removed.push(attachment.name)})
    const id = await composer.addAttachment(textFile('one', 'one.txt'))
    if (!id) throw new Error('expected the attachment to be added')

    await composer.replaceAttachment(id, textFile('uno', 'uno.txt'))

    expect(removed).toEqual(['one.txt'])
    expect(composer.attachments()).toHaveLength(1)
  })

  it('keeps the in-flight replacement out of the attachment list until the swap', async () => {
    const seenBetweenEmissions: number[] = []
    let composer: ComposerContextValue | undefined
    let nextId = 0
    const watchingAdapter: AttachmentAdapter = {
      accept: 'text/plain',
      add: async function* ({file}) {
        nextId += 1
        const pending: PendingAttachment = {
          id: `watched-${nextId}`,
          type: 'document',
          name: file.name,
          contentType: file.type,
          file,
          status: {type: 'running', reason: 'uploading', progress: 0},
        }
        yield pending
        seenBetweenEmissions.push(composer?.attachments().length ?? -1)
        yield {...pending, status: {type: 'requires-action', reason: 'composer-send'}}
      },
      remove: async () => {},
      send: async (attachment) => ({...attachment, status: {type: 'complete'}, content: []}),
    }
    let captured: ComposerContextValue | undefined
    render(() => (
      <ChatHost>
        <ComposerPrimitive.Root attachmentAdapter={watchingAdapter}>
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
    composer = captured
    const id = await composer.addAttachment(textFile('one', 'one.txt'))
    if (!id) throw new Error('expected the attachment to be added')

    await composer.replaceAttachment(id, textFile('uno', 'uno.txt'))

    expect(seenBetweenEmissions).toEqual([1, 1])
    expect(composer.attachments().map((entry) => entry.name)).toEqual(['uno.txt'])
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

  function ComposerHarness(props: {storage?: WebStorage}): JSX.Element {
    return (
      <ComposerPrimitive.Root draftStorage={props.storage} draftKey={DRAFT_KEY}>
        <ComposerPrimitive.Input aria-label="Message" />
        <ComposerPrimitive.Quote />
        <ComposerPrimitive.Send>Send</ComposerPrimitive.Send>
        <ErrorPrimitive.Root>
          <ErrorPrimitive.Message />
        </ErrorPrimitive.Root>
      </ComposerPrimitive.Root>
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

  it('restores the draft when the chat run reports an error', async () => {
    mountView(() => (
      <ChatHost connection={{shouldError: true, error: new Error('the run never started')}}>
        <ComposerHarness />
      </ChatHost>
    ))

    await page.getByRole('textbox', {name: 'Message'}).fill('a message the run refuses')
    await page.getByRole('button', {name: 'Send'}).click()

    await expect.element(page.getByText('the run never started')).toBeVisible()
    await expect.element(page.getByRole('textbox', {name: 'Message'})).toHaveValue('a message the run refuses')
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
})

describe('composer send tooltip slot', () => {
  function ChatHost(
    props: ParentProps<{connection?: StoryConnectionOptions; handlers?: ComposerHandlers}>,
  ): JSX.Element {
    const chat = createChat({
      threadId: 'composer-send-tooltip-slot',
      connection: storyConnection(untrack(() => props.connection)),
    })
    const handlers = untrack(() => props.handlers ?? {})
    return (
      <ChatProvider chat={chat}>
        <ComposerHandlersProvider value={handlers}>{props.children}</ComposerHandlersProvider>
      </ChatProvider>
    )
  }

  function ComposerHarness(): JSX.Element {
    return (
      <ComposerPrimitive.Root>
        <ComposerPrimitive.Input aria-label="Message" />
        <TooltipIconButtonSlot tooltip="Send message">
          {(buttonProps) => <ComposerPrimitive.Send {...buttonProps()}>Send</ComposerPrimitive.Send>}
        </TooltipIconButtonSlot>
      </ComposerPrimitive.Root>
    )
  }

  it('submits the message when a Send wrapped in TooltipIconButtonSlot is clicked', async () => {
    const handlers: ComposerHandlers = {onSend: () => Promise.resolve()}
    mountView(() => (
      <ChatHost handlers={handlers}>
        <ComposerHarness />
      </ChatHost>
    ))

    await page.getByRole('textbox', {name: 'Message'}).fill('clicked through a tooltip icon button slot')
    await page.getByRole('button', {name: 'Send message'}).click()

    await expect.element(page.getByRole('textbox', {name: 'Message'})).toHaveValue('')
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

  it('filters models that arrive after mount', async () => {
    const deliverModels = mountLateSelector()

    await expect.element(page.getByRole('button', {name: 'Select model'}), {timeout: 2000}).toBeVisible()
    deliverModels(HARNESS_MODELS)
    await userEvent.click(page.getByRole('button', {name: 'Select model'}))
    await userEvent.keyboard('sonnet')

    await expect.element(page.getByText('Claude Sonnet 4.6'), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByText('Claude Haiku 4.5'), {timeout: 2000}).not.toBeInTheDocument()
  })

  it('hides the styled model list until the selector is opened', async () => {
    mountView(() => <StyledModelSelector models={HARNESS_MODELS} defaultValue="claude-opus-4-8" searchable />)

    await expect.element(page.getByRole('button', {name: 'Select model'}), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByPlaceholder('Search models…'), {timeout: 2000}).not.toBeVisible()
    await expect.element(page.getByText('Claude Haiku 4.5'), {timeout: 2000}).not.toBeVisible()
  })

  it('reveals and filters the styled model list from keystrokes typed right after the trigger click', async () => {
    mountView(() => <StyledModelSelector models={HARNESS_MODELS} defaultValue="claude-opus-4-8" searchable />)

    await userEvent.click(page.getByRole('button', {name: 'Select model'}))
    await userEvent.keyboard('haiku')

    await expect.element(page.getByPlaceholder('Search models…'), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByText('Claude Haiku 4.5'), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByText('Claude Sonnet 4.6'), {timeout: 2000}).not.toBeInTheDocument()
  })

  const MODELS_WITH_DISABLED: readonly ModelOption[] = [
    ...HARNESS_MODELS,
    {id: 'claude-legacy-3-0', name: 'Claude Legacy 3.0', disabled: true},
  ]

  function DisabledAwareSelector(): JSX.Element {
    return (
      <ModelSelector.Root models={MODELS_WITH_DISABLED} defaultValue="claude-opus-4-8">
        <ModelSelector.Trigger aria-label="Select model" />
        <ModelSelector.Content>
          <ModelSelector.Search />
          <ModelSelector.List />
        </ModelSelector.Content>
      </ModelSelector.Root>
    )
  }

  async function eraseQuery(length: number): Promise<void> {
    for (let stroke = 0; stroke < length; stroke += 1) {
      await userEvent.keyboard('{Backspace}')
    }
  }

  it('filters disabled options out of the list alongside the enabled ones', async () => {
    mountView(() => <DisabledAwareSelector />)

    await userEvent.click(page.getByRole('button', {name: 'Select model'}))
    await expect.element(page.getByText('Claude Legacy 3.0'), {timeout: 2000}).toBeVisible()
    await userEvent.keyboard('sonnet')

    await expect.element(page.getByText('Claude Sonnet 4.6'), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByText('Claude Legacy 3.0'), {timeout: 2000}).not.toBeInTheDocument()
    await expect.element(page.getByText('Claude Haiku 4.5'), {timeout: 2000}).not.toBeInTheDocument()
  })

  it('restores every option, disabled included, when the query is cleared', async () => {
    mountView(() => <DisabledAwareSelector />)

    await userEvent.click(page.getByRole('button', {name: 'Select model'}))
    await userEvent.keyboard('sonnet')
    await expect.element(page.getByText('Claude Legacy 3.0'), {timeout: 2000}).not.toBeInTheDocument()
    await eraseQuery('sonnet'.length)

    await expect.element(page.getByText('Claude Legacy 3.0'), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByText('Claude Haiku 4.5'), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByText('Claude Sonnet 4.6'), {timeout: 2000}).toBeVisible()
  })
})

describe('slot instances', () => {
  function createSlotProbe(label: string): Component {
    const [instances, setInstances] = createSignal(0)
    return () => {
      onMount(() => setInstances(instances() + 1))
      return (
        <span>
          {label} instances: {instances()}
        </span>
      )
    }
  }

  function ChatHost(props: ParentProps): JSX.Element {
    const chat = createChat({threadId: 'slot-instances', connection: storyConnection()})
    return <ChatProvider chat={chat}>{props.children}</ChatProvider>
  }

  async function expectSingleInstance(label: string): Promise<void> {
    await expect.element(page.getByText(`${label} instances: 1`), {timeout: 2000}).toBeVisible()
  }

  it('builds the composer children slot exactly once', async () => {
    const Probe = createSlotProbe('composer children')
    mountView(() => (
      <ChatHost>
        <Composer>
          <Probe />
        </Composer>
      </ChatHost>
    ))

    await expectSingleInstance('composer children')
  })

  it('builds the composer busy slot exactly once', async () => {
    const Probe = createSlotProbe('composer busy')
    mountView(() => (
      <ChatHost>
        <Composer busy={<Probe />} />
      </ChatHost>
    ))

    await expectSingleInstance('composer busy')
  })

  it('builds thread viewport children exactly once', async () => {
    const Probe = createSlotProbe('thread footer')
    mountView(() => (
      <ChatHost>
        <Thread>
          <Thread.Viewport>
            <Thread.Messages />
            <Probe />
          </Thread.Viewport>
        </Thread>
      </ChatHost>
    ))

    await expectSingleInstance('thread footer')
  })

  it('builds thread welcome children exactly once', async () => {
    const Probe = createSlotProbe('thread welcome')
    mountView(() => (
      <ChatHost>
        <Thread>
          <Thread.Viewport>
            <Thread.Welcome>
              <Probe />
            </Thread.Welcome>
            <Thread.Messages />
          </Thread.Viewport>
        </Thread>
      </ChatHost>
    ))

    await expectSingleInstance('thread welcome')
  })

  it('builds thread composer children exactly once', async () => {
    const Probe = createSlotProbe('thread composer region')
    mountView(() => (
      <ChatHost>
        <Thread>
          <Thread.Viewport>
            <Thread.Messages />
          </Thread.Viewport>
          <Thread.Composer>
            <Probe />
          </Thread.Composer>
        </Thread>
      </ChatHost>
    ))

    await expectSingleInstance('thread composer region')
  })

  it('builds the model selector trigger slot exactly once', async () => {
    const Probe = createSlotProbe('trigger children')
    mountView(() => (
      <StyledModelSelector.Root models={HARNESS_MODELS} defaultValue="claude-opus-4-8">
        <StyledModelSelector.Trigger>
          <Probe />
        </StyledModelSelector.Trigger>
      </StyledModelSelector.Root>
    ))

    await expectSingleInstance('trigger children')
  })
})
